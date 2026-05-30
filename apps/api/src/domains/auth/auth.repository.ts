import { prisma } from '@memora/database'
import type { User } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// AuthRepository
//
// Owns all DB access for authentication operations.
// No business logic here — only data access.
// ─────────────────────────────────────────────────────────────────────────────

export class AuthRepository {
  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    })
  }

  async findUserById(id: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async createUserWithTenant(params: {
    email: string
    passwordHash: string
    firstName: string
    lastName: string
    tenantName: string
    tenantSlug: string
  }): Promise<{ userId: string; tenantId: string }> {
    // Atomic transaction: user + tenant + membership created together
    // If any step fails, all changes are rolled back
    return prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          email: params.email,
          passwordHash: params.passwordHash,
          firstName: params.firstName,
          lastName: params.lastName,
        },
        select: { id: true },
      })

      const tenant = await tx.tenant.create({
        data: {
          name: params.tenantName,
          slug: params.tenantSlug,
        },
        select: { id: true },
      })

      await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: 'OWNER',
        },
      })

      return { userId: user.id, tenantId: tenant.id }
    })
  }

  async incrementFailedLoginCount(userId: string): Promise<number> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    })
    return user.failedLoginCount
  }

  async lockAccount(userId: string, until: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: until },
    })
  }

  async resetFailedLoginCount(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    })
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    })
  }

  async isTenantSlugTaken(slug: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    return tenant !== null
  }

  async isEmailTaken(email: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })
    return user !== null
  }
}
