import type { StorageProvider } from './types.js'
import { LocalStorageProvider } from './providers/local.js'
import { S3StorageProvider } from './providers/s3.js'
import { R2StorageProvider } from './providers/r2.js'

// ─────────────────────────────────────────────────────────────────────────────
// StorageFactory
//
// Reads STORAGE_PROVIDER from environment and returns the appropriate provider.
// All configuration is validated at startup — fail fast, not at runtime.
//
// Supported values for STORAGE_PROVIDER:
//   local  → LocalStorageProvider (default, external hard disk)
//   s3     → S3StorageProvider (AWS S3 or S3-compatible)
//   r2     → R2StorageProvider (Cloudflare R2)
// ─────────────────────────────────────────────────────────────────────────────

export type StorageProviderType = 'local' | 's3' | 'r2'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name} (required for STORAGE_PROVIDER=${process.env.STORAGE_PROVIDER ?? 'local'})`,
    )
  }
  return value
}

function createLocalProvider(): LocalStorageProvider {
  return new LocalStorageProvider({
    rootDir: requireEnv('MEDIA_ROOT'),
    baseUrl: requireEnv('MEDIA_BASE_URL'),
    signedUrlSecret: requireEnv('SIGNED_URL_SECRET'),
  })
}

function createS3Provider(): S3StorageProvider {
  return new S3StorageProvider({
    region: requireEnv('AWS_REGION'),
    bucket: requireEnv('AWS_S3_BUCKET'),
    accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    endpoint: process.env['AWS_S3_ENDPOINT'],
    forcePathStyle: process.env['AWS_S3_FORCE_PATH_STYLE'] === 'true',
    publicBaseUrl: process.env['AWS_S3_PUBLIC_BASE_URL'],
  })
}

function createR2Provider(): R2StorageProvider {
  return new R2StorageProvider({
    accountId: requireEnv('CF_R2_ACCOUNT_ID'),
    accessKeyId: requireEnv('CF_R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('CF_R2_SECRET_ACCESS_KEY'),
    bucket: requireEnv('CF_R2_BUCKET'),
    publicDomain: process.env['CF_R2_PUBLIC_DOMAIN'],
  })
}

let _instance: StorageProvider | null = null

/**
 * Returns a singleton storage provider instance.
 * Provider type is determined by the STORAGE_PROVIDER environment variable.
 *
 * Call this once at application startup to validate configuration eagerly.
 */
export function createStorageProvider(): StorageProvider {
  if (_instance) return _instance

  const providerType = (process.env['STORAGE_PROVIDER'] ?? 'local') as StorageProviderType

  switch (providerType) {
    case 'local':
      _instance = createLocalProvider()
      break
    case 's3':
      _instance = createS3Provider()
      break
    case 'r2':
      _instance = createR2Provider()
      break
    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER: "${providerType}". Valid options: local, s3, r2`,
      )
  }

  return _instance
}

/** Reset singleton (used in tests only) */
export function resetStorageProvider(): void {
  _instance = null
}
