-- ─────────────────────────────────────────────────────────────────────────────
-- RBAC Migration
-- Adds fine-grained role model with wedding-scoped access
-- ─────────────────────────────────────────────────────────────────────────────

-- Extended role enum covering all collaboration personas
DO $$ BEGIN
  CREATE TYPE wedding_role AS ENUM (
    'STUDIO_OWNER',
    'PHOTOGRAPHER',
    'EDITOR',
    'ALBUM_DESIGNER',
    'BRIDE',
    'GROOM',
    'FAMILY_MEMBER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Wedding-scoped access grants
-- A user can have different roles in different weddings
-- e.g. PHOTOGRAPHER in wedding 1, but also FAMILY_MEMBER in wedding 2
CREATE TABLE IF NOT EXISTS wedding_access (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         wedding_role NOT NULL DEFAULT 'FAMILY_MEMBER',
  granted_by   UUID REFERENCES users(id),
  granted_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMP,                        -- optional time-limited access
  revoked_at   TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  -- One active role per user per wedding (can be extended to multi-role later)
  CONSTRAINT uq_wedding_user_access UNIQUE (wedding_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_access_tenant     ON wedding_access(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wedding_access_wedding    ON wedding_access(wedding_id, role);
CREATE INDEX IF NOT EXISTS idx_wedding_access_user       ON wedding_access(user_id);
CREATE INDEX IF NOT EXISTS idx_wedding_access_expires    ON wedding_access(expires_at) WHERE expires_at IS NOT NULL;

-- Permission override table (future: per-resource grants beyond role defaults)
-- e.g. give a specific FAMILY_MEMBER download rights for one event
CREATE TABLE IF NOT EXISTS permission_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource     VARCHAR(64) NOT NULL,   -- 'photo', 'album', 'event', 'wedding'
  resource_id  UUID,                   -- NULL = applies to all resources of this type
  action       VARCHAR(64) NOT NULL,   -- 'download', 'comment', 'flag', etc.
  effect       VARCHAR(8)  NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY')),
  granted_by   UUID REFERENCES users(id),
  expires_at   TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_permission_override UNIQUE (user_id, resource, resource_id, action)
);

CREATE INDEX IF NOT EXISTS idx_perm_override_user     ON permission_overrides(user_id, resource);
CREATE INDEX IF NOT EXISTS idx_perm_override_resource ON permission_overrides(resource, resource_id);
