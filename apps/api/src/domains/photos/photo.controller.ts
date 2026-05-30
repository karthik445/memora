import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  UploadPhotoQuerySchema,
  ListPhotosQuerySchema,
  UpdatePhotoSchema,
  BulkUpdatePhotosSchema,
} from './photo.dto.js'
import { PhotoService } from './photo.service.js'
import { tenantGuard, requireRole } from '../../middleware/tenantGuard.js'
import { createStorageProvider } from '@memora/storage'
import { ValidationError } from '@memora/shared/errors/AppError.js'

export async function photoRoutes(app: FastifyInstance): Promise<void> {
  const storage = createStorageProvider()
  const service = new PhotoService(storage)

  // All photo routes require authentication + tenant membership
  app.addHook('onRequest', app.authenticate)
  app.addHook('preHandler', tenantGuard)

  // POST /tenants/:tenantId/photos/upload
  // Photographer/Owner only. Streams directly — no intermediate buffer.
  app.post(
    '/upload',
    {
      preHandler: [requireRole('OWNER', 'PHOTOGRAPHER')],
      config: { rawBody: false },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = UploadPhotoQuerySchema.parse(req.query)
      const file = await req.file()

      if (!file) {
        throw new ValidationError('No file provided in request')
      }

      const result = await service.uploadPhoto(file, query, req.tenantUser)

      return reply.code(201).send(result)
    },
  )

  // GET /tenants/:tenantId/photos
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = ListPhotosQuerySchema.parse(req.query)
    const result = await service.listPhotos(query, req.tenantUser)
    return reply.send(result)
  })

  // GET /tenants/:tenantId/photos/:photoId
  app.get('/:photoId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { photoId } = req.params as { photoId: string }
    const photo = await service.getPhoto(photoId, req.tenantUser)
    return reply.send(photo)
  })

  // PATCH /tenants/:tenantId/photos/:photoId
  app.patch('/:photoId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { photoId } = req.params as { photoId: string }
    const dto = UpdatePhotoSchema.parse(req.body)
    const photo = await service.updatePhoto(photoId, dto, req.tenantUser)
    return reply.send(photo)
  })

  // PATCH /tenants/:tenantId/photos/bulk
  app.patch(
    '/bulk',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const dto = BulkUpdatePhotosSchema.parse(req.body)
      const result = await service.bulkUpdatePhotos(dto, req.tenantUser)
      return reply.send(result)
    },
  )

  // DELETE /tenants/:tenantId/photos/:photoId
  app.delete(
    '/:photoId',
    {
      preHandler: [requireRole('OWNER', 'PHOTOGRAPHER')],
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { photoId } = req.params as { photoId: string }
      await service.deletePhoto(photoId, req.tenantUser)
      return reply.code(204).send()
    },
  )
}
