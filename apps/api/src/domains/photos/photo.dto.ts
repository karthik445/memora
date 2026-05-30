import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// MIME type allowlist
//
// Validated at two levels:
//   1. Extension check (fast, first-pass)
//   2. Magic-byte check via file-type library (authoritative)
//
// An attacker who renames "exploit.php" → "photo.jpg" passes extension check
// but fails magic-byte check. Both are required.
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif',
  'tiff', 'tif', 'avif', 'gif',
  // RAW formats
  'raw', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf',
  'sr2', 'dng', 'orf', 'rw2', 'rwl', 'pef', 'ptx',
  'r3d', '3fr', 'raf', 'mef', 'mos', 'mrw', 'x3f',
])

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
  'image/avif',
  'image/gif',
  // RAW files are application/octet-stream or vendor-specific
  'image/x-adobe-dng',
  'image/x-canon-cr2',
  'image/x-canon-cr3',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-olympus-orf',
  'image/x-panasonic-raw',
  'image/x-fuji-raf',
  'image/x-raw',
  'application/octet-stream', // generic RAW fallback — must pass magic-byte check
])

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB

export const UploadPhotoQuerySchema = z.object({
  weddingId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  idempotencyKey: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Idempotency key must be alphanumeric'),
})

export const ListPhotosQuerySchema = z.object({
  weddingId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(100),
  sortBy: z.enum(['createdAt', 'takenAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  filter: z
    .enum(['all', 'favorite', 'must_have', 'rejected', 'blur', 'duplicate', 'unprocessed'])
    .default('all'),
})

export const UpdatePhotoSchema = z.object({
  selectionFlag: z
    .enum(['NONE', 'FAVORITE', 'MUST_HAVE', 'REJECTED'])
    .optional(),
})

export const BulkUpdatePhotosSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1).max(500),
  selectionFlag: z.enum(['NONE', 'FAVORITE', 'MUST_HAVE', 'REJECTED']),
})

export type UploadPhotoQueryDto = z.infer<typeof UploadPhotoQuerySchema>
export type ListPhotosQueryDto = z.infer<typeof ListPhotosQuerySchema>
export type UpdatePhotoDto = z.infer<typeof UpdatePhotoSchema>
export type BulkUpdatePhotosDto = z.infer<typeof BulkUpdatePhotosSchema>
