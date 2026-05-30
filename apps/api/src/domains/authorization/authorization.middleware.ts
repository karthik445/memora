import type { FastifyRequest, FastifyReply } from 'fastify'
import { Pool } from 'pg'
import { PolicyEngine, type AuthzContext } from '@memora/auth/PolicyEngine.js'
import type { Resource, Action, WeddingRole } from '@memora/auth/permissions.js'
import { UnauthorizedError, ForbiddenError } from '@memora/shared/errors/AppError.js'

// ─────────────────────────────────────────────────────────────────────────────
// Authorization Middleware
//
// Usage in route definitions:
//
//   app.get('/:photoId',
//     { preHandler: [requirePermission('photo', 'read')] },
//     handler
//   )
//
//   app.delete('/:photoId',
//     { preHandler: [requirePermission('photo', 'delete', req => req.params.photoId)] },
//     handler
//   )
// ─────────────────────────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    authzContext: AuthzContext
    authzRole: WeddingRole
  }
}

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
})

const policyEngine = new PolicyEngine(pool)

/**
 * Builds the AuthzContext from the request.
 * Must run AFTER jwtVerify and tenantGuard.
 */
export async function buildAuthzContext(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const jwt = request.user as { sub: string; tenantId: string } | undefined
  if (!jwt?.sub) throw new UnauthorizedError()

  const weddingId =
    (request.params as Record<string, string>)['weddingId'] ??
    (request.query as Record<string, string>)['weddingId']

  request.authzContext = {
    userId: jwt.sub,
    tenantId: jwt.tenantId,
    weddingId,
  }
}

/**
 * Returns a preHandler hook that checks a single permission.
 *
 * @param resource  resource type
 * @param action    action to perform
 * @param getResourceId  optional fn to extract resource instance ID from request
 */
export function requirePermission(
  resource: Resource,
  action: Action,
  getResourceId?: (req: FastifyRequest) => string | undefined,
) {
  return async function permissionGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const ctx = request.authzContext
    if (!ctx) throw new UnauthorizedError()

    const resourceId = getResourceId?.(request)
    const decision = await policyEngine.can(ctx, resource, action, resourceId)

    if (!decision.allowed) {
      request.log.warn(
        {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          resource,
          action,
          reason: decision.reason,
        },
        'Authorization denied',
      )
      throw new ForbiddenError(
        `You do not have permission to ${action} this ${resource}`,
      )
    }

    request.authzRole = decision.role!
  }
}

/**
 * Returns a preHandler that verifies resource ownership (tenant isolation).
 * Run after requirePermission to enforce instance-level isolation.
 */
export function requireOwnership(
  resource: Resource,
  getResourceId: (req: FastifyRequest) => string,
) {
  return async function ownershipGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const ctx = request.authzContext
    if (!ctx) throw new UnauthorizedError()

    const resourceId = getResourceId(request)
    const owned = await policyEngine.verifyOwnership(ctx.tenantId, resource, resourceId)

    if (!owned) {
      // Return 404 not 403 — don't leak resource existence to unauthorized callers
      const { NotFoundError } = await import('@memora/shared/errors/AppError.js')
      throw new NotFoundError(resource, resourceId)
    }
  }
}

export { policyEngine }
