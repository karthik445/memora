import type { FastifyInstance } from 'fastify'
import bcryptjs from 'bcryptjs'
const { hash: bcryptHash, compare: bcryptCompare } = bcryptjs
import { db } from '../db.js'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Accept both new-style (firstName+lastName) and legacy (name)
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  // New frontend sends tenantName/tenantSlug — ignored by old server
  tenantName: z.string().optional(),
  tenantSlug: z.string().optional(),
  role: z.enum(['client', 'photographer']).default('client'),
}).transform(body => ({
  ...body,
  // Resolve display name from whichever fields were sent
  name: body.name ?? [body.firstName, body.lastName].filter(Boolean).join(' ') || 'User',
}))

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
    // Return shape the new frontend expects
    return reply.code(201).send({
      accessToken: token,
      expiresIn: 900,
      tenantId: null, // old server has no tenants
      user: {
        id: user.id,
        email: user.email,
        firstName: body.firstName ?? user.name.split(' ')[0] ?? user.name,
        lastName: body.lastName ?? user.name.split(' ').slice(1).join(' ') ?? '',
      },
    })
  })

  app.post('/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    const { rows } = await db.query(`SELECT * FROM users WHERE email=$1`, [body.email])
    const user = rows[0]
    if (!user || !(await bcryptCompare(body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
    const token = app.jwt.sign({ sub: user.id, role: user.role })
    const nameParts = (user.name ?? '').split(' ')
    return reply.send({
      accessToken: token,
      expiresIn: 900,
      tenantId: null,
      user: {
        id: user.id,
        email: user.email,
        firstName: nameParts[0] ?? '',
        lastName: nameParts.slice(1).join(' ') ?? '',
      },
    })
  })

  app.get('/me', async (req) => {
    const payload = req.user as { sub: number }
    const { rows } = await db.query(`SELECT id, email, name, role FROM users WHERE id=$1`, [payload.sub])
    const user = rows[0]
    if (!user) return null
    const nameParts = (user.name ?? '').split(' ')
    return {
      id: user.id,
      email: user.email,
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' ') ?? '',
      role: user.role,
    }
  })
}
