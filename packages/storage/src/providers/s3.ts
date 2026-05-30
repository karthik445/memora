import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import type { Readable } from 'stream'
import type {
  StorageProvider,
  StorageObject,
  UploadOptions,
  SignedUrlOptions,
  ListOptions,
  ListResult,
} from '../types.js'
import { validateStorageKey, StorageProviderError } from '../types.js'

export interface S3StorageConfig {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Optional custom endpoint for S3-compatible services */
  endpoint?: string
  /** Set to true for path-style URLs (required for MinIO/Ceph) */
  forcePathStyle?: boolean
  /** Base URL for public objects. If not set, uses standard S3 URL. */
  publicBaseUrl?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// S3StorageProvider
//
// Supports: AWS S3, MinIO, Ceph, DigitalOcean Spaces, Backblaze B2 (S3-compat)
// ─────────────────────────────────────────────────────────────────────────────

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBaseUrl?: string

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket
    this.publicBaseUrl = config.publicBaseUrl

    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
    })
  }

  async upload(
    key: string,
    body: Buffer | Readable,
    options: UploadOptions,
  ): Promise<StorageObject> {
    validateStorageKey(key)

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ...(options.contentLength ? { ContentLength: options.contentLength } : {}),
        ...(options.isPublic ? { ACL: 'public-read' } : {}),
        ...(options.metadata ? { Metadata: options.metadata } : {}),
      })

      const result = await this.client.send(command)

      return {
        key,
        contentType: options.contentType,
        contentLength: options.contentLength ?? 0,
        etag: result.ETag?.replace(/"/g, ''),
        metadata: options.metadata,
      }
    } catch (error) {
      throw new StorageProviderError(`S3 upload failed for key "${key}"`, error)
    }
  }

  async getSignedDownloadUrl(
    key: string,
    options: SignedUrlOptions = {},
  ): Promise<string> {
    validateStorageKey(key)

    const expiresInSeconds = Math.min(options.expiresInSeconds ?? 3600, 604800)

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(options.contentDisposition
          ? { ResponseContentDisposition: options.contentDisposition }
          : {}),
      })

      return await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      })
    } catch (error) {
      throw new StorageProviderError(`Failed to generate signed URL for "${key}"`, error)
    }
  }

  async getSignedUploadUrl(
    key: string,
    options: UploadOptions & { expiresInSeconds?: number },
  ): Promise<{ url: string; fields?: Record<string, string> }> {
    validateStorageKey(key)

    const expiresIn = options.expiresInSeconds ?? 3600

    try {
      const { url, fields } = await createPresignedPost(this.client, {
        Bucket: this.bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 0, 500 * 1024 * 1024], // 500 MB max
          ['eq', '$Content-Type', options.contentType],
        ],
        Fields: {
          'Content-Type': options.contentType,
        },
        Expires: expiresIn,
      })

      return { url, fields }
    } catch (error) {
      throw new StorageProviderError(`Failed to generate upload URL for "${key}"`, error)
    }
  }

  async download(key: string): Promise<Readable> {
    validateStorageKey(key)

    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
      const response = await this.client.send(command)

      if (!response.Body) {
        throw new StorageProviderError(`Empty response body for key "${key}"`)
      }

      return response.Body as unknown as Readable
    } catch (error) {
      if (error instanceof StorageProviderError) throw error
      throw new StorageProviderError(`Failed to download "${key}"`, error)
    }
  }

  async exists(key: string): Promise<boolean> {
    validateStorageKey(key)

    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch (error: unknown) {
      if (
        error !== null &&
        typeof error === 'object' &&
        '$metadata' in error &&
        (error as { $metadata: { httpStatusCode?: number } }).$metadata.httpStatusCode === 404
      ) {
        return false
      }
      throw new StorageProviderError(`Failed to check existence of "${key}"`, error)
    }
  }

  async delete(key: string): Promise<void> {
    validateStorageKey(key)

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      )
    } catch (error) {
      throw new StorageProviderError(`Failed to delete "${key}"`, error)
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return

    keys.forEach(validateStorageKey)

    // S3 deleteObjects supports up to 1000 keys per request
    const chunks = chunkArray(keys, 1000)

    for (const chunk of chunks) {
      try {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: chunk.map(Key => ({ Key })),
              Quiet: true,
            },
          }),
        )
      } catch (error) {
        throw new StorageProviderError(`Batch delete failed for ${chunk.length} objects`, error)
      }
    }
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    if (options.prefix) validateStorageKey(options.prefix)

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options.prefix,
        MaxKeys: options.limit ?? 1000,
        ...(options.cursor ? { ContinuationToken: options.cursor } : {}),
      })

      const response = await this.client.send(command)

      return {
        keys: (response.Contents ?? []).map(obj => obj.Key ?? '').filter(Boolean),
        nextCursor: response.NextContinuationToken,
        hasMore: response.IsTruncated ?? false,
      }
    } catch (error) {
      throw new StorageProviderError('Failed to list objects', error)
    }
  }

  getPublicUrl(key: string): string {
    validateStorageKey(key)

    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`
    }

    return `https://${this.bucket}.s3.amazonaws.com/${key}`
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
