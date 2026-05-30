// ─────────────────────────────────────────────────────────────────────────────
// StorageProvider Interface
//
// All storage operations go through this interface.
// Business logic NEVER imports S3, R2, or fs directly.
// Provider selection is configuration-driven via StorageFactory.
// ─────────────────────────────────────────────────────────────────────────────

import type { Readable } from 'stream'

export interface StorageObject {
  /** Relative key within the storage provider, e.g. "tenants/abc/photos/xyz.jpg" */
  key: string
  /** MIME type */
  contentType: string
  /** File size in bytes */
  contentLength: number
  /** ETag or content hash */
  etag?: string
  /** Last modified timestamp */
  lastModified?: Date
  /** Additional metadata */
  metadata?: Record<string, string>
}

export interface UploadOptions {
  contentType: string
  contentLength?: number
  metadata?: Record<string, string>
  /** If true, the file is publicly readable without a signed URL */
  isPublic?: boolean
}

export interface SignedUrlOptions {
  /** Expiry in seconds. Defaults to 3600 (1 hour). Max 7 days. */
  expiresInSeconds?: number
  /** Content-Disposition header value for download links */
  contentDisposition?: string
}

export interface ListOptions {
  prefix?: string
  limit?: number
  cursor?: string
}

export interface ListResult {
  keys: string[]
  nextCursor?: string
  hasMore: boolean
}

/**
 * StorageProvider — storage abstraction contract.
 *
 * Attack vectors mitigated:
 * - Path traversal: implementations MUST reject keys containing ".." or absolute paths
 * - SSRF via presigned URLs: URL generation is server-side only
 * - Unrestricted upload: contentType and contentLength enforced at provider level
 */
export interface StorageProvider {
  /**
   * Upload a file from a Buffer or Readable stream.
   * Returns the storage key and metadata.
   */
  upload(
    key: string,
    body: Buffer | Readable,
    options: UploadOptions,
  ): Promise<StorageObject>

  /**
   * Generate a presigned download URL for a private object.
   * The URL is time-limited and cryptographically signed.
   */
  getSignedDownloadUrl(
    key: string,
    options?: SignedUrlOptions,
  ): Promise<string>

  /**
   * Generate a presigned upload URL (for direct browser-to-storage uploads).
   * Used in Phase 5 large file pipeline.
   */
  getSignedUploadUrl(
    key: string,
    options: UploadOptions & { expiresInSeconds?: number },
  ): Promise<{ url: string; fields?: Record<string, string> }>

  /**
   * Download an object. Returns a Readable stream.
   */
  download(key: string): Promise<Readable>

  /**
   * Check if a key exists.
   */
  exists(key: string): Promise<boolean>

  /**
   * Delete an object. Idempotent — does not throw if key does not exist.
   */
  delete(key: string): Promise<void>

  /**
   * Delete multiple objects in one operation.
   */
  deleteMany(keys: string[]): Promise<void>

  /**
   * List objects with optional prefix filter and cursor pagination.
   */
  list(options?: ListOptions): Promise<ListResult>

  /**
   * Return the public base URL for the provider (used for public objects only).
   */
  getPublicUrl(key: string): string
}

// ─────────────────────────────────────────────────────────────────────────────
// Secure Path Builder
//
// All storage paths are generated server-side using this builder.
// User-supplied filenames are NEVER used directly as storage paths.
// This is the single source of truth for path generation.
// ─────────────────────────────────────────────────────────────────────────────

export interface PathBuilderOptions {
  tenantId: string
  weddingId: string
  photoId: string
  extension: string // sanitised, lowercase, e.g. "jpg"
  variant?: 'original' | 'thumbnail' | 'webp'
}

/**
 * Builds a deterministic, collision-resistant storage path.
 *
 * Format: {tenantId}/{weddingId}/{variant}/{photoId}.{extension}
 *
 * Security:
 * - No user input used — all values are server-generated UUIDs or sanitised extensions
 * - Path never traverses directory boundaries
 * - Extension is independently validated against allowlist before reaching here
 */
export function buildStoragePath(options: PathBuilderOptions): string {
  const variant = options.variant ?? 'original'
  return `${options.tenantId}/${options.weddingId}/${variant}/${options.photoId}.${options.extension}`
}

/**
 * Validates a storage key.
 *
 * Rejects:
 * - Absolute paths
 * - Path traversal sequences (..)
 * - Null bytes
 * - Keys exceeding 512 characters
 * - Keys with invalid characters outside [a-zA-Z0-9/_.-]
 */
export function validateStorageKey(key: string): void {
  if (!key || key.length === 0) {
    throw new StorageKeyError('Storage key must not be empty')
  }

  if (key.length > 512) {
    throw new StorageKeyError('Storage key exceeds maximum length of 512 characters')
  }

  if (key.startsWith('/') || /^[A-Za-z]:/.test(key)) {
    throw new StorageKeyError('Absolute paths are not permitted as storage keys')
  }

  if (key.includes('..')) {
    throw new StorageKeyError('Path traversal sequences are not permitted in storage keys')
  }

  if (key.includes('\0')) {
    throw new StorageKeyError('Null bytes are not permitted in storage keys')
  }

  if (!/^[a-zA-Z0-9/_.\-]+$/.test(key)) {
    throw new StorageKeyError(`Storage key contains invalid characters: ${key}`)
  }
}

export class StorageKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageKeyError'
  }
}

export class StorageProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'StorageProviderError'
  }
}
