import { S3StorageProvider, type S3StorageConfig } from './s3.js'
import type { StorageProvider } from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// R2StorageProvider
//
// Cloudflare R2 is S3-compatible with one key difference:
// - No egress fees for bandwidth from R2 to the internet
// - Uses account-specific endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
// - Supports custom domains via Cloudflare Workers (recommended for public URLs)
//
// R2 does NOT support:
// - ACLs (all objects are private by default; use presigned URLs or Cloudflare public bucket)
// - Server-side encryption options (handled automatically)
// ─────────────────────────────────────────────────────────────────────────────

export interface R2StorageConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** Public domain for Cloudflare R2 public bucket, e.g. https://media.memora.app */
  publicDomain?: string
}

export class R2StorageProvider extends S3StorageProvider implements StorageProvider {
  constructor(config: R2StorageConfig) {
    const s3Config: S3StorageConfig = {
      region: 'auto',
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: false,
      publicBaseUrl: config.publicDomain,
    }

    super(s3Config)
  }
}
