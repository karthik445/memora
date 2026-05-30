import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PolicyEngine } from '@memora/auth/PolicyEngine.js'
import { hasPermission, roleAtLeast } from '@memora/auth/permissions.js'
import type { Pool } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for PolicyEngine and permission matrix
// ─────────────────────────────────────────────────────────────────────────────

describe('Permission matrix', () => {
  it('STUDIO_OWNER has all photo permissions', () => {
    expect(hasPermission('STUDIO_OWNER', 'photo:create')).toBe(true)
    expect(hasPermission('STUDIO_OWNER', 'photo:delete')).toBe(true)
    expect(hasPermission('STUDIO_OWNER', 'photo:download')).toBe(true)
    expect(hasPermission('STUDIO_OWNER', 'photo:approve')).toBe(true)
  })

  it('FAMILY_MEMBER cannot download photos by default', () => {
    expect(hasPermission('FAMILY_MEMBER', 'photo:download')).toBe(false)
  })

  it('FAMILY_MEMBER can flag photos', () => {
    expect(hasPermission('FAMILY_MEMBER', 'photo:flag')).toBe(true)
  })

  it('FAMILY_MEMBER cannot delete photos', () => {
    expect(hasPermission('FAMILY_MEMBER', 'photo:delete')).toBe(false)
  })

  it('BRIDE can flag but not delete or approve', () => {
    expect(hasPermission('BRIDE', 'photo:flag')).toBe(true)
    expect(hasPermission('BRIDE', 'photo:delete')).toBe(false)
    expect(hasPermission('BRIDE', 'photo:approve')).toBe(false)
  })

  it('ALBUM_DESIGNER can reorder album photos', () => {
    expect(hasPermission('ALBUM_DESIGNER', 'album_photo:reorder')).toBe(true)
  })

  it('ALBUM_DESIGNER cannot flag photos', () => {
    expect(hasPermission('ALBUM_DESIGNER', 'photo:flag')).toBe(false)
  })

  it('EDITOR cannot delete weddings', () => {
    expect(hasPermission('EDITOR', 'wedding:delete')).toBe(false)
  })

  it('PHOTOGRAPHER can manage AI settings', () => {
    expect(hasPermission('PHOTOGRAPHER', 'ai_settings:manage_ai')).toBe(true)
  })

  it('CLIENT roles cannot manage AI settings', () => {
    expect(hasPermission('BRIDE', 'ai_settings:manage_ai')).toBe(false)
    expect(hasPermission('GROOM', 'ai_settings:manage_ai')).toBe(false)
    expect(hasPermission('FAMILY_MEMBER', 'ai_settings:manage_ai')).toBe(false)
  })
})

describe('Role hierarchy', () => {
  it('STUDIO_OWNER is at least PHOTOGRAPHER', () => {
    expect(roleAtLeast('STUDIO_OWNER', 'PHOTOGRAPHER')).toBe(true)
  })

  it('PHOTOGRAPHER is not at least STUDIO_OWNER', () => {
    expect(roleAtLeast('PHOTOGRAPHER', 'STUDIO_OWNER')).toBe(false)
  })

  it('BRIDE and GROOM have equal privilege level', () => {
    expect(roleAtLeast('BRIDE', 'GROOM')).toBe(true)
    expect(roleAtLeast('GROOM', 'BRIDE')).toBe(true)
  })

  it('EDITOR is above FAMILY_MEMBER', () => {
    expect(roleAtLeast('EDITOR', 'FAMILY_MEMBER')).toBe(true)
  })
})

describe('PolicyEngine', () => {
  let engine: PolicyEngine
  let mockPool: Partial<Pool>

  const mockContext = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    weddingId: 'wedding-1',
  }

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    }
    engine = new PolicyEngine(mockPool as Pool)
  })

  it('allows photo:read for PHOTOGRAPHER role', async () => {
    vi.mocked(mockPool.query!)
      .mockResolvedValueOnce({ rows: [{ role: 'PHOTOGRAPHER', expires_at: null }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never) // no overrides

    const decision = await engine.can(mockContext, 'photo', 'read')
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('ROLE_GRANT')
  })

  it('denies photo:delete for FAMILY_MEMBER', async () => {
    vi.mocked(mockPool.query!)
      .mockResolvedValueOnce({ rows: [{ role: 'FAMILY_MEMBER', expires_at: null }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)

    const decision = await engine.can(mockContext, 'photo', 'delete')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('IMPLICIT_DENY')
  })

  it('respects DENY override over role grant', async () => {
    // Role grants photo:read, but override denies it
    vi.mocked(mockPool.query!)
      .mockResolvedValueOnce({ rows: [{ role: 'PHOTOGRAPHER', expires_at: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ effect: 'DENY' }] } as never) // override

    const decision = await engine.can(mockContext, 'photo', 'read', 'photo-123')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('OVERRIDE_DENY')
  })

  it('respects ALLOW override to grant beyond role', async () => {
    // FAMILY_MEMBER cannot download, but has explicit ALLOW override
    vi.mocked(mockPool.query!)
      .mockResolvedValueOnce({ rows: [{ role: 'FAMILY_MEMBER', expires_at: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ effect: 'ALLOW' }] } as never)

    const decision = await engine.can(mockContext, 'photo', 'download', 'photo-123')
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('OVERRIDE_ALLOW')
  })

  it('returns NO_ACCESS when user has no membership', async () => {
    vi.mocked(mockPool.query!)
      .mockResolvedValueOnce({ rows: [] } as never) // no wedding access
      .mockResolvedValueOnce({ rows: [] } as never) // no tenant membership

    const decision = await engine.can(mockContext, 'photo', 'read')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('NO_ACCESS')
  })

  it('denies expired wedding access', async () => {
    const yesterday = new Date(Date.now() - 86400000)
    vi.mocked(mockPool.query!)
      .mockResolvedValueOnce({ rows: [{ role: 'BRIDE', expires_at: yesterday }] } as never)

    const decision = await engine.can(mockContext, 'photo', 'read')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('NO_ACCESS')
  })
})
