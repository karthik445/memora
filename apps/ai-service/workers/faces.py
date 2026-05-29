import asyncio
from functools import lru_cache

import numpy as np
import cv2

# InsightFace is optional — gracefully skip if not installed properly
try:
    from insightface.app import FaceAnalysis
    _INSIGHTFACE_AVAILABLE = True
except ImportError:
    _INSIGHTFACE_AVAILABLE = False


@lru_cache(maxsize=1)
def _load_face_app():
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


async def extract_faces(image_path: str) -> list[tuple[list[float], list[float]]]:
    if not _INSIGHTFACE_AVAILABLE:
        return []
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _extract_sync, image_path)


def _extract_sync(image_path: str) -> list[tuple[list[float], list[float]]]:
    app = _load_face_app()
    img = cv2.imread(image_path)
    if img is None:
        return []
    faces = app.get(img)
    result = []
    h, w = img.shape[:2]
    for face in faces:
        x1, y1, x2, y2 = face.bbox
        bbox = [x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h]
        emb = face.normed_embedding.tolist() if face.normed_embedding is not None else []
        result.append((bbox, emb))
    return result
