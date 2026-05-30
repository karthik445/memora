import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '@memora/shared/errors/AppError.js'

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler
//
// All errors funnel through here. Never returns raw stack traces to clients.
// Differentiates between operational errors (safe to expose) and programming
// errors (log fully, return generic 500).
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId: string
}

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.id

  // ── AppError (operational) ─────────────────────────────────────────────────
  if (error instanceof AppError) {
    if (!error.isOperational) {
      request.log.error({ error, requestId }, 'Unrecoverable application error')
    } else {
      request.log.warn({ code: error.code, requestId }, error.message)
    }

    const response: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.context ? { details: error.context } : {}),
      },
      requestId,
    }

    reply.status(error.statusCode).send(response)
    return
  }

  // ── Zod validation error ───────────────────────────────────────────────────
  if (error instanceof ZodError) {
    request.log.info({ requestId }, 'Validation error')

    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
      requestId,
    }

    reply.status(422).send(response)
    return
  }

  // ── Fastify native errors (400, 404, 405, etc.) ────────────────────────────
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const statusCode = error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500

    if (statusCode < 500) {
      request.log.info({ statusCode, requestId }, error.message)
    } else {
      request.log.error({ error, requestId }, 'Fastify internal error')
    }

    reply.status(statusCode).send({
      error: {
        code: statusCode === 404 ? 'NOT_FOUND' : 'REQUEST_ERROR',
        message: statusCode < 500 ? error.message : 'An internal error occurred',
      },
      requestId,
    })
    return
  }

  // ── Unknown / programming errors ───────────────────────────────────────────
  // Never expose internal error details to clients
  request.log.error({ error, requestId, stack: error.stack }, 'Unhandled error')

  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    },
    requestId,
  })
}
