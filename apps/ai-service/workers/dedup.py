import numpy as np

# Cosine similarity threshold above which two photos are considered near-duplicates
DEDUP_THRESHOLD = 0.97


async def find_duplicates(photo_id: int, wedding_id: int, embedding: list[float], db) -> None:
    """Compare the new photo's embedding against all existing processed photos in the wedding."""
    cur = db.cursor()
    cur.execute(
        """SELECT id, embedding FROM photos
           WHERE wedding_id=%s AND ai_processed=true AND id != %s AND embedding IS NOT NULL""",
        (wedding_id, photo_id),
    )
    rows = cur.fetchall()

    new_vec = np.array(embedding, dtype=np.float32)

    for row in rows:
        existing_id = row["id"]
        existing_emb = row["embedding"]
        if existing_emb is None:
            continue

        # pgvector returns embedding as a string like "[0.1,0.2,...]"
        if isinstance(existing_emb, str):
            existing_vec = np.array(eval(existing_emb), dtype=np.float32)
        else:
            existing_vec = np.array(existing_emb, dtype=np.float32)

        similarity = float(np.dot(new_vec, existing_vec))

        if similarity >= DEDUP_THRESHOLD:
            # Mark the newer photo as duplicate (keep the existing one)
            cur.execute(
                "UPDATE photos SET is_duplicate=true WHERE id=%s",
                (photo_id,),
            )
            db.commit()
            return
