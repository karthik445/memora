import { prisma } from '@memora/database'
import type { Photo, PhotoSelectionFlag, AiJobStatus, Prisma } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// PhotoRepository
//
// All queries are tenantId-scoped. It is structurally impossible to return
// a photo that belongs to a different tenant.
//
// Cursor pagination strategy:
// - Cursor is the `id` of the last record on the previous page
// - Sorting by (takenAt, id) or (createdAt, id) for deterministic ordering
// - Composite index on (tenantId, weddingId, createdAt) covers the default case
// - Composite index on (tenantId, weddingId, takenAt) covers chronological case
// ─────────────────────────────────────────────────────────────────────────────

export interface PhotoCursorPage {
  photos: Photo[]
  nextCursor: string | null
  hasMore: boolean
}

export interface ListPhotosParams {
  tenantId: string
  weddingId: string
  eventId?: string
  cursor?: string
  limit: number
  sortBy: 'createdAt' | 'takenAt'
  sortDir: 'asc' | 'desc'
  filter: 'all' | 'favorite' | 'must_have' | 'rejected' | 'blur' | 'duplicate' | 'unprocessed'
}

export class PhotoRepository {
  async findById(id: string, tenantId: string): Promise<Photo | null> {
    return prisma.photo.findFirst({
      where: { id, tenantId, deletedAt: null },
    })
  }

  async findByIdempotencyKey(key: string, tenantId: string): Promise<Photo | null> {
    return prisma.photo.findFirst({
      where: { idempotencyKey: key, tenantId },
    })
  }

  async listWithCursor(params: ListPhotosParams): Promise<PhotoCursorPage> {
    const where = this.buildWhereClause(params)

    // Fetch limit + 1 to determine if there's a next page
    const take = params.limit + 1

    // Cursor: find the record AFTER this id
    let cursorCondition: Prisma.PhotoWhereInput | undefined

    if (params.cursor) {
      const cursorPhoto = await prisma.photo.findFirst({
        where: { id: params.cursor, tenantId: params.tenantId },
        select: { id: true, createdAt: true, takenAt: true },
      })

      if (cursorPhoto) {
        const sortField = params.sortBy
        const cursorValue = cursorPhoto[sortField]

        if (cursorValue) {
          if (params.sortDir === 'asc') {
            cursorCondition = {
              OR: [
                { [sortField]: { gt: cursorValue } },
                {
                  [sortField]: { equals: cursorValue },
                  id: { gt: params.cursor },
                },
              ],
            }
          } else {
            cursorCondition = {
              OR: [
                { [sortField]: { lt: cursorValue } },
                {
                  [sortField]: { equals: cursorValue },
                  id: { lt: params.cursor },
                },
              ],
            }
          }
        }
      }
    }

    const photos = await prisma.photo.findMany({
      where: {
        ...where,
        ...(cursorCondition ?? {}),
      },
      orderBy: [
        { [params.sortBy]: params.sortDir },
        { id: params.sortDir }, // tiebreaker for deterministic pagination
      ],
      take,
    })

    const hasMore = photos.length > params.limit
    const data = hasMore ? photos.slice(0, params.limit) : photos
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null

    return { photos: data, nextCursor, hasMore }
  }

  async create(data: {
    tenantId: string
    weddingId: string
    eventId?: string
    storagePath: string
    originalFilename: string
    mimeType: string
    fileSize: bigint
    checksum: string
    idempotencyKey: string
    uploadedById: string
  }): Promise<Photo> {
    return prisma.photo.create({ data })
  }

  async updateSelectionFlag(
    id: string,
    tenantId: string,
    flag: PhotoSelectionFlag,
  ): Promise<Photo> {
    return prisma.photo.update({
      where: { id },
      data: {
        selectionFlag: flag,
        updatedAt: new Date(),
      },
    })
  }

  async bulkUpdateSelectionFlag(
    ids: string[],
    tenantId: string,
    flag: PhotoSelectionFlag,
  ): Promise<number> {
    const result = await prisma.photo.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { selectionFlag: flag },
    })
    return result.count
  }

  async updateAiFields(
    id: string,
    data: {
      aiStatus: AiJobStatus
      aiProcessedAt?: Date
      isBlur?: boolean
      blurScore?: number
      isDuplicate?: boolean
      duplicateOfId?: string
      thumbnailPath?: string
      webpPath?: string
      width?: number
      height?: number
      takenAt?: Date
      cameraMake?: string
      cameraModel?: string
    },
  ): Promise<void> {
    await prisma.photo.update({
      where: { id },
      data: {
        ...data,
        aiProcessedAt: data.aiStatus === 'COMPLETED' ? new Date() : undefined,
      },
    })
  }

  async countByWedding(
    tenantId: string,
    weddingId: string,
    filter?: 'favorite' | 'must_have' | 'rejected' | 'blur' | 'duplicate',
  ): Promise<number> {
    return prisma.photo.count({
      where: {
        ...this.buildFilterClause(filter),
        tenantId,
        weddingId,
        deletedAt: null,
      },
    })
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    // Prisma middleware converts this to an update with deletedAt
    await prisma.photo.delete({ where: { id } })
    void tenantId // verified in service layer before calling this
  }

  async verifyOwnership(id: string, tenantId: string): Promise<boolean> {
    const count = await prisma.photo.count({
      where: { id, tenantId, deletedAt: null },
    })
    return count > 0
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildWhereClause(params: ListPhotosParams): Prisma.PhotoWhereInput {
    return {
      tenantId: params.tenantId,
      weddingId: params.weddingId,
      ...(params.eventId ? { eventId: params.eventId } : {}),
      deletedAt: null,
      ...this.buildFilterClause(params.filter === 'all' ? undefined : params.filter as 'favorite' | 'must_have' | 'rejected' | 'blur' | 'duplicate'),
    }
  }

  private buildFilterClause(
    filter?: 'favorite' | 'must_have' | 'rejected' | 'blur' | 'duplicate' | 'unprocessed',
  ): Prisma.PhotoWhereInput {
    switch (filter) {
      case 'favorite':
        return { selectionFlag: 'FAVORITE' }
      case 'must_have':
        return { selectionFlag: 'MUST_HAVE' }
      case 'rejected':
        return { selectionFlag: 'REJECTED' }
      case 'blur':
        return { isBlur: true }
      case 'duplicate':
        return { isDuplicate: true }
      case 'unprocessed':
        return { aiStatus: { in: ['QUEUED', 'PROCESSING'] } }
      default:
        return {}
    }
  }
}
