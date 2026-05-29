import asyncio
from functools import lru_cache

import numpy as np
import open_clip
import torch
from PIL import Image

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


@lru_cache(maxsize=1)
def _load_model():
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai", device=DEVICE
    )
    model.eval()
    return model, preprocess


async def compute_clip_embedding(image_path: str) -> list[float]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _embed_sync, image_path)


def _embed_sync(image_path: str) -> list[float]:
    model, preprocess = _load_model()
    img = Image.open(image_path).convert("RGB")
    tensor = preprocess(img).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        features = model.encode_image(tensor)
        features /= features.norm(dim=-1, keepdim=True)
    return features[0].cpu().numpy().tolist()
