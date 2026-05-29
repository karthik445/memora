import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const aiQueue = new Queue('ai-processing', { connection: redis })

export async function enqueueAiJob(photoId: number, weddingId: number, storagePath: string) {
  await aiQueue.add('process-photo', { photoId, weddingId, storagePath }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  })
}
