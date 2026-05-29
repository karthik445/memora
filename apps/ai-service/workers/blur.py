import asyncio
import cv2
import numpy as np

# Laplacian variance below this threshold → blurry
BLUR_THRESHOLD = 100.0


async def detect_blur(image_path: str) -> tuple[float, bool]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _detect_blur_sync, image_path)


def _detect_blur_sync(image_path: str) -> tuple[float, bool]:
    img = cv2.imread(image_path)
    if img is None:
        return 0.0, True
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return score, score < BLUR_THRESHOLD
