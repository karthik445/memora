import type { FastifyInstance } from 'fastify'

// In-memory presence map: weddingId -> Set of { userId, name }
const rooms = new Map<string, Map<string, { name: string; socket: unknown }>>()

export async function presenceRoutes(app: FastifyInstance) {
  app.get('/:weddingId', { websocket: true }, (socket, req) => {
    const { weddingId } = req.params as { weddingId: string }
    let userId = 'anon'
    let userName = 'Guest'

    try {
      const payload = app.jwt.verify(
        (req.query as { token?: string }).token ?? '',
      ) as { sub: string; name?: string }
      userId = String(payload.sub)
      userName = payload.name ?? `User ${userId}`
    } catch {
      // allow anonymous presence
    }

    if (!rooms.has(weddingId)) rooms.set(weddingId, new Map())
    const room = rooms.get(weddingId)!
    room.set(userId, { name: userName, socket })

    const broadcast = (data: unknown) => {
      for (const [, peer] of room) {
        try {
          ;(peer.socket as { send: (d: string) => void }).send(JSON.stringify(data))
        } catch {
          // disconnected peer
        }
      }
    }

    broadcast({ type: 'presence', users: [...room.entries()].map(([id, p]) => ({ id, name: p.name })) })

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; [k: string]: unknown }
        // Forward typed events (photo_flag, comment, reaction, viewing) to room peers
        broadcast({ ...msg, fromUserId: userId, fromName: userName })
      } catch {
        // ignore malformed
      }
    })

    socket.on('close', () => {
      room.delete(userId)
      if (room.size === 0) rooms.delete(weddingId)
      else broadcast({ type: 'presence', users: [...room.entries()].map(([id, p]) => ({ id, name: p.name })) })
    })
  })
}
