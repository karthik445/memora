import { createHash } from 'crypto'
import { pipeline } from 'stream/promises'
import { Writable, PassThrough } from 'stream'
import type { MultipartFile } from '@fastify/multipart'
import { fileTypeFromStream } from 'file-type'
import type { Photo } from '@prisma/client'
import { PhotoRepository } from './photo.repository.js'
import type {
  ListPhotosQueryDto,
  UpdatePhotoDto,
  BulkUpdatePhotosDto,
  UploadPhotoQueryDto,
} from './photo.dto.js'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from './photo.dto.js'
import { buildStoragePath, type StorageProvider } from '@memora/storage'
import {
  InvalidFileTypeError,
  InvalidMimeTypeError,
  FileTooLargeError,
  NotFoundError,
  ForbiddenError,
  DuplicateUploadError,
  AppError,
} from '@memora/shared/errors/AppError.js'
import type { PhotoCursorPage } from './photo.repository.js'
import type { AuthenticatedUser } from '../../middleware/tenantGuard.js'
import { photoQueue } from '../../plugins/queue.js'

// ─────────────────────────────────────────────────────────────────────────────
// PhotoService
//
// Handles the full upload pipeline:
//
//   Phase 1 — Validation (in-process, before disk write):
//     a. Extension allowlist check
//     b. Magic-byte MIME type check (file-type library reads first bytes)
//     c. File size enforcement via streaming counter
//     d. Idempotency key check (prevent duplicate ingestion)
//
//   Phase 2 — Storage (streaming, no full-file memory buffer):
//     a. Stream file to storage provider while simultaneously:
//        - Hashing (SHA-256 for checksum/dedup)
//        - Counting bytes (file size enforcement)
//        - Detecting MIME type (first-bytes check)
//     b. Generate server-side storage path (no user input in path)
//
//   Phase 3 — Database record creation
//
//   Phase 4 — AI processing job dispatch (async, never in request lifecycle)
//
// Attack vectors mitigated:
//   - Path traversal: storage path is server-generated, never user-supplied
//   - MIME spoofing: extension AND magic-byte validation
//   - Zip bombs / large files: streaming size counter with hard limit
//   - Duplicate uploads: SHA-256 idempotency key
//   - Tenant isolation: tenantId enforced on every DB operation
//   - Horizontal privilege escalation: ownership verified before updates
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadResult {
  photoId: string
  storagePath: string
  isDuplicate: boolean
}

export class PhotoService {
  private readonly repo = new PhotoRepository()

  constructor(private readonly storage: StorageProvider) {}

  async uploadPhoto(
    file: MultipartFile,
    query: UploadPhotoQueryDto,
    user: AuthenticatedUser,
  ): Promise<UploadResult> {
    // ── Step 1: Extension validation ──────────────────────────────────────────
    const rawExtension = file.filename.split('.').pop()?.toLowerCase() ?? ''
    if (!rawExtension || !ALLOWED_IMAGE_EXTENSIONS.has(rawExtension)) {
      // Consume stream to prevent resource leak
      await drainStream(file.file)
      throw new InvalidFileTypeError(rawExtension, Array.from(ALLOWED_IMAGE_EXTENSIONS))
    }

    // ── Step 2: Idempotency check ─────────────────────────────────────────────
    const existing = await this.repo.findByIdempotencyKey(
      query.idempotencyKey,
      user.tenantId,
    )
    if (existing) {
      await drainStream(file.file)
      // Return the existing record — idempotent success (not an error)
      return {
        photoId: existing.id,
        storagePath: existing.storagePath,
        isDuplicate: true,
      }
    }

    // ── Step 3: Streaming validation + upload ─────────────────────────────────
    // We stream through three concurrent operations:
    //   a. MIME type detection (first ~4100 bytes)
    //   b. SHA-256 hash computation
    //   c. Byte counter for size enforcement
    //
    // Using PassThrough to fork the stream without buffering the entire file.

    const pass1 = new PassThrough()
    const pass2 = new PassThrough()

    // Tee the incoming stream to two consumers
    file.file.pipe(pass1)
    file.file.pipe(pass2)

    // Detect MIME type from magic bytes
    const mimeTypeResult = await fileTypeFromStream(pass1)
    const detectedMime = mimeTypeResult?.mime

    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      await drainStream(pass2)
      throw new InvalidMimeTypeError(detectedMime ?? 'unknown')
    }

    // Generate a server-side storage path
    // photoId is a placeholder here; we create the DB record after upload
    // using the storage path as the anchor
    const tempId = generateTempId()
    const storagePath = buildStoragePath({
      tenantId: user.tenantId,
      weddingId: query.weddingId,
      photoId: tempId,
      extension: rawExtension,
      variant: 'original',
    })

    // Stream to storage while computing hash and checking size
    const { checksum, fileSize } = await streamToStorageWithValidation(
      pass2,
      storagePath,
      this.storage,
      detectedMime,
    )

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      // Delete the partially uploaded file
      await this.storage.delete(storagePath).catch(() => void 0)
      throw new FileTooLargeError(MAX_FILE_SIZE_BYTES)
    }

    // ── Step 4: Database record ────────────────────────────────────────────────
    // Sanitise the original filename — strip path components, keep name only
    const safeFilename = sanitiseFilename(file.filename)

    const photo = await this.repo.create({
      tenantId: user.tenantId,
      weddingId: query.weddingId,
      eventId: query.eventId,
      storagePath,
      originalFilename: safeFilename,
      mimeType: detectedMime,
      fileSize: BigInt(fileSize),
      checksum,
      idempotencyKey: query.idempotencyKey,
      uploadedById: user.userId,
    })

    // ── Step 5: Enqueue AI processing (async — never in request lifecycle) ─────
    await photoQueue.add(
      'process-photo',
      {
        photoId: photo.id,
        tenantId: user.tenantId,
        weddingId: query.weddingId,
        storagePath,
        mimeType: detectedMime,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    )

    return { photoId: photo.id, storagePath, isDuplicate: false }
  }

  async listPhotos(
    query: ListPhotosQueryDto,
    user: AuthenticatedUser,
  ): Promise<PhotoCursorPage & { signedUrls: Record<string, string> }> {
    const page = await this.repo.listWithCursor({
      tenantId: user.tenantId,
      weddingId: query.weddingId,
      eventId: query.eventId,
      cursor: query.cursor,
      limit: query.limit,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      filter: query.filter,
    })

    // Generate signed URLs for all photos in batch
    const signedUrls: Record<string, string> = {}
    await Promise.all(
      page.photos.map(async photo => {
        if (photo.thumbnailPath) {
          signedUrls[`${photo.id}:thumbnail`] = await this.storage.getSignedDownloadUrl(
            photo.thumbnailPath,
            { expiresInSeconds: 3600 },
          )
        }
        signedUrls[`${photo.id}:original`] = await this.storage.getSignedDownloadUrl(
          photo.storagePath,
          { expiresInSeconds: 3600 },
        )
      }),
    )

    return { ...page, signedUrls }
  }

  async getPhoto(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Photo & { signedUrl: string; thumbnailSignedUrl?: string }> {
    const photo = await this.repo.findById(id, user.tenantId)
    if (!photo) throw new NotFoundError('Photo', id)

    const signedUrl = await this.storage.getSignedDownloadUrl(photo.storagePath, {
      expiresInSeconds: 3600,
    })

    const thumbnailSignedUrl = photo.thumbnailPath
      ? await this.storage.getSignedDownloadUrl(photo.thumbnailPath, {
          expiresInSeconds: 3600,
        })
      : undefined

    return { ...photo, signedUrl, thumbnailSignedUrl }
  }

  async updatePhoto(
    id: string,
    dto: UpdatePhotoDto,
    user: AuthenticatedUser,
  ): Promise<Photo> {
    // Verify ownership (tenant isolation)
    const owned = await this.repo.verifyOwnership(id, user.tenantId)
    if (!owned) throw new NotFoundError('Photo', id)

    if (dto.selectionFlag) {
      return this.repo.updateSelectionFlag(id, user.tenantId, dto.selectionFlag)
    }

    throw new AppError('VALIDATION_ERROR', 'No valid fields to update', 422)
  }

  async bulkUpdatePhotos(
    dto: BulkUpdatePhotosDto,
    user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    const updated = await this.repo.bulkUpdateSelectionFlag(
      dto.photoIds,
      user.tenantId,
      dto.selectionFlag,
    )
    return { updated }
  }

  async deletePhoto(id: string, user: AuthenticatedUser): Promise<void> {
    // Only photographers and owners can delete
    if (!['OWNER', 'PHOTOGRAPHER'].includes(user.role)) {
      throw new ForbiddenError('Only photographers can delete photos')
    }

    const photo = await this.repo.findById(id, user.tenantId)
    if (!photo) throw new NotFoundError('Photo', id)

    // Soft-delete DB record first (idempotent, no external side effects)
    await this.repo.softDelete(id, user.tenantId)

    // Schedule storage cleanup as a background job (non-blocking)
    await photoQueue.add(
      'delete-photo-storage',
      {
        tenantId: user.tenantId,
        storagePath: photo.storagePath,
        thumbnailPath: photo.thumbnailPath,
        webpPath: photo.webpPath,
      },
      { attempts: 5, backoff: { type: 'exponential', delay: 10000 } },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Streams a file to storage while simultaneously computing its SHA-256 checksum
 * and enforcing a maximum file size.
 *
 * Uses a Writable transform to avoid buffering the entire file in memory.
 */
async function streamToStorageWithValidation(
  stream: NodeJS.ReadableStream,
  storagePath: string,
  storage: StorageProvider,
  mimeType: string,
): Promise<{ checksum: string; fileSize: number }> {
  const hash = createHash('sha256')
  let fileSize = 0
  let sizeExceeded = false

  const countingStream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      fileSize += chunk.length
      hash.update(chunk)
      if (fileSize > MAX_FILE_SIZE_BYTES) {
        sizeExceeded = true
        cb(new FileTooLargeError(MAX_FILE_SIZE_BYTES))
      } else {
        cb()
      }
    },
  })

  // PassThrough to fork: one fork goes to storage, other to counting
  const storagePass = new PassThrough()
  const countPass = new PassThrough()

  stream.pipe(storagePass)
  stream.pipe(countPass)

  const [uploadResult] = await Promise.all([
    storage.upload(storagePath, storagePass, {
      contentType: mimeType,
    }),
    pipeline(countPass, countingStream).catch(err => {
      if (sizeExceeded) throw err
      throw err
    }),
  ])

  const checksum = hash.digest('hex')

  return { checksum, fileSize }
}

async function drainStream(stream: NodeJS.ReadableStream): Promise<void> {
  for await (const _chunk of stream) {
    // consume and discard
  }
}

function generateTempId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Sanitises an uploaded filename.
 *
 * Strips:
 * - Directory components (path traversal)
 * - Null bytes
 * - Non-printable characters
 * - Sequences that could be shell-interpreted
 *
 * Limits length to 255 characters.
 */
function sanitiseFilename(filename: string): string {
  const basename = filename.split(/[/\\]/).pop() ?? 'unknown'

  return basename
    .replace(/\0/g, '') // null bytes
    .replace(/[^\w.\-\s]/g, '_') // non-word chars except dot, dash, space
    .replace(/\.{2,}/g, '.') // multiple dots (directory traversal)
    .slice(0, 255)
    .trim() || 'unknown'
}
