import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import staticFiles from '@fastify/static'
import { MEDIA_ROOT } from './storage.js'
import { authRoutes } from './routes/auth.js'
import { weddingRoutes } from './routes/weddings.js'
import { photoRoutes } from './routes/photos.js'
import { commentRoutes } from './routes/comments.js'
import { presenceRoutes } from './routes/presence.js'
import { db } from './db.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true, credentials: true })
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev_secret' })
await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } }) // 500 MB per file
await app.register(websocket)
await app.register(staticFiles, { root: MEDIA_ROOT, prefix: '/media/' })
// Also serve imported files that live outside MEDIA_ROOT (e.g. other drives)
await app.register(staticFiles, { root: '/import', prefix: '/import/', decorateReply: false })

app.addHook('onRequest', async (req, reply) => {
  const open = ['/auth/register', '/auth/login']
  if (open.some(p => req.url.startsWith(p))) return
  if (req.url.startsWith('/presence')) return
  if (req.url.startsWith('/media/')) return
  if (req.url.startsWith('/import/')) return
  try {
    await req.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

await app.register(authRoutes, { prefix: '/auth' })
await app.register(weddingRoutes, { prefix: '/weddings' })
await app.register(photoRoutes, { prefix: '/photos' })
await app.register(commentRoutes, { prefix: '/photos' })
await app.register(presenceRoutes, { prefix: '/presence' })

app.get('/health', async () => ({ status: 'ok' }))

const port = parseInt(process.env.PORT ?? '3001')
await app.listen({ port, host: '0.0.0.0' })
console.log(`Memora server running on port ${port}`)
