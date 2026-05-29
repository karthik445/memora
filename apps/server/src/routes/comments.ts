import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'

export async function commentRoutes(app: FastifyInstance) {
  app.get('/:photoId/comments', async (req) => {
    const { photoId } = req.params as { photoId: string }
    const { rows } = await db.query(
      `SELECT c.*, u.name as author_name FROM comments c
       LEFT JOIN users u ON u.id=c.user_id
       WHERE c.photo_id=$1 ORDER BY c.created_at ASC`,
      [photoId],
    )
    return rows
  })

  app.post('/:photoId/comments', async (req, reply) => {
    const { photoId } = req.params as { photoId: string }
    const { sub } = req.user as { sub: number }
    const { body } = req.body as { body: string }
    const { rows } = await db.query(
      `INSERT INTO comments (photo_id, user_id, body) VALUES ($1,$2,$3) RETURNING *`,
      [photoId, sub, body],
    )
    return reply.code(201).send(rows[0])
  })

  app.post('/:photoId/reactions', async (req, reply) => {
    const { photoId } = req.params as { photoId: string }
    const { sub } = req.user as { sub: number }
    const { emoji } = req.body as { emoji: string }
    await db.query(
      `INSERT INTO reactions (photo_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [photoId, sub, emoji],
    )
    return reply.code(201).send({ ok: true })
  })

  app.delete('/:photoId/reactions/:emoji', async (req) => {
    const { photoId, emoji } = req.params as { photoId: string; emoji: string }
    const { sub } = req.user as { sub: number }
    await db.query(
      `DELETE FROM reactions WHERE photo_id=$1 AND user_id=$2 AND emoji=$3`,
      [photoId, sub, emoji],
    )
    return { ok: true }
  })
}
