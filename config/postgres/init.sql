CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'client',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weddings (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date TIMESTAMP NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    owner_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table: which users can access which wedding gallery
CREATE TABLE IF NOT EXISTS wedding_access (
    wedding_id INT REFERENCES weddings(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (wedding_id, user_id)
);

CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY,
    wedding_id INT REFERENCES weddings(id) ON DELETE CASCADE,
    -- Relative path under MEDIA_ROOT, e.g. "weddings/42/originals/IMG_001.jpg"
    storage_path VARCHAR(512) NOT NULL,
    -- Relative path to WebP thumbnail, e.g. "weddings/42/thumbs/IMG_001.webp"
    thumbnail_path VARCHAR(512),
    original_filename VARCHAR(512),
    file_size BIGINT,
    width INT,
    height INT,
    taken_at TIMESTAMP,
    is_blur BOOLEAN DEFAULT FALSE,
    blur_score FLOAT,
    is_duplicate BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_must_have BOOLEAN DEFAULT FALSE,
    ai_processed BOOLEAN DEFAULT FALSE,
    -- CLIP 512-dim embedding for similarity search
    embedding vector(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photos_wedding_id ON photos(wedding_id);
CREATE INDEX IF NOT EXISTS idx_photos_embedding ON photos USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS face_tracks (
    id SERIAL PRIMARY KEY,
    photo_id INT REFERENCES photos(id) ON DELETE CASCADE,
    -- Bounding box as [x, y, w, h] normalised 0-1
    bbox JSONB NOT NULL,
    -- 512-dim InsightFace embedding
    face_embedding vector(512),
    person_label VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    photo_id INT REFERENCES photos(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reactions (
    id SERIAL PRIMARY KEY,
    photo_id INT REFERENCES photos(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(photo_id, user_id, emoji)
);
