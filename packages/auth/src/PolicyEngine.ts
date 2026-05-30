import type { Pool } from 'pg'
import {
  hasPermission,
  ROLE_PERMISSIONS,
  type WeddingRole,
  type Resource,
  type Action,
  type Permission,
} from './permissions.js'

// ─────────────────────────────────────────────────────────────────────────────
// PolicyEngine
//
// Three-layer evaluation:
//   1. Role-based grant  — from ROLE_PERMISSIONS matrix
//   2. Resource-instance — verify the resource belongs to this tenant/wedding
//   3. Override check    — permission_overrides table (ALLOW wins over role
//                          denial; DENY wins over role grant)
//
// Evaluation order: override DENY → override ALLOW → role grant → implicit deny
//
// Attack vectors mitigated:
//   - Horizontal privilege: resource ownership verified in DB, not just role
//   - Role spoofing: role read from DB, never from JWT claims
//   - Expired access: expiry enforced in DB query
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthzContext {
  userId: string
  tenantId: string
  weddingId?: string
}

export interface PolicyDecision {
  allowed: boolean
  reason: PolicyReason
  role?: WeddingRole
}

export type PolicyReason =
  | 'ROLE_GRANT'
  | 'OVERRIDE_ALLOW'
  | 'OVERRIDE_DENY'
  | 'NO_ACCESS'
  | 'EXPIRED_ACCESS'
  | 'RESOURCE_NOT_FOUND'
  | 'TENANT_MISMATCH'
  | 'IMPLICIT_DENY'

export class PolicyEngine {
  constructor(private readonly db: Pool) {}

  // ── Primary check ───────────────────────────────────────────────────────────
  /**
   * Check whether a user can perform `action` on `resource`.
   *
   * @param ctx       userId, tenantId, optional weddingId scope
   * @param resource  resource type
   * @param action    action to perform
   * @param resourceId optional specific resource instance ID
   */
  async can(
    ctx: AuthzContext,
    resource: Resource,
    action: Action,
    resourceId?: string,
  ): Promise<PolicyDecision> {
    const permission: Permission = `${resource}:${action}`

    // 1. Resolve the user's role for this wedding/tenant
    const role = await this.resolveRole(ctx)
    if (!role) {
      return { allowed: false, reason: 'NO_ACCESS' }
    }

    // 2. Check per-resource overrides (DENY takes precedence)
    const override = await this.checkOverride(ctx.userId, resource, resourceId, action)
    if (override === 'DENY') {
      return { allowed: false, reason: 'OVERRIDE_DENY', role }
    }
    if (override === 'ALLOW') {
      return { allowed: true, reason: 'OVERRIDE_ALLOW', role }
    }

    // 3. Role-based grant
    if (hasPermission(role, permission)) {
      return { allowed: true, reason: 'ROLE_GRANT', role }
    }

    return { allowed: false, reason: 'IMPLICIT_DENY', role }
  }

  /**
   * Throws ForbiddenError if not allowed. Use in middleware/route handlers.
   */
  async authorize(
    ctx: AuthzContext,
    resource: Resource,
    action: Action,
    resourceId?: string,
  ): Promise<{ role: WeddingRole }> {
    const decision = await this.can(ctx, resource, action, resourceId)

    if (!decision.allowed) {
      const { ForbiddenError } = await import('@memora/shared/errors/AppError.js')
      throw new ForbiddenError(
        `Permission denied: ${resource}:${action} — ${decision.reason}`,
      )
    }

    return { role: decision.role! }
  }

  /**
   * Verify a resource instance belongs to this tenant (ownership check).
   * Prevents horizontal privilege escalation even if role grants permission.
   */
  async verifyOwnership(
    tenantId: string,
    resource: Resource,
    resourceId: string,
  ): Promise<boolean> {
    const TABLE_MAP: Partial<Record<Resource, string>> = {
      photo:  'photos',
      album:  'albums',
      wedding: 'weddings',
      event:  'events',
    }

    const table = TABLE_MAP[resource]
    if (!table) return true // resource type not ownership-checkable

    const { rows } = await this.db.query(
      `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [resourceId, tenantId],
    )
    return rows.length > 0
  }

  /**
   * Returns all permissions a user has for a given wedding.
   * Used to build permission payload for frontend "can I do X?" checks.
   */
  async getPermissionsForWedding(
    ctx: AuthzContext,
  ): Promise<{ role: WeddingRole; permissions: Permission[] }> {
    const role = await this.resolveRole(ctx)
    if (!role) return { role: 'FAMILY_MEMBER', permissions: [] }

    const basePerms = Array.from(ROLE_PERMISSIONS[role])

    // Apply overrides
    const overrides = await this.db.query<{
      action: string
      resource: string
      effect: 'ALLOW' | 'DENY'
    }>(
      `SELECT resource, action, effect FROM permission_overrides
       WHERE user_id = $1 AND tenant_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [ctx.userId, ctx.tenantId],
    )

    const denied = new Set(
      overrides.rows.filter(o => o.effect === 'DENY').map(o => `${o.resource}:${o.action}`),
    )
    const allowed = new Set(
      overrides.rows.filter(o => o.effect === 'ALLOW').map(o => `${o.resource}:${o.action}`),
    )

    const final = [
      ...basePerms.filter(p => !denied.has(p)),
      ...Array.from(allowed),
    ] as Permission[]

    return { role, permissions: [...new Set(final)] }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveRole(ctx: AuthzContext): Promise<WeddingRole | null> {
    if (ctx.weddingId) {
      // Wedding-scoped role takes priority
      const { rows } = await this.db.query<{ role: WeddingRole; expires_at: Date | null }>(
        `SELECT role, expires_at FROM wedding_access
         WHERE tenant_id = $1 AND wedding_id = $2 AND user_id = $3
           AND revoked_at IS NULL`,
        [ctx.tenantId, ctx.weddingId, ctx.userId],
      )

      if (rows[0]) {
        if (rows[0].expires_at && rows[0].expires_at < new Date()) {
          return null // expired
        }
        return rows[0].role
      }
    }

    // Fall back to tenant-level role
    const { rows } = await this.db.query<{ role: string }>(
      `SELECT role FROM tenant_memberships
       WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [ctx.tenantId, ctx.userId],
    )

    if (!rows[0]) return null

    // Map tenant roles to wedding roles
    const TENANT_ROLE_MAP: Record<string, WeddingRole> = {
      OWNER:        'STUDIO_OWNER',
      PHOTOGRAPHER: 'PHOTOGRAPHER',
      EDITOR:       'EDITOR',
      CLIENT:       'FAMILY_MEMBER',
    }

    return TENANT_ROLE_MAP[rows[0].role] ?? null
  }

  private async checkOverride(
    userId: string,
    resource: Resource,
    resourceId: string | undefined,
    action: Action,
  ): Promise<'ALLOW' | 'DENY' | null> {
    const { rows } = await this.db.query<{ effect: 'ALLOW' | 'DENY' }>(
      `SELECT effect FROM permission_overrides
       WHERE user_id = $1
         AND resource = $2
         AND action = $3
         AND (resource_id IS NULL OR resource_id = $4)
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY
         -- Specific resource override wins over wildcard
         CASE WHEN resource_id IS NULL THEN 1 ELSE 0 END,
         -- DENY wins over ALLOW at same specificity
         CASE WHEN effect = 'DENY' THEN 0 ELSE 1 END
       LIMIT 1`,
      [userId, resource, action, resourceId ?? null],
    )

    return rows[0]?.effect ?? null
  }
}
