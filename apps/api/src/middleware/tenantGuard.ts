import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@memora/database'
import { TenantAccessDeniedError, UnauthorizedError } from '@memora/shared/errors/AppError.js'
import type { TenantRole } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// Tenant Guard Middleware
//
// Enforces tenant isolation at the middleware layer.
//
// Execution order:
// 1. JWT already verified by @fastify/jwt (set on request.user)
// 2. tenantId extracted from URL param or header
// 3. Membership verified: user must be an active member of the tenant
// 4. Role attached to request context for downstream RBAC checks
//
// Attack vectors mitigated:
// - Horizontal privilege escalation (user A accessing user B's tenant data)
// - Tenant enumeration (non-members get same 403 as non-existent tenants)
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string
  tenantId: string
  role: TenantRole
  email: string
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantUser: AuthenticatedUser
  }
}

/**
 * Verifies that the authenticated user is an active member of the requested tenant.
 * Attaches `request.tenantUser` with userId, tenantId, and role.
 *
 * tenantId is sourced from (in priority order):
 * 1. URL param :tenantId
 * 2. X-Tenant-Id header
 *
 * Both paths go through the same membership check.
 */
export async function tenantGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const jwtPayload = request.user as { sub: string; email: string } | undefined

  if (!jwtPayload?.sub) {
    throw new UnauthorizedError()
  }

  const tenantId =
    (request.params as Record<string, string>)['tenantId'] ??
    request.headers['x-tenant-id']

  if (!tenantId || typeof tenantId !== 'string') {
    throw new TenantAccessDeniedError()
  }

  // Validate UUID format to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new TenantAccessDeniedError()
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      tenantId,
      userId: jwtPayload.sub,
      deletedAt: null,
    },
    select: { role: true },
  })

  // Return same error for non-existent tenant and non-member — prevents enumeration
  if (!membership) {
    throw new TenantAccessDeniedError()
  }

  request.tenantUser = {
    userId: jwtPayload.sub,
    tenantId,
    role: membership.role,
    email: jwtPayload.email,
  }
}

/**
 * Creates a role-check hook for use on specific routes.
 * Must be used AFTER tenantGuard.
 */
export function requireRole(...roles: TenantRole[]) {
  return async function roleGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const { InsufficientRoleError } = await import('@memora/shared/errors/AppError.js')

    if (!request.tenantUser) {
      throw new UnauthorizedError()
    }

    if (!roles.includes(request.tenantUser.role)) {
      throw new InsufficientRoleError(roles.join(' or '))
    }
  }
}
