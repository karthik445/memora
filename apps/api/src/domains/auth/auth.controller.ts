import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
  type RegisterDto,
  type LoginDto,
  type RefreshTokenDto,
  type ChangePasswordDto,
} from './auth.dto.js'
import { AuthService } from './auth.service.js'
import { UnauthorizedError } from '@memora/shared/errors/AppError.js'

// ─────────────────────────────────────────────────────────────────────────────
// Auth Controller
//
// Thin layer — only parses, validates, delegates, and formats responses.
// No business logic.
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_TOKEN_COOKIE = 'memora_refresh'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuthService(app)

  // POST /auth/register
  app.post('/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const dto = RegisterSchema.parse(req.body)
    const result = await service.register(dto)

    setRefreshTokenCookie(reply, result.tokens.refreshToken)

    return reply.code(201).send({
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
      user: result.user,
    })
  })

  // POST /auth/login
  app.post('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const dto = LoginSchema.parse(req.body)
    const result = await service.login(dto)

    setRefreshTokenCookie(reply, result.tokens.refreshToken)

    return reply.send({
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
      user: result.user,
    })
  })

  // POST /auth/refresh
  // Reads refresh token from httpOnly cookie (preferred) or body (fallback)
  app.post('/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const cookieToken = (req.cookies as Record<string, string>)[REFRESH_TOKEN_COOKIE]
    const bodyToken = cookieToken
      ? undefined
      : RefreshTokenSchema.parse(req.body).refreshToken

    const refreshToken = cookieToken ?? bodyToken
    if (!refreshToken) throw new UnauthorizedError('Refresh token required')

    const tokens = await service.refreshTokens(refreshToken)
    setRefreshTokenCookie(reply, tokens.refreshToken)

    return reply.send({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    })
  })

  // POST /auth/logout
  app.post(
    '/logout',
    { onRequest: [app.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      clearRefreshTokenCookie(reply)
      return reply.code(204).send()
    },
  )

  // POST /auth/change-password
  app.post(
    '/change-password',
    { onRequest: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const dto = ChangePasswordSchema.parse(req.body)
      const payload = req.user as { sub: string }
      await service.changePassword(payload.sub, dto.currentPassword, dto.newPassword)
      return reply.code(204).send()
    },
  )

  // GET /auth/me
  app.get(
    '/me',
    { onRequest: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const payload = req.user as { sub: string; email: string; tenantId: string }
      return reply.send({
        userId: payload.sub,
        email: payload.email,
        tenantId: payload.tenantId,
      })
    },
  )
}

function setRefreshTokenCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    path: '/auth',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  })
}

function clearRefreshTokenCookie(reply: FastifyReply): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    path: '/auth',
    maxAge: 0,
  })
}
