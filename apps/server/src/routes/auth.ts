import type { FastifyInstance } from 'fastify'
import bcryptjs from 'bcryptjs'
const { hash: bcryptHash, compare: bcryptCompare } = bcryptjs
import { db } from '../db.js'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['client', 'photographer']).default('client'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const body = registerSchema.parse(req.body)
    const passwordHash = await bcryptHash(body.password, 12)
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role`,
      [body.email, passwordHash, body.name, body.role],
    )
    const user = rows[0]
    const token = app.jwt.sign({ sub: user.id, role: user.role })
    return reply.code(201).send({ token, user })
  })

  app.post('/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    const { rows } = await db.query(`SELECT * FROM users WHERE email=$1`, [body.email])
    const user = rows[0]
    if (!user || !(await bcryptCompare(body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
    const token = app.jwt.sign({ sub: user.id, role: user.role })
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  app.get('/me', async (req) => {
    const payload = req.user as { sub: number }
    const { rows } = await db.query(`SELECT id, email, name, role FROM users WHERE id=$1`, [payload.sub])
    return rows[0]
  })
}
