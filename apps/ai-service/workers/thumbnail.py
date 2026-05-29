import asyncio
import os
from PIL import Image, ExifTags

THUMB_SIZE = (800, 800)


async def generate_thumbnail(full_path: str, storage_path: str, media_root: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _generate_sync, full_path, storage_path, media_root)


def _generate_sync(full_path: str, storage_path: str, media_root: str) -> str:
    img = Image.open(full_path)

    # Auto-rotate based on EXIF
    try:
        exif = img._getexif()  # type: ignore[attr-defined]
        if exif:
            for tag, val in exif.items():
                if ExifTags.TAGS.get(tag) == "Orientation":
                    rotations = {3: 180, 6: 270, 8: 90}
                    if val in rotations:
                        img = img.rotate(rotations[val], expand=True)
    except Exception:
        pass

    img.thumbnail(THUMB_SIZE, Image.LANCZOS)

    # Derive thumb path from original path
    parts = storage_path.split("/")
    # e.g. weddings/42/originals/IMG.jpg -> weddings/42/thumbs/IMG.webp
    parts[-2] = "thumbs"
    parts[-1] = os.path.splitext(parts[-1])[0] + ".webp"
    thumb_rel = "/".join(parts)

    thumb_full = os.path.join(media_root, thumb_rel)
    os.makedirs(os.path.dirname(thumb_full), exist_ok=True)
    img.save(thumb_full, "WEBP", quality=85)

    return thumb_rel
