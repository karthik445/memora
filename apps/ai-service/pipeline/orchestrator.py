"""
AI Pipeline Orchestrator
========================

Reads from BullMQ queues and dispatches to the appropriate worker.
Each stage is independent — partial failures don't block unrelated stages.

Pipeline graph:
  thumbnail → [blur, exif, clip]
  clip      → [duplicate, aesthetic]
  thumbnail → face_detect → face_recog

Scale target: 50,000 photos per wedding upload batch.
  - Thumbnail: 20 concurrent workers
  - Blur:       8 concurrent workers
  - CLIP:       2 concurrent workers (GPU-bound)
  - Face:       2 concurrent workers (GPU-bound)
  - Duplicate:  4 concurrent workers
"""

import asyncio
import json
import logging
import os
from typing import Any

import redis.asyncio as aioredis

from workers.thumbnail import ThumbnailWorker
from workers.blur import BlurWorker
from workers.exif import ExifWorker
from workers.clip_embedding import ClipEmbeddingWorker
from workers.duplicate import DuplicateWorker
from workers.face_detection import FaceDetectionWorker
from workers.face_recognition import FaceRecognitionWorker
from workers.aesthetic import AestheticWorker

log = logging.getLogger("memora-ai.orchestrator")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Queue → concurrency mapping
QUEUE_CONCURRENCY = {
    "bull:ai:thumbnail":   20,
    "bull:ai:exif":         8,
    "bull:ai:blur":         8,
    "bull:ai:clip":         2,
    "bull:ai:duplicate":    4,
    "bull:ai:face-detect":  2,
    "bull:ai:face-recog":   2,
    "bull:ai:aesthetic":    2,
}


class BullMQConsumer:
    """
    Minimal BullMQ Redis consumer.
    BullMQ stores jobs in sorted sets and lists — we use BLPOP on the wait list.
    """

    def __init__(self, redis: aioredis.Redis, queue_name: str):
        self.redis = redis
        self.queue_name = queue_name
        self._wait_key = f"{queue_name}:wait"
        self._active_key = f"{queue_name}:active"

    async def fetch_job(self, timeout: int = 5) -> tuple[str, dict] | None:
        result = await self.redis.blpop(self._wait_key, timeout=timeout)
        if result is None:
            return None

        _, job_id_bytes = result
        job_id = job_id_bytes.decode()

        raw_data = await self.redis.hget(f"{self.queue_name}:{job_id}", "data")
        if raw_data is None:
            return None

        await self.redis.lpush(self._active_key, job_id)
        return job_id, json.loads(raw_data)

    async def complete_job(self, job_id: str, result: dict) -> None:
        await self.redis.lrem(self._active_key, 1, job_id)
        await self.redis.hset(
            f"{self.queue_name}:{job_id}",
            mapping={"state": "completed", "returnvalue": json.dumps(result)},
        )

    async def fail_job(self, job_id: str, error: str) -> None:
        await self.redis.lrem(self._active_key, 1, job_id)
        await self.redis.hset(
            f"{self.queue_name}:{job_id}",
            mapping={"state": "failed", "failedReason": error},
        )

    async def enqueue(self, target_queue: str, data: dict) -> str:
        """Enqueue a downstream job."""
        import uuid
        job_id = str(uuid.uuid4())
        await self.redis.hset(
            f"{target_queue}:{job_id}",
            mapping={"data": json.dumps(data), "state": "waiting"},
        )
        await self.redis.rpush(f"{target_queue}:wait", job_id)
        return job_id


# ── Worker map ────────────────────────────────────────────────────────────────

WORKER_MAP = {
    "bull:ai:thumbnail":  ThumbnailWorker,
    "bull:ai:exif":       ExifWorker,
    "bull:ai:blur":       BlurWorker,
    "bull:ai:clip":       ClipEmbeddingWorker,
    "bull:ai:duplicate":  DuplicateWorker,
    "bull:ai:face-detect": FaceDetectionWorker,
    "bull:ai:face-recog":  FaceRecognitionWorker,
    "bull:ai:aesthetic":  AestheticWorker,
}


# ── Pipeline stage routing ─────────────────────────────────────────────────────

async def route_downstream(
    redis: aioredis.Redis,
    queue_name: str,
    job_data: dict,
    result: dict,
) -> None:
    """
    After a stage completes, enqueue dependent downstream stages.
    This implements the pipeline DAG without a central coordinator.
    """
    consumer = BullMQConsumer(redis, queue_name)

    if queue_name == "bull:ai:thumbnail":
        # Thumbnail done → fan out to blur, exif, clip, face-detect in parallel
        for downstream_queue, downstream_data in [
            ("bull:ai:blur",        {**job_data, "thumbnailPath": result["thumbnailPath"]}),
            ("bull:ai:exif",        {**job_data}),
            ("bull:ai:clip",        {**job_data, "thumbnailPath": result["thumbnailPath"]}),
            ("bull:ai:face-detect", {**job_data, "thumbnailPath": result["thumbnailPath"]}),
            ("bull:ai:aesthetic",   {**job_data, "thumbnailPath": result["thumbnailPath"]}),
        ]:
            await consumer.enqueue(downstream_queue, downstream_data)

    elif queue_name == "bull:ai:clip":
        # CLIP done → run duplicate detection
        await consumer.enqueue(
            "bull:ai:duplicate",
            {**job_data, "embedding": result["embedding"]},
        )

    elif queue_name == "bull:ai:face-detect":
        # Face detection done → run recognition for each detected face
        for face in result.get("faces", []):
            await consumer.enqueue(
                "bull:ai:face-recog",
                {
                    **job_data,
                    "faceEmbedding": face["embedding"],
                    "boundingBox": face["boundingBox"],
                },
            )


# ── Queue processor ───────────────────────────────────────────────────────────

async def process_queue(redis: aioredis.Redis, queue_name: str, concurrency: int) -> None:
    """Process one queue with bounded concurrency."""
    worker_cls = WORKER_MAP.get(queue_name)
    if not worker_cls:
        log.error(f"No worker for queue: {queue_name}")
        return

    consumer = BullMQConsumer(redis, queue_name)
    semaphore = asyncio.Semaphore(concurrency)

    log.info(f"[{queue_name}] Starting consumer (concurrency={concurrency})")

    async def process_one() -> None:
        async with semaphore:
            job = await consumer.fetch_job(timeout=5)
            if job is None:
                return

            job_id, data = job
            worker = worker_cls()

            try:
                log.debug(f"[{queue_name}] Processing job {job_id}")
                result = await worker.process(data)
                await consumer.complete_job(job_id, result)
                await route_downstream(redis, queue_name, data, result)
                log.debug(f"[{queue_name}] Completed job {job_id}")
            except Exception as exc:
                log.exception(f"[{queue_name}] Failed job {job_id}: {exc}")
                await consumer.fail_job(job_id, str(exc))

    while True:
        await asyncio.gather(*[process_one() for _ in range(concurrency)])
        await asyncio.sleep(0.01)


# ── Main entry point ──────────────────────────────────────────────────────────

async def run_orchestrator() -> None:
    redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=False)
    log.info("AI orchestrator started")

    tasks = [
        asyncio.create_task(
            process_queue(redis, queue_name, concurrency),
            name=queue_name,
        )
        for queue_name, concurrency in QUEUE_CONCURRENCY.items()
    ]

    await asyncio.gather(*tasks)
