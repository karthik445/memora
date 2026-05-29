import { Queue } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const url = new URL(REDIS_URL)

const connection = {
  host: url.hostname,
  port: parseInt(url.port || '6379'),
}

export const aiQueue = new Queue('ai-processing', { connection })

export async function enqueueAiJob(photoId: number, weddingId: number, storagePath: string) {
  await aiQueue.add('process-photo', { photoId, weddingId, storagePath }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  })
}
