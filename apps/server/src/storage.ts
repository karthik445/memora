import fs from 'fs/promises'
import path from 'path'

export const MEDIA_ROOT = process.env.MEDIA_ROOT ?? './media'

export function mediaPath(...parts: string[]): string {
  return path.join(MEDIA_ROOT, ...parts)
}

export async function ensureDir(...parts: string[]): Promise<string> {
  const dir = mediaPath(...parts)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function saveFile(relPath: string, data: Buffer): Promise<void> {
  const full = mediaPath(relPath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, data)
}

export async function deleteFile(relPath: string): Promise<void> {
  try {
    await fs.unlink(mediaPath(relPath))
  } catch {
    // already gone
  }
}

/** Returns a public-facing relative URL for use in API responses. */
export function toPublicUrl(relPath: string): string {
  return `/media/${relPath.replace(/\\/g, '/')}`
}
