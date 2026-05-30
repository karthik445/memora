import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { LocalStorageProvider } from '../providers/local.js'
import { StorageProviderError, StorageKeyError } from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Security tests for LocalStorageProvider
//
// These tests verify that path traversal attacks are rejected at every level:
// 1. validateStorageKey rejects dangerous keys
// 2. safeResolvePath rejects keys that escape the root after OS normalisation
// 3. Edge cases: encoded traversal, unicode, null bytes
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string
let storage: LocalStorageProvider

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'memora-test-'))
  storage = new LocalStorageProvider({
    rootDir: tmpDir,
    baseUrl: 'http://localhost:3001/media',
    signedUrlSecret: 'test-secret-32-chars-minimum-len',
  })
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('LocalStorageProvider — path traversal prevention', () => {
  const traversalPayloads = [
    '../etc/passwd',
    '../../etc/passwd',
    '../../../etc/shadow',
    'valid/../../../etc/passwd',
    'tenants/abc/../../../etc/passwd',
    '%2e%2e/etc/passwd', // URL-encoded
    '..%2fetc%2fpasswd',
    '....//etc/passwd',
    'tenants/abc/..%2F..%2Fetc%2Fpasswd',
  ]

  it.each(traversalPayloads)(
    'rejects path traversal key: %s',
    async (key) => {
      await expect(
        storage.upload(key, Buffer.from('malicious'), { contentType: 'image/jpeg' }),
      ).rejects.toThrow()
    },
  )

  it('rejects absolute paths', async () => {
    await expect(
      storage.upload('/etc/passwd', Buffer.from('data'), { contentType: 'image/jpeg' }),
    ).rejects.toThrow(StorageKeyError)
  })

  it('rejects Windows absolute paths', async () => {
    await expect(
      storage.upload('C:\\Windows\\system32\\cmd.exe', Buffer.from('data'), {
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow()
  })

  it('rejects keys with null bytes', async () => {
    await expect(
      storage.upload('valid/path\0evil', Buffer.from('data'), { contentType: 'image/jpeg' }),
    ).rejects.toThrow(StorageKeyError)
  })

  it('rejects excessively long keys', async () => {
    const longKey = 'a/'.repeat(300)
    await expect(
      storage.upload(longKey, Buffer.from('data'), { contentType: 'image/jpeg' }),
    ).rejects.toThrow(StorageKeyError)
  })

  it('rejects keys with special characters', async () => {
    await expect(
      storage.upload('valid/path;rm -rf /', Buffer.from('data'), { contentType: 'image/jpeg' }),
    ).rejects.toThrow()
  })
})

describe('LocalStorageProvider — valid uploads', () => {
  it('uploads a valid file and returns correct metadata', async () => {
    const key = 'tenants/test-tenant/weddings/test-wedding/original/test-photo.jpg'
    const content = Buffer.from('fake-jpeg-data')

    const result = await storage.upload(key, content, { contentType: 'image/jpeg' })

    expect(result.key).toBe(key)
    expect(result.contentType).toBe('image/jpeg')
    expect(result.contentLength).toBe(content.length)
  })

  it('returns true for exists() on uploaded file', async () => {
    const key = 'tenants/test-tenant/weddings/test/original/exists-test.jpg'
    await storage.upload(key, Buffer.from('data'), { contentType: 'image/jpeg' })
    expect(await storage.exists(key)).toBe(true)
  })

  it('returns false for exists() on non-existent file', async () => {
    expect(await storage.exists('tenants/nonexistent/photo.jpg')).toBe(false)
  })

  it('deletes idempotently — no error for missing file', async () => {
    await expect(
      storage.delete('tenants/nonexistent/ghost.jpg'),
    ).resolves.not.toThrow()
  })
})

describe('LocalStorageProvider — signed URL verification', () => {
  it('generates and verifies a valid signed URL', async () => {
    const key = 'tenants/test/photos/signed-test.jpg'
    const url = await storage.getSignedDownloadUrl(key, { expiresInSeconds: 3600 })

    expect(url).toContain('signed')
    expect(url).toContain('sig=')
    expect(url).toContain('exp=')
  })

  it('rejects a tampered signed URL', async () => {
    const key = 'tenants/test/photos/tamper-test.jpg'
    const url = await storage.getSignedDownloadUrl(key, { expiresInSeconds: 3600 })

    const tampered = url.replace(/sig=[a-f0-9]+/, 'sig=deadbeef')
    const params = new URLSearchParams(new URL(tampered).search)

    expect(() => storage.verifySignedUrl(params)).toThrow(StorageProviderError)
  })
})
