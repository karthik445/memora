-- Safe event-sourcing migration — no tenants FK dependency

DO $$ BEGIN
  CREATE TYPE selection_event_type AS ENUM (
    'PHOTO_FAVORITED', 'PHOTO_UNFAVORITED',
    'PHOTO_MARKED_MUST_HAVE', 'PHOTO_UNMARKED_MUST_HAVE',
    'PHOTO_REJECTED', 'PHOTO_UNREJECTED',
    'PHOTOS_BULK_FLAGGED', 'PHOTOS_BULK_UNFLAGGED',
    'SELECTION_APPROVED', 'SELECTION_CHANGE_REQUESTED',
    'PHOTO_ADDED_TO_ALBUM', 'PHOTO_REMOVED_FROM_ALBUM',
    'ALBUM_PUBLISHED', 'ALBUM_UNPUBLISHED',
    'COMMENT_ADDED', 'COMMENT_DELETED',
    'AI_BLUR_DETECTED', 'AI_DUPLICATE_DETECTED', 'AI_FACE_IDENTIFIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS selection_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id     INT NOT NULL REFERENCES weddings(id),
  photo_id       INT REFERENCES photos(id) ON DELETE SET NULL,
  actor_id       INT REFERENCES users(id) ON DELETE SET NULL,
  actor_role     wedding_role,
  event_type     selection_event_type NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}',
  correlation_id UUID,
  causation_id   UUID REFERENCES selection_events(id),
  occurred_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  client_time    TIMESTAMP,
  row_hash       VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_sel_events_wedding_time ON selection_events(wedding_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sel_events_photo        ON selection_events(photo_id, occurred_at DESC) WHERE photo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sel_events_actor        ON selection_events(actor_id, occurred_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sel_events_type         ON selection_events(wedding_id, event_type);

CREATE TABLE IF NOT EXISTS photo_selection_state (
  photo_id         INT PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  wedding_id       INT NOT NULL,
  current_flag     VARCHAR(16) NOT NULL DEFAULT 'NONE',
  last_changed_by  INT REFERENCES users(id),
  last_changed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  last_event_id    UUID REFERENCES selection_events(id),
  change_count     INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sel_state_wedding ON photo_selection_state(wedding_id, current_flag);

CREATE OR REPLACE FUNCTION materialise_selection_state()
RETURNS TRIGGER AS $$
DECLARE
  new_flag VARCHAR(16);
BEGIN
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

  INSERT INTO photo_selection_state
    (photo_id, wedding_id, current_flag, last_changed_by, last_changed_at, last_event_id, change_count)
  VALUES
    (NEW.photo_id, NEW.wedding_id, new_flag, NEW.actor_id, NEW.occurred_at, NEW.id, 1)
  ON CONFLICT (photo_id) DO UPDATE SET
    current_flag    = EXCLUDED.current_flag,
    last_changed_by = EXCLUDED.last_changed_by,
    last_changed_at = EXCLUDED.last_changed_at,
    last_event_id   = EXCLUDED.last_event_id,
    change_count    = photo_selection_state.change_count + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_selection_state_materialise ON selection_events;
CREATE TRIGGER trg_selection_state_materialise
AFTER INSERT ON selection_events
FOR EACH ROW EXECUTE FUNCTION materialise_selection_state();
