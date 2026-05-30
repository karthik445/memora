import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// ─────────────────────────────────────────────────────────────────────────────
// Queue plugin
//
// Single shared Redis connection for all BullMQ queues.
// Exported queues are used by services to dispatch jobs.
// Workers (in apps/ai-worker) consume from these queues.
// ─────────────────────────────────────────────────────────────────────────────

function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    ...(parsed.password ? { password: parsed.password } : {}),
  }
}

const redisConfig = parseRedisUrl(
  process.env['REDIS_URL'] ?? 'redis://localhost:6379',
)

// BullMQ requires maxRetriesPerRequest: null for Redis connections
export const redisConnection = new IORedis({
  ...redisConfig,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

redisConnection.on('error', err => {
  console.error('[Redis] Connection error:', err)
})

export const photoQueue = new Queue('photo-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

export const notificationQueue = new Queue('notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
})
