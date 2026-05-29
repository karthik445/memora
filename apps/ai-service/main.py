import asyncio
import os
import json
import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI

from workers.blur import detect_blur
from workers.thumbnail import generate_thumbnail
from workers.embeddings import compute_clip_embedding
from workers.faces import extract_faces
from workers.dedup import find_duplicates
from db import get_db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("memora-ai")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
QUEUE_NAME = "bull:ai-processing"


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(worker_loop())
    yield


app = FastAPI(title="Memora AI Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


async def worker_loop():
    r = await aioredis.from_url(REDIS_URL)
    log.info("AI worker started, listening on BullMQ queue")

    while True:
        try:
            # BullMQ stores jobs in Redis sorted sets; we use BLPOP on the wait list
            result = await r.blpop(f"{QUEUE_NAME}:wait", timeout=5)
            if result is None:
                continue

            _, job_id_bytes = result
            job_id = job_id_bytes.decode()
            raw = await r.hget(f"{QUEUE_NAME}:{job_id}", "data")
            if not raw:
                continue

            job_data = json.loads(raw)
            await process_photo(job_data)

            await r.hset(f"{QUEUE_NAME}:{job_id}", "state", "completed")
        except Exception as e:
            log.exception(f"Worker error: {e}")
            await asyncio.sleep(2)


async def process_photo(data: dict):
    photo_id: int = data["photoId"]
    storage_path: str = data["storagePath"]
    media_root = os.environ.get("MEDIA_ROOT", "./media")
    full_path = os.path.join(media_root, storage_path)

    log.info(f"Processing photo {photo_id}: {full_path}")

    db = get_db()

    # 1. Generate WebP thumbnail
    thumb_rel = await generate_thumbnail(full_path, storage_path, media_root)

    # 2. Blur detection
    blur_score, is_blur = await detect_blur(full_path)

    # 3. CLIP embedding
    embedding = await compute_clip_embedding(full_path)

    # 4. Face extraction
    faces = await extract_faces(full_path)

    # Update photo record
    db.execute(
        """UPDATE photos
           SET thumbnail_path=%s, is_blur=%s, blur_score=%s, embedding=%s,
               ai_processed=true
           WHERE id=%s""",
        (thumb_rel, is_blur, blur_score, embedding, photo_id),
    )

    # Store face tracks
    for bbox, face_emb in faces:
        db.execute(
            """INSERT INTO face_tracks (photo_id, bbox, face_embedding)
               VALUES (%s, %s, %s)""",
            (photo_id, json.dumps(bbox), face_emb),
        )

    db.commit()

    # 5. Near-duplicate detection (async, against existing embeddings in this wedding)
    wedding_id: int = data["weddingId"]
    await find_duplicates(photo_id, wedding_id, embedding, db)

    db.close()
    log.info(f"Photo {photo_id} processed successfully")
