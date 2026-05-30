"""
Duplicate Detection Worker
===========================

Uses FAISS approximate nearest-neighbour search against all existing
CLIP embeddings for this wedding.

Why FAISS instead of pgvector for dedup:
  - At 50,000 photos, pgvector cosine search is ~50ms per query.
    That's 42 minutes for the full batch sequentially.
  - FAISS IndexFlatIP (inner product on normalised vectors = cosine)
    does 50,000 comparisons in ~2ms in memory.
  - We build a FAISS index per wedding in Redis, update it as photos arrive.

Index lifecycle:
  1. On first photo in a wedding: create IndexFlatIP(512), persist to Redis
  2. Each subsequent photo: load index, search, add new vector, re-persist
  3. For large weddings (>50k): upgrade to IndexIVFFlat with nlist=100

Similarity threshold:
  - 0.97+ = near-identical (same shot, different exposure)
  - 0.92-0.97 = very similar (burst sequence)
  - We flag at 0.97 by default, 0.92 available via DEDUP_THRESHOLD env var
"""

import asyncio
import io
import logging
import os
import pickle
from typing import Optional

import faiss
import numpy as np

log = logging.getLogger("memora-ai.dedup")

MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/media")
DEDUP_THRESHOLD = float(os.environ.get("DEDUP_THRESHOLD", "0.97"))
EMBEDDING_DIM = 512
# Switch to IVFFlat when index exceeds this size
IVFFLAT_THRESHOLD = 10_000


class DuplicateWorker:
    async def process(self, data: dict) -> dict:
        photo_id: str = data["photoId"]
        tenant_id: str = data["tenantId"]
        wedding_id: str = data["weddingId"]
        embedding: list[float] = data["embedding"]

        vec = np.array(embedding, dtype=np.float32).reshape(1, -1)
        # Normalise (CLIP embeddings should already be unit norm, but be safe)
        norm = np.linalg.norm(vec, axis=1, keepdims=True)
        vec = vec / np.where(norm == 0, 1, norm)

        duplicate_of_id, similarity = await asyncio.get_event_loop().run_in_executor(
            None, self._search_and_update_index, wedding_id, tenant_id, photo_id, vec
        )

        is_duplicate = duplicate_of_id is not None
        await _update_db(photo_id, tenant_id, is_duplicate, duplicate_of_id)

        return {
            "isDuplicate": is_duplicate,
            "duplicateOfId": duplicate_of_id,
            "similarityScore": float(similarity) if similarity is not None else None,
        }

    def _search_and_update_index(
        self,
        wedding_id: str,
        tenant_id: str,
        photo_id: str,
        vec: np.ndarray,
    ) -> tuple[Optional[str], Optional[float]]:
        import redis as sync_redis

        r = sync_redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))
        index_key = f"faiss:{tenant_id}:{wedding_id}"
        ids_key = f"faiss-ids:{tenant_id}:{wedding_id}"

        # Load or create index
        index_bytes = r.get(index_key)
        ids_bytes = r.get(ids_key)

        if index_bytes:
            index = faiss.deserialize_index(np.frombuffer(index_bytes, dtype=np.uint8))
            photo_ids: list[str] = pickle.loads(ids_bytes) if ids_bytes else []
        else:
            index = faiss.IndexFlatIP(EMBEDDING_DIM)
            photo_ids = []

        duplicate_of_id = None
        similarity = None

        # Search before adding this photo
        if index.ntotal > 0:
            # Upgrade to IVFFlat for large indexes
            if index.ntotal >= IVFFLAT_THRESHOLD and not isinstance(
                index, faiss.IndexIVFFlat
            ):
                index = _upgrade_to_ivfflat(index)

            distances, indices = index.search(vec, k=1)
            top_dist = float(distances[0][0])
            top_idx = int(indices[0][0])

            if top_dist >= DEDUP_THRESHOLD and top_idx < len(photo_ids):
                duplicate_of_id = photo_ids[top_idx]
                similarity = top_dist
                log.info(
                    f"Duplicate detected: {photo_id} ~ {duplicate_of_id} (sim={top_dist:.4f})"
                )

        # Always add this photo to the index (it becomes a reference for future photos)
        index.add(vec)
        photo_ids.append(photo_id)

        # Persist updated index
        serialised = faiss.serialize_index(index)
        r.set(index_key, serialised.tobytes(), ex=86400 * 7)  # 7-day TTL
        r.set(ids_key, pickle.dumps(photo_ids), ex=86400 * 7)

        return duplicate_of_id, similarity


def _upgrade_to_ivfflat(flat_index: faiss.IndexFlatIP) -> faiss.IndexIVFFlat:
    """Upgrade a flat index to IVFFlat for faster ANN at scale."""
    nlist = max(10, int(flat_index.ntotal / 100))
    quantiser = faiss.IndexFlatIP(EMBEDDING_DIM)
    ivf = faiss.IndexIVFFlat(quantiser, EMBEDDING_DIM, nlist, faiss.METRIC_INNER_PRODUCT)

    # Retrieve all vectors from flat index and train
    all_vecs = np.zeros((flat_index.ntotal, EMBEDDING_DIM), dtype=np.float32)
    flat_index.reconstruct_n(0, flat_index.ntotal, all_vecs)
    ivf.train(all_vecs)
    ivf.add(all_vecs)
    ivf.nprobe = min(nlist, 10)

    log.info(f"Upgraded FAISS index to IVFFlat (nlist={nlist})")
    return ivf


async def _update_db(
    photo_id: str,
    tenant_id: str,
    is_duplicate: bool,
    duplicate_of_id: Optional[str],
) -> None:
    import asyncpg

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        await conn.execute(
            """UPDATE photos
               SET is_duplicate=$1, duplicate_of_id=$2
               WHERE id=$3 AND tenant_id=$4""",
            is_duplicate, duplicate_of_id, photo_id, tenant_id,
        )
    finally:
        await conn.close()


# Legacy export for backward compatibility with main.py
async def find_duplicates(
    photo_id: str, wedding_id: str, embedding: list[float], db
) -> None:
    worker = DuplicateWorker()
    await worker.process({
        "photoId": photo_id,
        "tenantId": "",
        "weddingId": wedding_id,
        "embedding": embedding,
    })
