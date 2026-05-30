import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import websocket from '@fastify/websocket'
import { resolve } from 'path'

import { errorHandler } from './errors/errorHandler.js'
import { authRoutes } from './domains/auth/auth.controller.js'
import { photoRoutes } from './domains/photos/photo.controller.js'
import { redisConnection } from './plugins/queue.js'
import { createStorageProvider } from '@memora/storage'
import { MAX_FILE_SIZE_BYTES } from './domains/photos/photo.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// Application bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    ...(process.env['NODE_ENV'] === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  },
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  trustProxy: process.env['TRUST_PROXY'] === 'true',
})

// ── Security headers ────────────────────────────────────────────────────────
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
})

// ── CORS ────────────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})

// ── Rate limiting ────────────────────────────────────────────────────────────
// Phase 4: Rate limiting — auth endpoints have tighter limits
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  redis: redisConnection,
  keyGenerator: (req) => {
    return req.ip ?? 'unknown'
  },
  errorResponseBuilder: (_req, context) => ({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    },
  }),
})

// ── Cookies ─────────────────────────────────────────────────────────────────
await app.register(cookie, {
  secret: process.env['COOKIE_SECRET'] ?? 'dev-cookie-secret-change-in-production',
})

// ── JWT ─────────────────────────────────────────────────────────────────────
await app.register(jwt, {
  secret: process.env['JWT_SECRET'] ?? 'dev-jwt-secret-change-in-production',
  sign: { algorithm: 'HS256' },
})

// Expose authenticate hook for route-level use
app.decorate('authenticate', async (req: Parameters<typeof app.jwt.verify>[0], reply: Parameters<typeof app.jwt.verify>[1]) => {
  await req.jwtVerify()
})

// ── Multipart (file uploads) ─────────────────────────────────────────────────
await app.register(multipart, {
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1, // one file per request — batch uploads use multiple requests
    fieldSize: 1024,
    fields: 10,
  },
})

// ── WebSocket ────────────────────────────────────────────────────────────────
await app.register(websocket)

// ── Static media files ────────────────────────────────────────────────────────
// Only for local storage provider. In production (S3/R2), files are served
// via signed URLs directly from the storage provider.
if (process.env['STORAGE_PROVIDER'] === 'local' || !process.env['STORAGE_PROVIDER']) {
  const mediaRoot = resolve(process.env['MEDIA_ROOT'] ?? './media')
  await app.register(staticFiles, {
    root: mediaRoot,
    prefix: '/media/',
    decorateReply: false,
    // Security: COOP/COEP headers for SharedArrayBuffer
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    },
  })
}

// ── Error handler ────────────────────────────────────────────────────────────
app.setErrorHandler(errorHandler)

// ── Routes ───────────────────────────────────────────────────────────────────
await app.register(authRoutes, { prefix: '/auth' })
await app.register(photoRoutes, { prefix: '/tenants/:tenantId/photos' })

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', {
  config: { rateLimit: { max: 1000, timeWindow: '1 minute' } },
}, async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: process.env['npm_package_version'] ?? '1.0.0',
}))

// ── Startup ──────────────────────────────────────────────────────────────────
const port = parseInt(process.env['PORT'] ?? '3001', 10)
const host = process.env['HOST'] ?? '0.0.0.0'

try {
  // Validate storage provider configuration at startup — fail fast
  createStorageProvider()

  await app.listen({ port, host })
  app.log.info(`Memora API running on http://${host}:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

export { app }
