import type { FastifyInstance } from 'fastify'
import { extname, join, basename } from 'path'
import { pipeline } from 'stream/promises'
import { statSync, createWriteStream, readdirSync } from 'fs'
import { db } from '../db.js'
import { ensureDir, mediaPath, MEDIA_ROOT, toPublicUrl } from '../storage.js'
import { enqueueAiJob } from '../queue.js'

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.raw', '.cr2', '.nef', '.arw', '.dng'])

export async function photoRoutes(app: FastifyInstance) {
  // Upload one or more photos to a wedding gallery
  app.post('/upload', async (req, reply) => {
    const weddingId = (req.query as { weddingId: string }).weddingId
    if (!weddingId) return reply.code(400).send({ error: 'weddingId required' })

    const parts = req.parts()
    const saved: number[] = []

    for await (const part of parts) {
      if (part.type !== 'file') continue

      const ext = extname(part.filename).toLowerCase()
      const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.raw', '.cr2', '.nef']
      if (!allowed.includes(ext)) continue

      const relDir = `weddings/${weddingId}/originals`
      await ensureDir(`weddings/${weddingId}/originals`)
      await ensureDir(`weddings/${weddingId}/thumbs`)

      const filename = `${Date.now()}-${part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const relPath = `${relDir}/${filename}`
      const fullPath = mediaPath(relPath)

      await pipeline(part.file, createWriteStream(fullPath))

      const stat = statSync(fullPath)

      const { rows } = await db.query(
        `INSERT INTO photos (wedding_id, storage_path, original_filename, file_size)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [weddingId, relPath, part.filename, stat.size],
      )
      const photoId = rows[0].id
      saved.push(photoId)

      // Dispatch AI processing job (blur, face, embedding, thumbnail)
      await enqueueAiJob(photoId, parseInt(weddingId), relPath)
    }

    return reply.code(201).send({ uploaded: saved.length, photoIds: saved })
  })

  // List photos for a wedding
  app.get('/', async (req) => {
    const { weddingId, page = '1', limit = '100', filter } = req.query as {
      weddingId?: string; page?: string; limit?: string; filter?: string
    }
    if (!weddingId) return []

    const offset = (parseInt(page) - 1) * parseInt(limit)
    let where = `WHERE wedding_id=$1`
    const params: unknown[] = [weddingId]

    if (filter === 'favorite') { where += ` AND is_favorite=true` }
    else if (filter === 'must_have') { where += ` AND is_must_have=true` }
    else if (filter === 'blur') { where += ` AND is_blur=true` }
    else if (filter === 'duplicate') { where += ` AND is_duplicate=true` }

    const { rows } = await db.query(
      `SELECT id, storage_path, thumbnail_path, original_filename, width, height,
              taken_at, is_blur, is_duplicate, is_favorite, is_must_have, ai_processed, blur_score, created_at
       FROM photos ${where}
       ORDER BY taken_at ASC NULLS LAST, created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset],
    )

    return rows.map(r => ({
      ...r,
      url: r.storage_path ? toPublicUrl(r.storage_path) : null,
      thumbnailUrl: r.thumbnail_path ? toPublicUrl(r.thumbnail_path) : null,
    }))
  })

  // Get single photo with face tracks
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(`SELECT * FROM photos WHERE id=$1`, [id])
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })

    const { rows: faces } = await db.query(
      `SELECT id, bbox, person_label FROM face_tracks WHERE photo_id=$1`,
      [id],
    )
    const photo = rows[0]
    return {
      ...photo,
      url: toPublicUrl(photo.storage_path),
      thumbnailUrl: photo.thumbnail_path ? toPublicUrl(photo.thumbnail_path) : null,
      faces,
    }
  })

  // Update photo flags (favorite, must_have)
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { is_favorite, is_must_have } = req.body as { is_favorite?: boolean; is_must_have?: boolean }

    const updates: string[] = []
    const params: unknown[] = []

    if (is_favorite !== undefined) { params.push(is_favorite); updates.push(`is_favorite=$${params.length}`) }
    if (is_must_have !== undefined) { params.push(is_must_have); updates.push(`is_must_have=$${params.length}`) }

    if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' })

    params.push(id)
    const { rows } = await db.query(
      `UPDATE photos SET ${updates.join(',')} WHERE id=$${params.length} RETURNING id, is_favorite, is_must_have`,
      params,
    )
    return rows[0]
  })

  // Delete a photo
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.query(`DELETE FROM photos WHERE id=$1`, [id])
    return reply.code(204).send()
  })

  // Bulk delete duplicates for a wedding
  app.delete('/bulk/duplicates', async (req) => {
    const { weddingId } = req.query as { weddingId: string }
    const { rowCount } = await db.query(
      `DELETE FROM photos WHERE wedding_id=$1 AND is_duplicate=true`,
      [weddingId],
    )
    return { deleted: rowCount }
  })

  // ── Bulk import from local disk path ─────────────────────────────────────
  // POST /photos/import?weddingId=1
  // Body: { "folderPath": "E:\\Photos\\JohnJane2026" }
  //
  // Scans folderPath (must be accessible inside the container via MEDIA_ROOT
  // or an absolute host path mounted in Docker), registers every photo in the
  // DB and enqueues AI processing — no file copying, files stay where they are.
  app.post('/import', async (req, reply) => {
    const { role } = req.user as { role: string }
    if (role !== 'photographer') return reply.code(403).send({ error: 'Only photographers can import' })

    const weddingId = (req.query as { weddingId: string }).weddingId
    if (!weddingId) return reply.code(400).send({ error: 'weddingId required' })

    const { folderPath } = req.body as { folderPath?: string }
    if (!folderPath) return reply.code(400).send({ error: 'folderPath required' })

    // Resolve: if path is relative treat it as relative to MEDIA_ROOT,
    // otherwise use as-is (absolute path on the host, must be mounted)
    const resolvedFolder = folderPath.startsWith('/') || /^[A-Za-z]:\\/.test(folderPath)
      ? folderPath
      : join(MEDIA_ROOT, folderPath)

    let entries: string[]
    try {
      entries = readdirSync(resolvedFolder)
    } catch {
      return reply.code(400).send({ error: `Cannot read folder: ${resolvedFolder}` })
    }

    const imported: number[] = []
    const skipped: string[] = []

    for (const filename of entries) {
      const ext = extname(filename).toLowerCase()
      if (!ALLOWED_EXTS.has(ext)) { skipped.push(filename); continue }

      const fullPath = join(resolvedFolder, filename)

      let stat
      try { stat = statSync(fullPath) } catch { skipped.push(filename); continue }
      if (!stat.isFile()) { skipped.push(filename); continue }

      // Store path relative to MEDIA_ROOT so it's portable
      const relPath = fullPath.startsWith(MEDIA_ROOT)
        ? fullPath.slice(MEDIA_ROOT.length).replace(/\\/g, '/').replace(/^\//, '')
        : `imported/${weddingId}/${basename(filename)}`

      // Skip already-imported files
      const { rows: existing } = await db.query(
        `SELECT id FROM photos WHERE wedding_id=$1 AND storage_path=$2`,
        [weddingId, relPath],
      )
      if (existing.length > 0) { skipped.push(filename); continue }

      await ensureDir(`weddings/${weddingId}/thumbs`)

      const { rows } = await db.query(
        `INSERT INTO photos (wedding_id, storage_path, original_filename, file_size)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [weddingId, relPath, filename, stat.size],
      )
      const photoId = rows[0].id
      imported.push(photoId)

      await enqueueAiJob(photoId, parseInt(weddingId), relPath)
    }

    return reply.code(201).send({
      imported: imported.length,
      skipped: skipped.length,
      photoIds: imported,
    })
  })
}
