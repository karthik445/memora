'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/auth'
import { apiFetch, apiUpload } from '@/lib/api'
import { GalleryGrid } from '@/components/GalleryGrid'
import { Lightbox } from '@/components/Lightbox'
import { PresenceBar } from '@/components/PresenceBar'
import { UploadZone } from '@/components/UploadZone'
import { FilterBar } from '@/components/FilterBar'
import { usePresence } from '@/hooks/usePresence'

export interface Photo {
  id: number
  url: string
  thumbnailUrl: string
  width: number
  height: number
  is_favorite: boolean
  is_must_have: boolean
  is_blur: boolean
  is_duplicate: boolean
  ai_processed: boolean
  original_filename: string
}

type Filter = 'all' | 'favorite' | 'must_have' | 'blur' | 'duplicate'

export default function GalleryPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { token, user } = useAuthStore()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [uploading, setUploading] = useState(false)
  const { peers, emit } = usePresence(id, token)

  useEffect(() => {
    if (!token) { router.replace('/login'); return }
  }, [token, router])

  const fetchPhotos = useCallback(async () => {
    if (!token) return
    const params = filter === 'all' ? '' : `&filter=${filter}`
    const data = await apiFetch<Photo[]>(`/photos?weddingId=${id}${params}`, {}, token)
    setPhotos(data)
    setLoading(false)
  }, [id, token, filter])

  useEffect(() => { fetchPhotos() }, [fetchPhotos])

  // Poll for AI processing updates
  useEffect(() => {
    const interval = setInterval(fetchPhotos, 8000)
    return () => clearInterval(interval)
  }, [fetchPhotos])

  const updatePhoto = useCallback(async (photoId: number, patch: Partial<Photo>) => {
    if (!token) return
    const updated = await apiFetch<Photo>(`/photos/${photoId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }, token)
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, ...updated } : p))
    emit({ type: 'photo_flag', photoId, patch })
  }, [token, emit])

  // Keyboard navigation
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (selected === null) return
      const photo = photos.find(p => p.id === selected)
      if (!photo) return

      if (e.key === 'f' || e.key === 'F') {
        await updatePhoto(selected, { is_favorite: !photo.is_favorite })
      } else if (e.key === 'm' || e.key === 'M') {
        await updatePhoto(selected, { is_must_have: !photo.is_must_have })
      } else if (e.key === 'Escape') {
        setSelected(null)
      } else if (e.key === 'ArrowRight') {
        const idx = photos.findIndex(p => p.id === selected)
        if (idx < photos.length - 1) setSelected(photos[idx + 1].id)
      } else if (e.key === 'ArrowLeft') {
        const idx = photos.findIndex(p => p.id === selected)
        if (idx > 0) setSelected(photos[idx - 1].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, photos, updatePhoto])

  // Realtime: receive flag updates from peers
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<{ type: string; photoId?: number; patch?: Partial<Photo> }>).detail
      if (msg.type === 'photo_flag' && msg.photoId && msg.patch) {
        setPhotos(prev => prev.map(p => p.id === msg.photoId ? { ...p, ...msg.patch } : p))
      }
    }
    window.addEventListener('memora:ws', handler)
    return () => window.removeEventListener('memora:ws', handler)
  }, [])

  async function handleUpload(files: FileList) {
    if (!token) return
    setUploading(true)
    const form = new FormData()
    Array.from(files).forEach(f => form.append('files', f))
    await apiUpload(`/photos/upload?weddingId=${id}`, form, token)
    setUploading(false)
    fetchPhotos()
  }

  const selectedPhoto = photos.find(p => p.id === selected) ?? null

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-neutral-950/90 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-neutral-400 hover:text-white transition text-sm">← Back</button>
        <span className="text-sm text-neutral-500">Gallery #{id}</span>
        <div className="ml-auto flex items-center gap-3">
          <PresenceBar peers={peers} />
          {user?.role === 'photographer' && (
            <label className="cursor-pointer text-sm bg-brand-500 hover:bg-brand-500/80 px-3 py-1.5 rounded-lg transition">
              {uploading ? 'Uploading…' : '+ Upload'}
              <input type="file" multiple accept="image/*" className="hidden"
                onChange={e => e.target.files && handleUpload(e.target.files)} />
            </label>
          )}
        </div>
      </header>

      <FilterBar active={filter} onChange={setFilter} photos={photos} />

      <main className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-neutral-500">Loading…</div>
        ) : photos.length === 0 ? (
          <UploadZone onUpload={handleUpload} isPhotographer={user?.role === 'photographer'} />
        ) : (
          <GalleryGrid photos={photos} onSelect={setSelected} onFlag={updatePhoto} />
        )}
      </main>

      <AnimatePresence>
        {selectedPhoto && (
          <Lightbox
            photo={selectedPhoto}
            photos={photos}
            onClose={() => setSelected(null)}
            onNavigate={setSelected}
            onFlag={updatePhoto}
          />
        )}
      </AnimatePresence>

      {/* Keyboard shortcut hint */}
      {selected !== null && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900/90 backdrop-blur px-4 py-2 rounded-full text-xs text-neutral-400 flex gap-4">
          <span><kbd className="bg-neutral-700 px-1 rounded">F</kbd> Favorite</span>
          <span><kbd className="bg-neutral-700 px-1 rounded">M</kbd> Must-have</span>
          <span><kbd className="bg-neutral-700 px-1 rounded">←→</kbd> Navigate</span>
          <span><kbd className="bg-neutral-700 px-1 rounded">Esc</kbd> Close</span>
        </div>
      )}
    </div>
  )
}
