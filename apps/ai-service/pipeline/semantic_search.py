"""
Semantic Search Service
=======================

Translates natural-language queries into CLIP embeddings and searches
photo_embeddings using pgvector ANN.

Query examples:
  "bride smiling"                → finds photos matching that concept
  "stage photos"                 → ceremony / venue shots
  "grandmother with bride"       → combines face recognition + semantic
  "golden hour portraits"        → lighting + pose
  "first dance"                  → specific wedding moment

Architecture:
  1. Encode query text with CLIP → 512-dim vector
  2. Check text_embedding_cache (avoid re-encoding common queries)
  3. pgvector HNSW ANN search on photo_embeddings
  4. Optional: combine with face filter (AND photo contains person_id)
  5. Return ranked photo IDs with similarity scores

Performance:
  - HNSW query: ~1ms for 50k photos
  - CLIP text encoding: ~50ms (cached after first use)
  - Total: <100ms for most queries
"""

import logging
import os
from functools import lru_cache
from typing import Optional

import asyncpg
import numpy as np
import open_clip
import torch

log = logging.getLogger("memora-ai.semantic-search")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


@lru_cache(maxsize=1)
def _load_clip():
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai", device=DEVICE
    )
    tokenizer = open_clip.get_tokenizer("ViT-B-32")
    model.eval()
    return model, tokenizer


def _encode_text(query: str) -> list[float]:
    model, tokenizer = _load_clip()
    tokens = tokenizer([query]).to(DEVICE)
    with torch.no_grad():
        features = model.encode_text(tokens)
        features = features / features.norm(dim=-1, keepdim=True)
    return features[0].cpu().numpy().tolist()


async def semantic_search(
    db_url: str,
    tenant_id: str,
    wedding_id: str,
    query: str,
    limit: int = 50,
    similarity_threshold: float = 0.20,
    person_id: Optional[str] = None,
) -> list[dict]:
    """
    Search photos semantically using CLIP text-to-image matching.

    Returns a list of { photoId, similarity } sorted by similarity desc.
    """
    conn = await asyncpg.connect(db_url)

    try:
        # 1. Check cache first
        cached = await conn.fetchrow(
            "SELECT embedding FROM text_embedding_cache WHERE query_text = $1",
            query,
        )

        if cached:
            await conn.execute(
                """UPDATE text_embedding_cache
                   SET hit_count = hit_count + 1, last_used_at = NOW()
                   WHERE query_text = $1""",
                query,
            )
            embedding = cached["embedding"]
            vector_str = str(embedding)
        else:
            # 2. Encode with CLIP
            vec = _encode_text(query)
            vector_str = "[" + ",".join(f"{v:.6f}" for v in vec) + "]"

            # Cache the text embedding
            await conn.execute(
                """INSERT INTO text_embedding_cache (query_text, embedding, model)
                   VALUES ($1, $2::vector, $3)
                   ON CONFLICT (query_text) DO UPDATE SET
                     hit_count = text_embedding_cache.hit_count + 1,
                     last_used_at = NOW()""",
                query, vector_str, "clip-vit-b-32",
            )

        # 3. ANN search — pgvector HNSW cosine similarity
        # Set ef_search for better recall on the HNSW index
        await conn.execute("SET hnsw.ef_search = 100")

        base_query = """
            SELECT
                pe.photo_id,
                1 - (pe.embedding <=> $1::vector) AS similarity
            FROM photo_embeddings pe
            WHERE pe.tenant_id = $2
              AND pe.wedding_id = $3
              AND 1 - (pe.embedding <=> $1::vector) > $4
        """
        params = [vector_str, tenant_id, wedding_id, similarity_threshold]

        # 4. Optional: filter to photos containing a specific person
        if person_id:
            base_query += """
              AND pe.photo_id IN (
                SELECT DISTINCT fe.photo_id
                FROM face_embeddings fe
                WHERE fe.tenant_id = $5 AND fe.person_id = $6
              )
            """
            params += [tenant_id, person_id]

        base_query += f" ORDER BY similarity DESC LIMIT {limit}"

        rows = await conn.fetch(base_query, *params)

        return [
            {"photoId": str(r["photo_id"]), "similarity": float(r["similarity"])}
            for r in rows
        ]

    finally:
        await conn.close()


async def find_similar_photos(
    db_url: str,
    tenant_id: str,
    wedding_id: str,
    photo_id: str,
    limit: int = 20,
    similarity_threshold: float = 0.70,
) -> list[dict]:
    """
    "More like this" — find visually similar photos using the photo's own CLIP embedding.
    """
    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute("SET hnsw.ef_search = 80")

        rows = await conn.fetch(
            """
            SELECT
                target.photo_id,
                1 - (target.embedding <=> source.embedding) AS similarity
            FROM photo_embeddings source
            CROSS JOIN LATERAL (
                SELECT pe.photo_id, pe.embedding
                FROM photo_embeddings pe
                WHERE pe.tenant_id = $2
                  AND pe.wedding_id = $3
                  AND pe.photo_id != $4
                ORDER BY pe.embedding <=> source.embedding
                LIMIT $5
            ) AS target
            WHERE source.photo_id = $4
              AND source.tenant_id = $2
              AND 1 - (target.embedding <=> source.embedding) > $6
            ORDER BY similarity DESC
            """,
            photo_id, tenant_id, wedding_id, photo_id, limit, similarity_threshold,
        )

        return [
            {"photoId": str(r["photo_id"]), "similarity": float(r["similarity"])}
            for r in rows
        ]
    finally:
        await conn.close()


async def find_photos_by_person(
    db_url: str,
    tenant_id: str,
    wedding_id: str,
    person_id: str,
    limit: int = 100,
    min_confidence: float = 0.70,
) -> list[dict]:
    """
    Find all photos containing a specific identified person.
    Uses face_embeddings IVFFlat ANN indexed by person_id.
    """
    conn = await asyncpg.connect(db_url)
    try:
        rows = await conn.fetch(
            """
            SELECT DISTINCT
                fe.photo_id,
                MAX(fe.detection_confidence) AS confidence
            FROM face_embeddings fe
            WHERE fe.tenant_id = $1
              AND fe.wedding_id = $2
              AND fe.person_id = $3
              AND fe.detection_confidence >= $4
            GROUP BY fe.photo_id
            ORDER BY confidence DESC
            LIMIT $5
            """,
            tenant_id, wedding_id, person_id, min_confidence, limit,
        )

        return [
            {"photoId": str(r["photo_id"]), "confidence": float(r["confidence"])}
            for r in rows
        ]
    finally:
        await conn.close()
