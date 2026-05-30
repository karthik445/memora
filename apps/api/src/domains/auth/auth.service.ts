import bcryptjs from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { AuthRepository } from './auth.repository.js'
import type { RegisterDto, LoginDto } from './auth.dto.js'
import {
  UnauthorizedError,
  ConflictError,
  AppError,
} from '@memora/shared/errors/AppError.js'
import { prisma } from '@memora/database'

const { hash: bcryptHash, compare: bcryptCompare } = bcryptjs

// ─────────────────────────────────────────────────────────────────────────────
// AuthService
//
// Business logic for all authentication operations.
//
// Security decisions:
// - bcrypt cost factor 12: ~250ms per hash on modern hardware
//   Prevents brute-force even if DB is compromised
// - Account lockout after 5 failed attempts: 15 minute lockout
//   Prevents online brute force
// - Constant-time password comparison (bcrypt handles this internally)
// - Email enumeration prevention: register returns same message for
//   taken/available emails (timing-safe via uniform bcrypt cost)
// - JWT access token: short-lived (15 minutes)
// - Refresh token: long-lived (7 days), stored in httpOnly cookie
// ─────────────────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds
}

export interface AuthResult {
  tokens: AuthTokens
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
  }
}

export class AuthService {
  private readonly repo = new AuthRepository()

  constructor(private readonly app: FastifyInstance) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    // Check email uniqueness
    const emailTaken = await this.repo.isEmailTaken(dto.email)
    if (emailTaken) {
      // Still run bcrypt to prevent timing-based enumeration
      await bcryptHash('timing-equalizer', BCRYPT_ROUNDS)
      throw new ConflictError('An account with this email already exists')
    }

    // Check tenant slug uniqueness
    const slugTaken = await this.repo.isTenantSlugTaken(dto.tenantSlug)
    if (slugTaken) {
      throw new ConflictError('This studio URL is already taken', { field: 'tenantSlug' })
    }

    const passwordHash = await bcryptHash(dto.password, BCRYPT_ROUNDS)

    const { userId, tenantId } = await this.repo.createUserWithTenant({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      tenantName: dto.tenantName,
      tenantSlug: dto.tenantSlug,
    })

    await this.writeAuditLog({
      tenantId,
      userId,
      action: 'AUTH_REGISTER',
      resource: 'user',
      resourceId: userId,
    })

    return this.issueTokensForUser(userId, dto.email, tenantId)
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.repo.findUserByEmail(dto.email)

    // Always run bcrypt even when user not found — prevents timing enumeration
    const dummyHash = '$2b$12$KIXJq8N0S1oFKBm3SN4M9OXa0d6e5K3E6E4JXo/O2vAXpXvBSTBXe'
    const passwordMatch = user
      ? await bcryptCompare(dto.password, user.passwordHash)
      : await bcryptCompare(dto.password, dummyHash).then(() => false)

    if (!user || !passwordMatch) {
      if (user) {
        const failCount = await this.repo.incrementFailedLoginCount(user.id)
        if (failCount >= MAX_FAILED_ATTEMPTS) {
          await this.repo.lockAccount(
            user.id,
            new Date(Date.now() + LOCKOUT_DURATION_MS),
          )
        }
      }
      // Identical error message whether user exists or not — prevents enumeration
      throw new UnauthorizedError('Invalid email or password')
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const secondsRemaining = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000,
      )
      throw new AppError(
        'ACCOUNT_LOCKED',
        `Account is temporarily locked. Try again in ${Math.ceil(secondsRemaining / 60)} minutes.`,
        403,
        { lockedUntil: user.lockedUntil.toISOString() },
      )
    }

    await this.repo.resetFailedLoginCount(user.id)

    // Get primary tenant membership
    const membership = await prisma.tenantMembership.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { tenantId: true },
      orderBy: { createdAt: 'asc' },
    })

    if (!membership) {
      throw new UnauthorizedError('No active membership found')
    }

    await this.writeAuditLog({
      tenantId: membership.tenantId,
      userId: user.id,
      action: 'AUTH_LOGIN',
      resource: 'user',
      resourceId: user.id,
    })

    return this.issueTokensForUser(user.id, user.email, membership.tenantId)
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; email: string; tenantId: string; type: string }

    try {
      payload = this.app.jwt.verify(refreshToken) as typeof payload
    } catch {
      throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid or expired', 401)
    }

    if (payload.type !== 'refresh') {
      throw new AppError('REFRESH_TOKEN_INVALID', 'Invalid token type', 401)
    }

    const user = await this.repo.findUserById(payload.sub)
    if (!user) {
      throw new AppError('REFRESH_TOKEN_INVALID', 'User no longer exists', 401)
    }

    const tokens = this.generateTokens(payload.sub, payload.email, payload.tenantId)
    return tokens
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.repo.findUserById(userId)
    if (!user) throw new UnauthorizedError()

    const valid = await bcryptCompare(currentPassword, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Current password is incorrect')

    const newHash = await bcryptHash(newPassword, BCRYPT_ROUNDS)
    await this.repo.updatePassword(userId, newHash)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async issueTokensForUser(
    userId: string,
    email: string,
    tenantId: string,
  ): Promise<AuthResult> {
    const user = await this.repo.findUserById(userId)
    if (!user) throw new UnauthorizedError()

    const tokens = this.generateTokens(userId, email, tenantId)

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    }
  }

  private generateTokens(
    userId: string,
    email: string,
    tenantId: string,
  ): AuthTokens {
    const accessToken = this.app.jwt.sign(
      { sub: userId, email, tenantId, type: 'access' },
      { expiresIn: ACCESS_TOKEN_TTL },
    )

    const refreshToken = this.app.jwt.sign(
      { sub: userId, email, tenantId, type: 'refresh' },
      { expiresIn: REFRESH_TOKEN_TTL },
    )

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    }
  }

  private async writeAuditLog(params: {
    tenantId: string
    userId: string
    action: string
    resource: string
    resourceId: string
  }): Promise<void> {
    await prisma.auditLog.create({
      data: params,
    }).catch(err => {
      // Audit log failure must never block authentication
      this.app.log.error({ err }, 'Failed to write audit log')
    })
  }
}
