"""
Aesthetic Scoring Worker
========================

Combines two signals:
  1. LAION aesthetic predictor (CLIP-based linear regression, trained on human ratings)
     - Score 0-10, where 8+ is "aesthetically pleasing"
     - Good for detecting well-composed, well-lit shots

  2. Technical quality composite (sharpness + exposure):
     - Sharpness: Laplacian variance (already computed in blur worker)
     - Exposure: histogram analysis (avoid over/under-exposed)
     - Colour: saturation and contrast scores

The aesthetic score feeds into the AI recommendations panel —
"Here are the 50 best shots from this wedding".
"""

import asyncio
import logging
import os
from functools import lru_cache

import cv2
import numpy as np
import torch
import open_clip
from PIL import Image

log = logging.getLogger("memora-ai.aesthetic")

MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/media")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


@lru_cache(maxsize=1)
def _load_aesthetic_predictor():
    """
    Load CLIP + linear aesthetic predictor.
    The predictor head is a single linear layer trained on LAION aesthetic ratings.
    Weights: https://github.com/christophschuhmann/improved-aesthetic-predictor
    """
    import open_clip

    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-L-14", pretrained="openai", device=DEVICE
    )
    model.eval()

    # Linear predictor head (768 dim for ViT-L-14 → scalar)
    predictor = torch.nn.Linear(768, 1)

    # Load pretrained weights if available
    weights_path = os.environ.get("AESTHETIC_WEIGHTS", "/models/aesthetic_predictor.pth")
    if os.path.exists(weights_path):
        state = torch.load(weights_path, map_location=DEVICE)
        predictor.load_state_dict(state)
        log.info("Loaded aesthetic predictor weights")
    else:
        log.warning("No aesthetic predictor weights found — using random init (scores unreliable)")

    predictor.eval().to(DEVICE)
    return model, preprocess, predictor


class AestheticWorker:
    async def process(self, data: dict) -> dict:
        thumbnail_path: str = data["thumbnailPath"]
        full_path = os.path.join(MEDIA_ROOT, thumbnail_path.lstrip("/"))

        aesthetic_score, technical_score = await asyncio.get_event_loop().run_in_executor(
            None, _score_image, full_path
        )

        await _update_db(data["photoId"], data["tenantId"], aesthetic_score, technical_score)

        return {
            "aestheticScore": aesthetic_score,
            "technicalScore": technical_score,
        }


def _score_image(full_path: str) -> tuple[float, float]:
    aesthetic_score = _compute_aesthetic_score(full_path)
    technical_score = _compute_technical_score(full_path)
    return aesthetic_score, technical_score


def _compute_aesthetic_score(full_path: str) -> float:
    try:
        model, preprocess, predictor = _load_aesthetic_predictor()
        img = Image.open(full_path).convert("RGB")
        tensor = preprocess(img).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            features = model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)
            score = predictor(features.float()).item()

        # Clamp to 0-10 range
        return float(max(0.0, min(10.0, score)))
    except Exception as e:
        log.warning(f"Aesthetic scoring failed: {e}")
        return 5.0  # neutral fallback


def _compute_technical_score(full_path: str) -> float:
    img = cv2.imread(full_path)
    if img is None:
        return 0.0

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    scores = []

    # 1. Sharpness (Laplacian variance, normalised)
    lap_score = min(cv2.Laplacian(gray, cv2.CV_64F).var() / 200.0, 1.0)
    scores.append(lap_score)

    # 2. Exposure (penalise over/under-exposed)
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    hist = hist.flatten() / hist.sum()
    # High proportion in shadows (0-30) or highlights (225-255) is penalised
    shadow_ratio = hist[:30].sum()
    highlight_ratio = hist[225:].sum()
    exposure_score = 1.0 - min(shadow_ratio + highlight_ratio, 1.0)
    scores.append(exposure_score)

    # 3. Colour saturation
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1].mean() / 255.0
    scores.append(saturation)

    # 4. Contrast
    contrast = gray.std() / 128.0
    scores.append(min(contrast, 1.0))

    technical = float(np.mean(scores)) * 10.0  # scale to 0-10
    return max(0.0, min(10.0, technical))


async def _update_db(
    photo_id: str, tenant_id: str, aesthetic_score: float, technical_score: float
) -> None:
    import asyncpg

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        # Store in JSON metadata column — add dedicated columns if needed
        await conn.execute(
            """UPDATE photos
               SET metadata = COALESCE(metadata, '{}') ||
                 jsonb_build_object(
                   'aestheticScore', $1::float,
                   'technicalScore', $2::float
                 )
               WHERE id=$3 AND tenant_id=$4""",
            aesthetic_score, technical_score, photo_id, tenant_id,
        )
    finally:
        await conn.close()
