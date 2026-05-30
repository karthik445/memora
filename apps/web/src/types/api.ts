// ── Auth ──────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: TenantRole
}

export interface AuthTokens {
  accessToken: string
  expiresIn: number
}

export interface AuthResult extends AuthTokens {
  user: AuthUser
}

// ── Tenant / Membership ──────────────────────────────────────────────────────
export type TenantRole = 'OWNER' | 'PHOTOGRAPHER' | 'EDITOR' | 'CLIENT'

export interface Tenant {
  id: string
  slug: string
  name: string
  plan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
}

// ── Wedding ───────────────────────────────────────────────────────────────────
export interface Wedding {
  id: string
  tenantId: string
  slug: string
  title: string
  date: string
  coupleNames: string | null
  notes: string | null
  coverPhotoId: string | null
  isArchived: boolean
  createdById: string
  createdAt: string
  updatedAt: string
  _count?: {
    photos: number
    events: number
  }
}

// ── Event ─────────────────────────────────────────────────────────────────────
export interface WeddingEvent {
  id: string
  tenantId: string
  weddingId: string
  name: string
  date: string | null
  location: string | null
  sortOrder: number
}

// ── Photo ─────────────────────────────────────────────────────────────────────
export type PhotoSelectionFlag = 'NONE' | 'FAVORITE' | 'MUST_HAVE' | 'REJECTED'
export type AiJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'

export interface Photo {
  id: string
  tenantId: string
  weddingId: string
  eventId: string | null
  storagePath: string
  thumbnailPath: string | null
  originalFilename: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  takenAt: string | null
  aiStatus: AiJobStatus
  isBlur: boolean
  blurScore: number | null
  isDuplicate: boolean
  selectionFlag: PhotoSelectionFlag
  idempotencyKey: string
  uploadedById: string
  createdAt: string
  updatedAt: string
  // Resolved by API
  signedUrl?: string
  thumbnailSignedUrl?: string
}

export interface PhotoPage {
  photos: Photo[]
  signedUrls: Record<string, string>
  nextCursor: string | null
  hasMore: boolean
}

// ── Album ──────────────────────────────────────────────────────────────────────
export interface Album {
  id: string
  tenantId: string
  weddingId: string
  title: string
  description: string | null
  isPublic: boolean
  shareToken: string
  createdById: string
  createdAt: string
  _count?: { photos: number }
}

// ── Collaboration ─────────────────────────────────────────────────────────────
export interface PresencePeer {
  userId: string
  name: string
  color: string
  viewingPhotoId: string | null
  lastSeen: number
}

export interface PhotoComment {
  id: string
  photoId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
  replies?: PhotoComment[]
}

// ── API error ─────────────────────────────────────────────────────────────────
export interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId: string
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface CursorPage<T> {
  data: T[]
  nextCursor: string | null
  hasMore: boolean
}
