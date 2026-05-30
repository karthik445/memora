// ─────────────────────────────────────────────────────────────────────────────
// Permission Matrix
//
// Single source of truth for what each role can do.
// Every permission check in the application derives from this table.
//
// Format: RESOURCE:ACTION
// ─────────────────────────────────────────────────────────────────────────────

export type WeddingRole =
  | 'STUDIO_OWNER'
  | 'PHOTOGRAPHER'
  | 'EDITOR'
  | 'ALBUM_DESIGNER'
  | 'BRIDE'
  | 'GROOM'
  | 'FAMILY_MEMBER'

export type Resource =
  | 'wedding'
  | 'event'
  | 'photo'
  | 'album'
  | 'album_photo'
  | 'comment'
  | 'reaction'
  | 'face_label'
  | 'selection'
  | 'user_access'
  | 'ai_settings'
  | 'export'

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'download'    // full-res download
  | 'flag'        // favorite / must-have / reject
  | 'approve'     // photographer sign-off on client selection
  | 'invite'      // grant access to another user
  | 'revoke'      // remove access
  | 'reorder'     // drag-sort album photos
  | 'publish'     // make album public
  | 'export'      // bulk export / delivery
  | 'manage_ai'   // trigger re-processing, adjust thresholds

export type Permission = `${Resource}:${Action}`

// ─────────────────────────────────────────────────────────────────────────────
// Role → Permission sets
//
// Principle of least privilege:
//   - Roles only have what they need
//   - Additive model — no inherited "deny" flags at this level
//   - Per-resource overrides handled by PolicyEngine (see below)
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<WeddingRole, ReadonlySet<Permission>> = {

  STUDIO_OWNER: new Set<Permission>([
    // Full control over everything in their tenant
    'wedding:create', 'wedding:read', 'wedding:update', 'wedding:delete',
    'event:create', 'event:read', 'event:update', 'event:delete',
    'photo:create', 'photo:read', 'photo:update', 'photo:delete', 'photo:download',
    'photo:flag', 'photo:approve',
    'album:create', 'album:read', 'album:update', 'album:delete', 'album:publish',
    'album_photo:create', 'album_photo:delete', 'album_photo:reorder',
    'comment:create', 'comment:read', 'comment:update', 'comment:delete',
    'reaction:create', 'reaction:delete',
    'face_label:create', 'face_label:update',
    'selection:create', 'selection:read', 'selection:update',
    'user_access:invite', 'user_access:revoke',
    'ai_settings:manage_ai',
    'export:export',
  ]),

  PHOTOGRAPHER: new Set<Permission>([
    // Can manage their own weddings and photos; cannot delete tenant resources
    'wedding:create', 'wedding:read', 'wedding:update',
    'event:create', 'event:read', 'event:update', 'event:delete',
    'photo:create', 'photo:read', 'photo:update', 'photo:delete', 'photo:download',
    'photo:flag', 'photo:approve',
    'album:create', 'album:read', 'album:update', 'album:publish',
    'album_photo:create', 'album_photo:delete', 'album_photo:reorder',
    'comment:create', 'comment:read', 'comment:update',
    'reaction:create', 'reaction:delete',
    'face_label:create', 'face_label:update',
    'selection:create', 'selection:read', 'selection:update',
    'user_access:invite',
    'ai_settings:manage_ai',
    'export:export',
  ]),

  EDITOR: new Set<Permission>([
    // Post-production role — annotates, flags, builds albums. No upload/delete.
    'wedding:read',
    'event:read',
    'photo:read', 'photo:download', 'photo:flag',
    'album:create', 'album:read', 'album:update',
    'album_photo:create', 'album_photo:delete', 'album_photo:reorder',
    'comment:create', 'comment:read', 'comment:update',
    'reaction:create', 'reaction:delete',
    'face_label:update',
    'selection:create', 'selection:read',
    'export:export',
  ]),

  ALBUM_DESIGNER: new Set<Permission>([
    // Designs albums only — no photo management, no selection changes
    'wedding:read',
    'event:read',
    'photo:read', 'photo:download',
    'album:create', 'album:read', 'album:update', 'album:publish',
    'album_photo:create', 'album_photo:delete', 'album_photo:reorder',
    'comment:create', 'comment:read',
    'selection:read',
    'export:export',
  ]),

  BRIDE: new Set<Permission>([
    // Client with full selection rights and comments; no admin actions
    'wedding:read',
    'event:read',
    'photo:read', 'photo:download', 'photo:flag',
    'album:read',
    'comment:create', 'comment:read', 'comment:update',
    'reaction:create', 'reaction:delete',
    'selection:create', 'selection:read', 'selection:update',
  ]),

  GROOM: new Set<Permission>([
    // Same as BRIDE
    'wedding:read',
    'event:read',
    'photo:read', 'photo:download', 'photo:flag',
    'album:read',
    'comment:create', 'comment:read', 'comment:update',
    'reaction:create', 'reaction:delete',
    'selection:create', 'selection:read', 'selection:update',
  ]),

  FAMILY_MEMBER: new Set<Permission>([
    // Read-only + comments + reactions; can flag (for suggestions only)
    'wedding:read',
    'event:read',
    'photo:read', 'photo:flag',
    'album:read',
    'comment:create', 'comment:read',
    'reaction:create', 'reaction:delete',
    'selection:create', 'selection:read',
    // NOTE: download is NOT granted by default — must be via permission_override
  ]),
}

// ─────────────────────────────────────────────────────────────────────────────
// Role hierarchy for "at least as privileged as" checks
// Higher index = more privilege
// ─────────────────────────────────────────────────────────────────────────────
export const ROLE_HIERARCHY: Record<WeddingRole, number> = {
  STUDIO_OWNER:    100,
  PHOTOGRAPHER:     80,
  EDITOR:           60,
  ALBUM_DESIGNER:   50,
  BRIDE:            40,
  GROOM:            40,
  FAMILY_MEMBER:    20,
}

export function roleAtLeast(role: WeddingRole, minimum: WeddingRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum]
}

export function hasPermission(role: WeddingRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission)
}
