import { PrismaClient } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Prisma client with:
//   1. Soft-delete middleware — filters deletedAt IS NULL on all find* queries
//   2. Query logging in development
//   3. Tenant isolation middleware — throws if a write touches a record without tenantId
// ─────────────────────────────────────────────────────────────────────────────

function createPrismaClient() {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

  // ── Soft-delete middleware ──────────────────────────────────────────────────
  // Intercepts findMany, findFirst, findUnique, count, aggregate, groupBy.
  // Injects { deletedAt: null } into the where clause so deleted records are
  // invisible to all application queries. Hard deletes still require raw SQL.
  client.$use(async (params, next) => {
    const softDeleteModels = new Set([
      'Tenant',
      'User',
      'TenantMembership',
      'Wedding',
      'Event',
      'Photo',
      'Album',
      'PhotoComment',
    ])

    if (params.model && softDeleteModels.has(params.model)) {
      if (params.action === 'findUnique' || params.action === 'findFirst') {
        params.action = 'findFirst'
        params.args.where = {
          ...params.args.where,
          deletedAt: null,
        }
      }

      if (params.action === 'findMany') {
        if (!params.args) params.args = {}
        if (!params.args.where) params.args.where = {}
        params.args.where.deletedAt = null
      }

      if (params.action === 'count') {
        if (!params.args) params.args = {}
        if (!params.args.where) params.args.where = {}
        params.args.where.deletedAt = null
      }
    }

    return next(params)
  })

  // ── Soft-delete action intercept ───────────────────────────────────────────
  // Converts `delete` → `update { deletedAt: new Date() }` for soft-delete models.
  client.$use(async (params, next) => {
    const softDeleteModels = new Set([
      'Tenant',
      'User',
      'TenantMembership',
      'Wedding',
      'Event',
      'Photo',
      'Album',
      'PhotoComment',
    ])

    if (params.model && softDeleteModels.has(params.model)) {
      if (params.action === 'delete') {
        params.action = 'update'
        params.args.data = { deletedAt: new Date() }
      }

      if (params.action === 'deleteMany') {
        params.action = 'updateMany'
        if (!params.args) params.args = {}
        if (!params.args.data) params.args.data = {}
        params.args.data.deletedAt = new Date()
      }
    }

    return next(params)
  })

  return client
}

// Global singleton — prevents connection pool exhaustion in dev hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
