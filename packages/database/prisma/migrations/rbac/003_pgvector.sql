-- ─────────────────────────────────────────────────────────────────────────────
-- pgvector Schema
--
-- Three embedding tables for three search use cases:
--   1. photo_embeddings   — CLIP 512-dim, for semantic search + duplicate detection
--   2. face_embeddings    — InsightFace 512-dim, per detected face instance
--   3. person_embeddings  — InsightFace 512-dim, canonical embedding per person
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure extension is loaded
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1. Photo Embeddings ───────────────────────────────────────────────────────
-- One row per photo. Represents the full-image semantic content.
-- Used for:
--   a) Text-to-image semantic search ("bride laughing", "first dance")
--   b) Near-duplicate detection (cosine similarity > 0.97)
--   c) "More like this" feature
--   d) Aesthetic clustering

CREATE TABLE IF NOT EXISTS photo_embeddings (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id     UUID      NOT NULL UNIQUE REFERENCES photos(id) ON DELETE CASCADE,
  tenant_id    UUID      NOT NULL,
  wedding_id   UUID      NOT NULL,
  -- CLIP ViT-B/32: 512 dims. ViT-L/14: 768 dims. Store as 512 for now.
  embedding    vector(512) NOT NULL,
  model        VARCHAR(64) NOT NULL DEFAULT 'clip-vit-b-32',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- HNSW index — optimal for:
--   - High-recall semantic search
--   - Photos per wedding: up to 50k
--   - Query time: ~1ms for cosine ANN at 50k vectors
--   - Build time: ~30min for 50k vectors (done offline)
--
-- Parameters:
--   m = 16 (connectivity): memory per vector = 2 * m * 4 bytes = 128 bytes
--   ef_construction = 64: build accuracy vs speed tradeoff
CREATE INDEX IF NOT EXISTS idx_photo_emb_hnsw
  ON photo_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Tenant-scoped index for multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_photo_emb_tenant_wedding
  ON photo_embeddings(tenant_id, wedding_id);

-- ── 2. Face Embeddings ────────────────────────────────────────────────────────
-- One row per detected face per photo.
-- Used for:
--   a) Finding all photos containing a specific person
--   b) Face clustering to identify unique individuals
--   c) "Show me all photos with the bride"

CREATE TABLE IF NOT EXISTS face_embeddings (
  id            UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id      UUID       NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tenant_id     UUID       NOT NULL,
  wedding_id    UUID       NOT NULL,
  -- InsightFace ArcFace: 512 dims
  embedding     vector(512) NOT NULL,
  -- Normalised bounding box [x, y, w, h] 0-1
  bbox_x        FLOAT      NOT NULL,
  bbox_y        FLOAT      NOT NULL,
  bbox_w        FLOAT      NOT NULL,
  bbox_h        FLOAT      NOT NULL,
  detection_confidence FLOAT NOT NULL,
  -- Assigned person (NULL until clustering/recognition runs)
  person_id     UUID       REFERENCES person_embeddings(id) ON DELETE SET NULL,
  person_label  VARCHAR(128),
  created_at    TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- IVFFlat index — optimal for:
--   - Large face datasets (200k+ per wedding)
--   - Lower memory than HNSW
--   - nlist = sqrt(n_vectors): 100 for 10k, 447 for 200k
--
-- NOTE: IVFFlat requires training before use. Run after inserting at least
-- nlist * 39 vectors (pgvector requirement).
-- Parameters:
--   lists = 100 (initial): increase to 256 for 200k+ faces
CREATE INDEX IF NOT EXISTS idx_face_emb_ivfflat
  ON face_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_face_emb_photo
  ON face_embeddings(photo_id);
CREATE INDEX IF NOT EXISTS idx_face_emb_tenant_wedding
  ON face_embeddings(tenant_id, wedding_id);
CREATE INDEX IF NOT EXISTS idx_face_emb_person
  ON face_embeddings(person_id) WHERE person_id IS NOT NULL;

-- ── 3. Person Embeddings ──────────────────────────────────────────────────────
-- Canonical embedding per identified individual.
-- Derived by averaging all face embeddings assigned to a person.
-- Used for:
--   a) "Find all photos with this person" → search face_embeddings ANN
--   b) Person label management (who is this person?)
--   c) Cross-wedding recognition (same person at multiple weddings)

CREATE TABLE IF NOT EXISTS person_embeddings (
  id            UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID       NOT NULL,
  label         VARCHAR(128),           -- "Bride", "Mother of the Bride", etc.
  -- Centroid of all face embeddings assigned to this person
  centroid      vector(512),
  face_count    INT        NOT NULL DEFAULT 0,
  is_verified   BOOLEAN    NOT NULL DEFAULT FALSE, -- manually confirmed by photographer
  cover_face_id UUID,                   -- best face photo for thumbnail
  created_at    TIMESTAMP  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_person_emb_ivfflat
  ON person_embeddings
  USING ivfflat (centroid vector_cosine_ops)
  WITH (lists = 50)
  WHERE centroid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_person_emb_tenant
  ON person_embeddings(tenant_id);

-- ── Semantic search helper: text query cache ──────────────────────────────────
-- Caches CLIP text embeddings for common search phrases.
-- Avoids recomputing the same text embedding on every search.

CREATE TABLE IF NOT EXISTS text_embedding_cache (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text   TEXT      NOT NULL UNIQUE,
  embedding    vector(512) NOT NULL,
  model        VARCHAR(64) NOT NULL DEFAULT 'clip-vit-b-32',
  hit_count    INT       NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_text_emb_query ON text_embedding_cache(query_text);

-- ── pgvector configuration ────────────────────────────────────────────────────
-- Set at session level before ANN queries for accuracy tuning
-- Higher ef_search = better recall, slower query
-- SET hnsw.ef_search = 100;   -- default 40
-- SET ivfflat.probes = 10;    -- default 1
