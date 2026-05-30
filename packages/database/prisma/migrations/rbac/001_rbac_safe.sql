-- Safe RBAC migration — handles existing schema state
-- The old DB has: wedding_access (without tenant_id/role), no tenants table

-- Create wedding_role enum
DO $$ BEGIN
  CREATE TYPE wedding_role AS ENUM (
    'STUDIO_OWNER', 'PHOTOGRAPHER', 'EDITOR', 'ALBUM_DESIGNER',
    'BRIDE', 'GROOM', 'FAMILY_MEMBER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Drop and recreate wedding_access with correct schema
DROP TABLE IF EXISTS wedding_access CASCADE;

CREATE TABLE wedding_access (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id   INT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         wedding_role NOT NULL DEFAULT 'FAMILY_MEMBER',
  granted_by   INT REFERENCES users(id),
  granted_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMP,
  revoked_at   TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wedding_user_access UNIQUE (wedding_id, user_id)
);

CREATE INDEX idx_wedding_access_wedding  ON wedding_access(wedding_id, role);
CREATE INDEX idx_wedding_access_user     ON wedding_access(user_id);
CREATE INDEX idx_wedding_access_expires  ON wedding_access(expires_at) WHERE expires_at IS NOT NULL;

-- Permission overrides (no tenants FK — old schema has no tenants table)
CREATE TABLE IF NOT EXISTS permission_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource     VARCHAR(64) NOT NULL,
  resource_id  INT,
  action       VARCHAR(64) NOT NULL,
  effect       VARCHAR(8) NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY')),
  granted_by   INT REFERENCES users(id),
  expires_at   TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_permission_override UNIQUE (user_id, resource, resource_id, action)
);

CREATE INDEX IF NOT EXISTS idx_perm_override_user     ON permission_overrides(user_id, resource);
CREATE INDEX IF NOT EXISTS idx_perm_override_resource ON permission_overrides(resource, resource_id);
