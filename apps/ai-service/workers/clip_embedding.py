"""
CLIP Embedding Worker
=====================

Generates 512-dim CLIP ViT-B/32 embeddings for each photo.
Used for:
  - Near-duplicate detection (cosine similarity > 0.97)
  - Semantic text search ("bride smiling", "first dance")
  - Aesthetic clustering

Performance:
  - CPU: ~500ms per image
  - GPU (T4): ~40ms per image
  - Batch size 32 on GPU handles ~800 images/min
"""

import asyncio
import logging
import os
from functools import lru_cache

import numpy as np
import open_clip
import torch
from PIL import Image

log = logging.getLogger("memora-ai.clip")

MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/media")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_NAME = os.environ.get("CLIP_MODEL", "ViT-B-32")


@lru_cache(maxsize=1)
def _load_clip_model():
    log.info(f"Loading CLIP model {MODEL_NAME} on {DEVICE}")
    model, _, preprocess = open_clip.create_model_and_transforms(
        MODEL_NAME, pretrained="openai", device=DEVICE
    )
    model.eval()
    return model, preprocess


class ClipEmbeddingWorker:
    async def process(self, data: dict) -> dict:
        thumbnail_path: str = data["thumbnailPath"]
        full_path = os.path.join(MEDIA_ROOT, thumbnail_path.lstrip("/"))

        embedding = await asyncio.get_event_loop().run_in_executor(
            None, _embed_sync, full_path
        )

        # Persist to photo_embeddings table
        await _upsert_embedding(data["photoId"], data["tenantId"], embedding)

        return {"embedding": embedding, "model": MODEL_NAME}


def _embed_sync(full_path: str) -> list[float]:
    model, preprocess = _load_clip_model()

    img = Image.open(full_path).convert("RGB")
    tensor = preprocess(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        features = model.encode_image(tensor)
        features = features / features.norm(dim=-1, keepdim=True)

    return features[0].cpu().numpy().tolist()


async def _upsert_embedding(photo_id: str, tenant_id: str, embedding: list[float]) -> None:
    import asyncpg

    vector_str = "[" + ",".join(f"{v:.6f}" for v in embedding) + "]"
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        await conn.execute(
            """INSERT INTO photo_embeddings (photo_id, tenant_id, embedding, model)
               VALUES ($1, $2, $3::vector, $4)
               ON CONFLICT (photo_id) DO UPDATE SET
                 embedding = EXCLUDED.embedding,
                 model = EXCLUDED.model""",
            photo_id, tenant_id, vector_str, MODEL_NAME,
        )
    finally:
        await conn.close()


# Legacy export
async def compute_clip_embedding(image_path: str) -> list[float]:
    return await asyncio.get_event_loop().run_in_executor(None, _embed_sync, image_path)
