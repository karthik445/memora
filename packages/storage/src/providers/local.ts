import { createReadStream, createWriteStream } from 'fs'
import { mkdir, unlink, access, readdir, stat, constants } from 'fs/promises'
import { dirname, join, resolve, normalize } from 'path'
import { pipeline } from 'stream/promises'
import { createHash } from 'crypto'
import type { Readable } from 'stream'
import type {
  StorageProvider,
  StorageObject,
  UploadOptions,
  SignedUrlOptions,
  ListOptions,
  ListResult,
} from '../types.js'
import {
  validateStorageKey,
  StorageProviderError,
} from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// LocalStorageProvider
//
// Stores files on the local filesystem under a configured root directory.
// Used for development and self-hosted deployments (e.g. external hard disk).
//
// Security guarantees:
// 1. All paths are resolved via safeResolvePath() which:
//    a. Validates the key (no .., no absolute paths, no null bytes)
//    b. Resolves the absolute path
//    c. Asserts the resolved path is STILL within the configured root
//       (defence-in-depth against OS path normalisation attacks)
// 2. Signed URLs are JWT-signed server-side tokens, not filesystem paths
// 3. Public URLs expose no filesystem structure — served by the API layer
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalStorageConfig {
  /** Absolute root directory for file storage */
  rootDir: string
  /** Base URL for public file serving, e.g. http://localhost:3001/media */
  baseUrl: string
  /** Secret for signing temporary download URLs */
  signedUrlSecret: string
}

export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string
  private readonly baseUrl: string
  private readonly signedUrlSecret: string

  constructor(config: LocalStorageConfig) {
    if (!config.rootDir || !config.baseUrl || !config.signedUrlSecret) {
      throw new StorageProviderError(
        'LocalStorageProvider requires rootDir, baseUrl, and signedUrlSecret',
      )
    }

    this.rootDir = resolve(config.rootDir)
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.signedUrlSecret = config.signedUrlSecret
  }

  // ── Private: safe path resolution ──────────────────────────────────────────

  /**
   * Resolves a storage key to an absolute filesystem path.
   *
   * Throws StorageProviderError if the resolved path escapes the root directory.
   * This is the core path traversal defence.
   */
  private safeResolvePath(key: string): string {
    validateStorageKey(key)

    const normalized = normalize(key)
    const absolutePath = resolve(join(this.rootDir, normalized))

    // Ensure the resolved path is still under rootDir
    // Add trailing sep to prevent "rootDir2" matching "rootDir"
    if (!absolutePath.startsWith(this.rootDir + '/') && absolutePath !== this.rootDir) {
      throw new StorageProviderError(
        `Path traversal detected: key "${key}" resolved outside storage root`,
      )
    }

    return absolutePath
  }

  // ── StorageProvider implementation ─────────────────────────────────────────

  async upload(
    key: string,
    body: Buffer | Readable,
    options: UploadOptions,
  ): Promise<StorageObject> {
    const fullPath = this.safeResolvePath(key)

    try {
      await mkdir(dirname(fullPath), { recursive: true })

      if (Buffer.isBuffer(body)) {
        const { writeFile } = await import('fs/promises')
        await writeFile(fullPath, body)
      } else {
        await pipeline(body as Readable, createWriteStream(fullPath))
      }

      const fileStat = await stat(fullPath)
      const hash = await this.computeFileHash(fullPath)

      return {
        key,
        contentType: options.contentType,
        contentLength: fileStat.size,
        etag: hash,
        lastModified: fileStat.mtime,
        metadata: options.metadata,
      }
    } catch (error) {
      if (error instanceof StorageProviderError) throw error
      throw new StorageProviderError(`Failed to upload file to "${key}"`, error)
    }
  }

  async getSignedDownloadUrl(
    key: string,
    options: SignedUrlOptions = {},
  ): Promise<string> {
    validateStorageKey(key)

    const expiresInSeconds = Math.min(options.expiresInSeconds ?? 3600, 604800) // max 7 days
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds

    // HMAC-SHA256 signature: prevents URL forgery
    const payload = `${key}:${expiresAt}`
    const { createHmac } = await import('crypto')
    const signature = createHmac('sha256', this.signedUrlSecret)
      .update(payload)
      .digest('hex')

    const params = new URLSearchParams({
      key,
      exp: String(expiresAt),
      sig: signature,
      ...(options.contentDisposition
        ? { cd: options.contentDisposition }
        : {}),
    })

    return `${this.baseUrl}/signed?${params.toString()}`
  }

  async getSignedUploadUrl(
    key: string,
    options: UploadOptions & { expiresInSeconds?: number },
  ): Promise<{ url: string; fields?: Record<string, string> }> {
    // For local storage, signed upload URLs are not truly needed —
    // uploads go through the API server which writes to disk directly.
    // We return an internal upload endpoint URL for consistency.
    validateStorageKey(key)

    const expiresInSeconds = options.expiresInSeconds ?? 3600
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
    const { createHmac } = await import('crypto')
    const signature = createHmac('sha256', this.signedUrlSecret)
      .update(`upload:${key}:${expiresAt}`)
      .digest('hex')

    return {
      url: `${this.baseUrl}/upload`,
      fields: {
        key,
        exp: String(expiresAt),
        sig: signature,
        contentType: options.contentType,
      },
    }
  }

  async download(key: string): Promise<Readable> {
    const fullPath = this.safeResolvePath(key)

    try {
      await access(fullPath, constants.R_OK)
    } catch {
      throw new StorageProviderError(`Object not found: "${key}"`)
    }

    return createReadStream(fullPath)
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.safeResolvePath(key)
    try {
      await access(fullPath, constants.F_OK)
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.safeResolvePath(key)
    try {
      await unlink(fullPath)
    } catch (error: unknown) {
      // ENOENT is acceptable — idempotent delete
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return
      }
      throw new StorageProviderError(`Failed to delete "${key}"`, error)
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => this.delete(key)))
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    const prefix = options.prefix ?? ''
    validateStorageKey(prefix || 'placeholder') // validate prefix if provided

    const rootWithPrefix = prefix
      ? this.safeResolvePath(prefix)
      : this.rootDir

    try {
      const entries = await readdir(rootWithPrefix, { withFileTypes: true })
      const keys = entries
        .filter(e => e.isFile())
        .map(e => (prefix ? `${prefix}/${e.name}` : e.name))
        .slice(0, options.limit ?? 1000)

      return {
        keys,
        hasMore: false,
        nextCursor: undefined,
      }
    } catch {
      return { keys: [], hasMore: false }
    }
  }

  getPublicUrl(key: string): string {
    validateStorageKey(key)
    return `${this.baseUrl}/${key}`
  }

  // ── Signed URL verification (used by API layer) ────────────────────────────

  /**
   * Verifies a signed download URL token.
   * Returns the key if valid, throws if expired or tampered.
   */
  verifySignedUrl(params: URLSearchParams): string {
    const key = params.get('key')
    const exp = params.get('exp')
    const sig = params.get('sig')

    if (!key || !exp || !sig) {
      throw new StorageProviderError('Invalid signed URL: missing parameters')
    }

    const expiresAt = parseInt(exp, 10)
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) {
      throw new StorageProviderError('Signed URL has expired')
    }

    const { createHmac } = require('crypto')
    const expectedSig = createHmac('sha256', this.signedUrlSecret)
      .update(`${key}:${expiresAt}`)
      .digest('hex')

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(sig, expectedSig)) {
      throw new StorageProviderError('Signed URL signature is invalid')
    }

    return key
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async computeFileHash(fullPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(fullPath)
      stream.on('data', chunk => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }
}

// Constant-time string comparison — prevents timing oracle attacks on HMAC comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return require('crypto').timingSafeEqual(bufA, bufB)
}
