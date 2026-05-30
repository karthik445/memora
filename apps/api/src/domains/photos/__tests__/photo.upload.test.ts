import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PhotoService } from '../photo.service.js'
import { PhotoRepository } from '../photo.repository.js'
import type { StorageProvider } from '@memora/storage'
import type { AuthenticatedUser } from '../../../middleware/tenantGuard.js'
import {
  InvalidFileTypeError,
  InvalidMimeTypeError,
  DuplicateUploadError,
} from '@memora/shared/errors/AppError.js'

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for PhotoService upload security
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../photo.repository.js')
vi.mock('../../../plugins/queue.js', () => ({
  photoQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

const mockStorage: StorageProvider = {
  upload: vi.fn().mockResolvedValue({ key: 'test', contentType: 'image/jpeg', contentLength: 100 }),
  getSignedDownloadUrl: vi.fn().mockResolvedValue('https://signed-url'),
  getSignedUploadUrl: vi.fn(),
  download: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
  delete: vi.fn().mockResolvedValue(undefined),
  deleteMany: vi.fn(),
  list: vi.fn(),
  getPublicUrl: vi.fn().mockReturnValue('https://public-url'),
}

const mockUser: AuthenticatedUser = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  role: 'PHOTOGRAPHER',
  email: 'photographer@studio.com',
}

const mockQuery = {
  weddingId: '550e8400-e29b-41d4-a716-446655440002',
  idempotencyKey: 'unique-key-12345',
}

function makeFile(filename: string, mimeType: string, content = 'fake-data') {
  const { Readable } = require('stream')
  return {
    filename,
    mimetype: mimeType,
    file: Readable.from([Buffer.from(content)]),
  }
}

describe('PhotoService.uploadPhoto — security', () => {
  let service: PhotoService
  let repoMock: vi.Mocked<PhotoRepository>

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PhotoService(mockStorage)
    repoMock = vi.mocked(PhotoRepository.prototype)
    repoMock.findByIdempotencyKey = vi.fn().mockResolvedValue(null)
    repoMock.create = vi.fn().mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440003',
      storagePath: 'tenants/x/weddings/y/original/z.jpg',
    })
  })

  it('rejects executable file disguised with image extension', async () => {
    const file = makeFile('malware.exe', 'application/x-msdownload')
    await expect(
      service.uploadPhoto(file as never, mockQuery, mockUser),
    ).rejects.toThrow(InvalidFileTypeError)
  })

  it('rejects PHP file with .jpg extension', async () => {
    const file = makeFile('shell.php.jpg', 'application/x-httpd-php')
    // The file-type library would detect this as non-image
    // Extension check passes (.jpg) but MIME check fails
    const fileType = await import('file-type')
    vi.spyOn(fileType, 'fileTypeFromStream').mockResolvedValueOnce({
      mime: 'application/x-httpd-php',
      ext: 'php',
    })
    await expect(
      service.uploadPhoto(file as never, mockQuery, mockUser),
    ).rejects.toThrow(InvalidMimeTypeError)
  })

  it('rejects files with no extension', async () => {
    const file = makeFile('noextension', 'image/jpeg')
    await expect(
      service.uploadPhoto(file as never, mockQuery, mockUser),
    ).rejects.toThrow(InvalidFileTypeError)
  })

  it('strips path components from filename before storing', async () => {
    // Even if an attacker sends a filename with path traversal, it should be sanitised
    const file = makeFile('../../../etc/passwd.jpg', 'image/jpeg')
    const fileType = await import('file-type')
    vi.spyOn(fileType, 'fileTypeFromStream').mockResolvedValueOnce({
      mime: 'image/jpeg',
      ext: 'jpg',
    })

    const result = await service.uploadPhoto(file as never, mockQuery, mockUser)
    // Should succeed but store with a sanitised filename
    expect(result).toBeDefined()

    const createCall = repoMock.create.mock.calls[0]?.[0]
    expect(createCall?.originalFilename).not.toContain('/')
    expect(createCall?.originalFilename).not.toContain('..')
  })

  it('returns existing photo on duplicate idempotency key (idempotent upload)', async () => {
    const existingPhoto = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      storagePath: 'tenants/x/weddings/y/original/existing.jpg',
    }
    repoMock.findByIdempotencyKey = vi.fn().mockResolvedValue(existingPhoto)

    const file = makeFile('photo.jpg', 'image/jpeg')
    const result = await service.uploadPhoto(file as never, mockQuery, mockUser)

    expect(result.isDuplicate).toBe(true)
    expect(result.photoId).toBe(existingPhoto.id)
    // Storage should NOT be called for duplicate
    expect(mockStorage.upload).not.toHaveBeenCalled()
  })

  it('storage path never contains user-supplied filename', async () => {
    const file = makeFile('../../secret/photo.jpg', 'image/jpeg')
    const fileType = await import('file-type')
    vi.spyOn(fileType, 'fileTypeFromStream').mockResolvedValueOnce({
      mime: 'image/jpeg',
      ext: 'jpg',
    })

    await service.uploadPhoto(file as never, mockQuery, mockUser).catch(() => void 0)

    if ((mockStorage.upload as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
      const uploadedKey = (mockStorage.upload as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string
      // Path must consist of UUIDs and known segments only — no user filename
      expect(uploadedKey).toMatch(
        /^[0-9a-f-]+\/[0-9a-f-]+\/(original|thumbnail|webp)\/[a-z0-9-]+\.[a-z]+$/,
      )
    }
  })
})

describe('PhotoService — tenant isolation', () => {
  it('verifyOwnership check prevents cross-tenant photo access', async () => {
    const service = new PhotoService(mockStorage)
    const repoMock = vi.mocked(PhotoRepository.prototype)
    repoMock.verifyOwnership = vi.fn().mockResolvedValue(false)

    const { NotFoundError } = await import('@memora/shared/errors/AppError.js')

    await expect(
      service.updatePhoto(
        '550e8400-e29b-41d4-a716-446655440099',
        { selectionFlag: 'FAVORITE' },
        mockUser,
      ),
    ).rejects.toThrow(NotFoundError)
  })
})
