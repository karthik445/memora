// ─────────────────────────────────────────────────────────────────────────────
// Structured error hierarchy
//
// All application errors extend AppError.
// Error codes are machine-readable strings for API consumers.
// HTTP status codes are set here, not in route handlers.
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCode =
  // Auth
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'REFRESH_TOKEN_INVALID'
  // Authorization
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TENANT_ACCESS_DENIED'
  | 'INSUFFICIENT_ROLE'
  // Resource
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CONFLICT'
  // Validation
  | 'VALIDATION_ERROR'
  | 'INVALID_FILE_TYPE'
  | 'INVALID_MIME_TYPE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_IMAGE'
  // Upload
  | 'UPLOAD_SESSION_EXPIRED'
  | 'UPLOAD_SESSION_NOT_FOUND'
  | 'DUPLICATE_UPLOAD'
  // Storage
  | 'STORAGE_ERROR'
  | 'PATH_TRAVERSAL_DETECTED'
  // Rate limiting
  | 'RATE_LIMIT_EXCEEDED'
  // Server
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly context?: Record<string, unknown>

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.isOperational = true
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403)
  }
}

export class TenantAccessDeniedError extends AppError {
  constructor() {
    super('TENANT_ACCESS_DENIED', 'Access to this tenant is denied', 403)
  }
}

export class InsufficientRoleError extends AppError {
  constructor(required: string) {
    super('INSUFFICIENT_ROLE', `This action requires role: ${required}`, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} with id "${id}" was not found` : `${resource} was not found`,
      404,
    )
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFLICT', message, 409, context)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 422, context)
  }
}

export class InvalidFileTypeError extends AppError {
  constructor(received: string, allowed: string[]) {
    super('INVALID_FILE_TYPE', `File type "${received}" is not allowed. Allowed: ${allowed.join(', ')}`, 422, {
      received,
      allowed,
    })
  }
}

export class InvalidMimeTypeError extends AppError {
  constructor(received: string) {
    super('INVALID_MIME_TYPE', `MIME type "${received}" is not permitted`, 422, { received })
  }
}

export class FileTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super('FILE_TOO_LARGE', `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB`, 413, {
      maxBytes,
    })
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super('RATE_LIMIT_EXCEEDED', 'Too many requests', 429, {
      retryAfter: retryAfterSeconds,
    })
  }
}

export class DuplicateUploadError extends AppError {
  constructor(idempotencyKey: string) {
    super('DUPLICATE_UPLOAD', 'This file has already been uploaded', 409, { idempotencyKey })
  }
}

export class InternalError extends AppError {
  constructor(message = 'An internal error occurred') {
    super('INTERNAL_ERROR', message, 500)
    this.isOperational = false as unknown as boolean
  }
}
