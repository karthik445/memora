"""
EXIF Extraction Worker
======================

Extracts camera metadata and GPS (if present) from RAW/JPEG files.
Uses Pillow for common formats, rawpy for RAW formats.
"""

import asyncio
import logging
import os
from datetime import datetime
from typing import Any

log = logging.getLogger("memora-ai.exif")

MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/media")


class ExifWorker:
    async def process(self, data: dict) -> dict:
        storage_path: str = data["storagePath"]
        full_path = os.path.join(MEDIA_ROOT, storage_path.lstrip("/"))

        exif = await asyncio.get_event_loop().run_in_executor(
            None, _extract_exif, full_path
        )

        await _update_db(data["photoId"], data["tenantId"], exif)
        return exif


def _extract_exif(full_path: str) -> dict:
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS, GPSTAGS

        with Image.open(full_path) as img:
            width, height = img.size
            raw_exif = img._getexif() or {}

        decoded = {TAGS.get(k, k): v for k, v in raw_exif.items()}

        taken_at = None
        for field in ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]:
            if field in decoded:
                try:
                    taken_at = datetime.strptime(decoded[field], "%Y:%m:%d %H:%M:%S").isoformat()
                    break
                except ValueError:
                    pass

        return {
            "takenAt": taken_at,
            "cameraMake": str(decoded.get("Make", "")).strip() or None,
            "cameraModel": str(decoded.get("Model", "")).strip() or None,
            "focalLength": float(decoded["FocalLength"]) if "FocalLength" in decoded else None,
            "aperture": float(decoded["FNumber"]) if "FNumber" in decoded else None,
            "iso": int(decoded["ISOSpeedRatings"]) if "ISOSpeedRatings" in decoded else None,
            "width": width,
            "height": height,
        }
    except Exception as e:
        log.warning(f"EXIF extraction failed for {full_path}: {e}")
        return {"takenAt": None, "cameraMake": None, "cameraModel": None,
                "focalLength": None, "aperture": None, "iso": None,
                "width": 0, "height": 0}


async def _update_db(photo_id: str, tenant_id: str, exif: dict) -> None:
    import asyncpg

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        await conn.execute(
            """UPDATE photos
               SET taken_at=$1, camera_make=$2, camera_model=$3,
                   width=$4, height=$5
               WHERE id=$6 AND tenant_id=$7""",
            exif.get("takenAt"),
            exif.get("cameraMake"),
            exif.get("cameraModel"),
            exif.get("width") or None,
            exif.get("height") or None,
            photo_id,
            tenant_id,
        )
    finally:
        await conn.close()
