"""
Blur Detection Worker
=====================

Uses OpenCV Laplacian variance to measure sharpness.

Composite score = 0.7 * laplacian_variance + 0.3 * gradient_magnitude
Threshold 100 is the default for wedding photos.
"""

import asyncio
import logging
import os

import cv2
import numpy as np

log = logging.getLogger("memora-ai.blur")

MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/media")
DEFAULT_THRESHOLD = float(os.environ.get("BLUR_THRESHOLD", "100.0"))


class BlurWorker:
    async def process(self, data: dict) -> dict:
        thumbnail_path: str = data["thumbnailPath"]
        full_path = os.path.join(MEDIA_ROOT, thumbnail_path.lstrip("/"))

        score, is_blur = await asyncio.get_event_loop().run_in_executor(
            None, _compute_blur_score, full_path
        )

        await _update_db(data["photoId"], is_blur, score, data["tenantId"])

        return {"isBlur": is_blur, "blurScore": score, "threshold": DEFAULT_THRESHOLD}


def _compute_blur_score(full_path: str) -> tuple[float, bool]:
    img = cv2.imread(full_path)
    if img is None:
        log.warning(f"Could not read image: {full_path}")
        return 0.0, True

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Laplacian variance — primary sharpness metric
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    lap_score = float(laplacian.var())

    # Sobel gradient magnitude — secondary metric
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_score = float(np.sqrt(sobelx**2 + sobely**2).mean())

    composite = lap_score * 0.7 + grad_score * 0.3
    return composite, composite < DEFAULT_THRESHOLD


async def _update_db(photo_id: str, is_blur: bool, score: float, tenant_id: str) -> None:
    import asyncpg
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        await conn.execute(
            "UPDATE photos SET is_blur=$1, blur_score=$2 WHERE id=$3 AND tenant_id=$4",
            is_blur, score, photo_id, tenant_id,
        )
    finally:
        await conn.close()


# Legacy function for backward compatibility with existing main.py
async def detect_blur(image_path: str) -> tuple[float, bool]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _compute_blur_score, image_path)
