-- ─────────────────────────────────────────────────────────────────────────────
-- Event-sourcing for photo selections
-- ─────────────────────────────────────────────────────────────────────────────

-- All possible selection event types
DO $$ BEGIN
  CREATE TYPE selection_event_type AS ENUM (
    -- Photo-level flags
    'PHOTO_FAVORITED',
    'PHOTO_UNFAVORITED',
    'PHOTO_MARKED_MUST_HAVE',
    'PHOTO_UNMARKED_MUST_HAVE',
    'PHOTO_REJECTED',
    'PHOTO_UNREJECTED',
    -- Batch actions
    'PHOTOS_BULK_FLAGGED',
    'PHOTOS_BULK_UNFLAGGED',
    -- Photographer workflow
    'SELECTION_APPROVED',         -- photographer signed off on client selection
    'SELECTION_CHANGE_REQUESTED', -- photographer asks client to revise
    -- Album events
    'PHOTO_ADDED_TO_ALBUM',
    'PHOTO_REMOVED_FROM_ALBUM',
    'ALBUM_PUBLISHED',
    'ALBUM_UNPUBLISHED',
    -- Comments
    'COMMENT_ADDED',
    'COMMENT_DELETED',
    -- AI events (for audit)
    'AI_BLUR_DETECTED',
    'AI_DUPLICATE_DETECTED',
    'AI_FACE_IDENTIFIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Selection Events table ────────────────────────────────────────────────────
-- Append-only. No UPDATE, no DELETE (except hard compliance purge).
-- Every selection change creates a new row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS selection_events (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID            NOT NULL REFERENCES tenants(id),
  wedding_id    UUID            NOT NULL REFERENCES weddings(id),
  photo_id      UUID            REFERENCES photos(id) ON DELETE SET NULL,
  actor_id      UUID            REFERENCES users(id) ON DELETE SET NULL,
  actor_role    wedding_role,
  event_type    selection_event_type NOT NULL,

  -- Rich context payload — extensible without schema changes
  payload       JSONB           NOT NULL DEFAULT '{}',
  -- Examples:
  -- PHOTO_FAVORITED:    { "previous_flag": "NONE" }
  -- PHOTOS_BULK_FLAGGED:{ "photo_ids": [...], "flag": "MUST_HAVE", "count": 12 }
  -- COMMENT_ADDED:      { "comment_id": "...", "body_preview": "Love this one!" }
  -- AI_BLUR_DETECTED:   { "blur_score": 0.12, "threshold": 0.15 }

  -- Correlation: links batch actions together
  correlation_id UUID,
  -- Causation: which event triggered this one (e.g. undo)
  causation_id   UUID            REFERENCES selection_events(id),

  occurred_at   TIMESTAMP       NOT NULL DEFAULT NOW(),
  -- Client-provided timestamp (for offline sync scenarios)
  client_time   TIMESTAMP,

  -- Immutability guarantee: row hash for tamper detection
  -- SHA-256(tenant_id||wedding_id||photo_id||actor_id||event_type||payload||occurred_at)
  row_hash      VARCHAR(64)
);

-- Primary query patterns:
-- 1. Activity feed per wedding: (tenant_id, wedding_id, occurred_at DESC)
-- 2. Photo history:             (tenant_id, photo_id, occurred_at DESC)
-- 3. User activity:             (tenant_id, actor_id, occurred_at DESC)
-- 4. Event type analytics:      (tenant_id, wedding_id, event_type)
CREATE INDEX IF NOT EXISTS idx_sel_events_wedding_time  ON selection_events(tenant_id, wedding_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sel_events_photo         ON selection_events(tenant_id, photo_id, occurred_at DESC) WHERE photo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sel_events_actor         ON selection_events(tenant_id, actor_id, occurred_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sel_events_type          ON selection_events(tenant_id, wedding_id, event_type);
CREATE INDEX IF NOT EXISTS idx_sel_events_correlation   ON selection_events(correlation_id) WHERE correlation_id IS NOT NULL;

-- ── Materialised current selection state ─────────────────────────────────────
-- Derived from the event stream. Updated by trigger after each INSERT.
-- Avoids full scan of event table on every gallery load.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS photo_selection_state (
  photo_id         UUID    PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  tenant_id        UUID    NOT NULL,
  wedding_id       UUID    NOT NULL,
  current_flag     VARCHAR(16) NOT NULL DEFAULT 'NONE',
  last_changed_by  UUID    REFERENCES users(id),
  last_changed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  last_event_id    UUID    REFERENCES selection_events(id),
  change_count     INT     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sel_state_wedding ON photo_selection_state(tenant_id, wedding_id, current_flag);

-- ── Trigger: materialise state after each event ───────────────────────────────

CREATE OR REPLACE FUNCTION materialise_selection_state()
RETURNS TRIGGER AS $$
DECLARE
  new_flag VARCHAR(16);
BEGIN
  -- Only materialise photo-level flag events
  IF NEW.photo_id IS NULL THEN RETURN NEW; END IF;

  new_flag := CASE NEW.event_type
    WHEN 'PHOTO_FAVORITED'           THEN 'FAVORITE'
    WHEN 'PHOTO_UNFAVORITED'         THEN 'NONE'
    WHEN 'PHOTO_MARKED_MUST_HAVE'    THEN 'MUST_HAVE'
    WHEN 'PHOTO_UNMARKED_MUST_HAVE'  THEN 'NONE'
    WHEN 'PHOTO_REJECTED'            THEN 'REJECTED'
    WHEN 'PHOTO_UNREJECTED'          THEN 'NONE'
    ELSE NULL
  END;

  IF new_flag IS NULL THEN RETURN NEW; END IF;

  -- Upsert materialised state
  INSERT INTO photo_selection_state
    (photo_id, tenant_id, wedding_id, current_flag, last_changed_by, last_changed_at, last_event_id, change_count)
  VALUES
    (NEW.photo_id, NEW.tenant_id, NEW.wedding_id, new_flag, NEW.actor_id, NEW.occurred_at, NEW.id, 1)
  ON CONFLICT (photo_id) DO UPDATE SET
    current_flag    = EXCLUDED.current_flag,
    last_changed_by = EXCLUDED.last_changed_by,
    last_changed_at = EXCLUDED.last_changed_at,
    last_event_id   = EXCLUDED.last_event_id,
    change_count    = photo_selection_state.change_count + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_selection_state_materialise
AFTER INSERT ON selection_events
FOR EACH ROW EXECUTE FUNCTION materialise_selection_state();
