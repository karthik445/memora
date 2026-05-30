// ─────────────────────────────────────────────────────────────────────────────
// AI Pipeline Job Definitions
//
// All job payloads are typed. Workers import these types for type safety.
// ─────────────────────────────────────────────────────────────────────────────

// ── Stage 1: Thumbnail generation ────────────────────────────────────────────
export interface ThumbnailJobData {
  photoId: string
  tenantId: string
  weddingId: string
  storagePath: string          // relative path to original
  mimeType: string
}

export interface ThumbnailJobResult {
  thumbnailPath: string        // WebP thumbnail (800px max)
  webpPath: string             // Full WebP version
  width: number
  height: number
}

// ── Stage 2: EXIF extraction ─────────────────────────────────────────────────
export interface ExifJobData {
  photoId: string
  tenantId: string
  storagePath: string
}

export interface ExifJobResult {
  takenAt: string | null
  cameraMake: string | null
  cameraModel: string | null
  focalLength: number | null
  aperture: number | null
  iso: number | null
  width: number
  height: number
}

// ── Stage 3: Blur detection ───────────────────────────────────────────────────
export interface BlurDetectionJobData {
  photoId: string
  tenantId: string
  thumbnailPath: string        // run on thumbnail for speed
}

export interface BlurDetectionJobResult {
  isBlur: boolean
  blurScore: number            // Laplacian variance — higher = sharper
  threshold: number
}

// ── Stage 4: CLIP embedding ───────────────────────────────────────────────────
export interface ClipEmbeddingJobData {
  photoId: string
  tenantId: string
  weddingId: string
  thumbnailPath: string
}

export interface ClipEmbeddingJobResult {
  embedding: number[]          // 512-dim float array
  model: string                // model version
}

// ── Stage 5: Duplicate detection ─────────────────────────────────────────────
export interface DuplicateDetectionJobData {
  photoId: string
  tenantId: string
  weddingId: string
  embedding: number[]          // from CLIP stage
}

export interface DuplicateDetectionJobResult {
  isDuplicate: boolean
  duplicateOfId: string | null
  similarityScore: number | null
}

// ── Stage 6: Face detection ───────────────────────────────────────────────────
export interface FaceDetectionJobData {
  photoId: string
  tenantId: string
  thumbnailPath: string
}

export interface FaceDetectionJobResult {
  faces: Array<{
    boundingBox: { x: number; y: number; w: number; h: number }
    confidence: number
    embedding: number[]        // 512-dim InsightFace embedding
  }>
}

// ── Stage 7: Face recognition ─────────────────────────────────────────────────
export interface FaceRecognitionJobData {
  photoId: string
  tenantId: string
  weddingId: string
  faceDetectionId: string
  faceEmbedding: number[]
}

export interface FaceRecognitionJobResult {
  personId: string | null      // matched PersonEmbedding ID
  personLabel: string | null
  confidence: number
}

// ── Stage 8: Aesthetic scoring ────────────────────────────────────────────────
export interface AestheticScoringJobData {
  photoId: string
  tenantId: string
  thumbnailPath: string
}

export interface AestheticScoringJobResult {
  aestheticScore: number       // 0-10 LAION aesthetic predictor
  technicalScore: number       // sharpness + exposure composite
}

// ── Queue names ───────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  THUMBNAIL:     'ai:thumbnail',
  EXIF:          'ai:exif',
  BLUR:          'ai:blur',
  CLIP:          'ai:clip',
  DUPLICATE:     'ai:duplicate',
  FACE_DETECT:   'ai:face-detect',
  FACE_RECOG:    'ai:face-recog',
  AESTHETIC:     'ai:aesthetic',
  CLEANUP:       'storage:cleanup',
} as const

// ── Retry policies per stage ─────────────────────────────────────────────────
// Cheap stages retry more aggressively; expensive GPU stages retry sparingly
export const QUEUE_RETRY_POLICIES = {
  [QUEUE_NAMES.THUMBNAIL]:   { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
  [QUEUE_NAMES.EXIF]:        { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
  [QUEUE_NAMES.BLUR]:        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  [QUEUE_NAMES.CLIP]:        { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
  [QUEUE_NAMES.DUPLICATE]:   { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
  [QUEUE_NAMES.FACE_DETECT]: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  [QUEUE_NAMES.FACE_RECOG]:  { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  [QUEUE_NAMES.AESTHETIC]:   { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
} as const
