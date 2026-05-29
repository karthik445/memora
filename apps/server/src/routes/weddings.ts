import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(1),
  date: z.string(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
})

export async function weddingRoutes(app: FastifyInstance) {
  // List weddings accessible to the current user
  app.get('/', async (req) => {
    const { sub, role } = req.user as { sub: number; role: string }
    if (role === 'photographer') {
      const { rows } = await db.query(
        `SELECT * FROM weddings WHERE owner_id=$1 ORDER BY date DESC`,
        [sub],
      )
      return rows
    }
    const { rows } = await db.query(
      `SELECT w.* FROM weddings w
       JOIN wedding_access wa ON wa.wedding_id = w.id
       WHERE wa.user_id=$1 ORDER BY w.date DESC`,
      [sub],
    )
    return rows
  })

  app.post('/', async (req, reply) => {
    const { sub } = req.user as { sub: number }
    const body = createSchema.parse(req.body)
    const { rows } = await db.query(
      `INSERT INTO weddings (title, date, slug, owner_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [body.title, body.date, body.slug, sub],
    )
    return reply.code(201).send(rows[0])
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(`SELECT * FROM weddings WHERE id=$1`, [id])
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })
    return rows[0]
  })

  // Grant gallery access to a user (photographer only)
  app.post('/:id/access', async (req, reply) => {
    const { role } = req.user as { role: string }
    if (role !== 'photographer') return reply.code(403).send({ error: 'Forbidden' })
    const { id } = req.params as { id: string }
    const { userId } = req.body as { userId: number }
    await db.query(
      `INSERT INTO wedding_access (wedding_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, userId],
    )
    return { ok: true }
  })
}
