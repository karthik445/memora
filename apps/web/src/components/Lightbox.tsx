'use client'

import { motion } from 'framer-motion'
import { Photo } from '@/app/gallery/[id]/page'
import { useEffect, useState } from 'react'
import { apiFetch, BASE } from '@/lib/api'

function mediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${BASE}${path}`
}
import { useAuthStore } from '@/store/auth'

interface Comment { id: number; body: string; author_name: string; created_at: string }

interface Props {
  photo: Photo
  photos: Photo[]
  onClose: () => void
  onNavigate: (id: number) => void
  onFlag: (id: number, patch: Partial<Photo>) => void
}

export function Lightbox({ photo, photos, onClose, onNavigate, onFlag }: Props) {
  const { token } = useAuthStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const idx = photos.findIndex(p => p.id === photo.id)

  useEffect(() => {
    if (!token) return
    apiFetch<Comment[]>(`/photos/${photo.id}/comments`, {}, token).then(setComments).catch(() => {})
  }, [photo.id, token])

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !newComment.trim()) return
    const c = await apiFetch<Comment>(`/photos/${photo.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: newComment }),
    }, token)
    setComments(prev => [...prev, c])
    setNewComment('')
  }

  // Swipe gesture support
  let touchStartX = 0
  const onTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) < 50) return
    if (dx < 0 && idx < photos.length - 1) onNavigate(photos[idx + 1].id)
    if (dx > 0 && idx > 0) onNavigate(photos[idx - 1].id)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Close */}
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl z-10">✕</button>

      {/* Prev */}
      {idx > 0 && (
        <button onClick={() => onNavigate(photos[idx - 1].id)}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-3xl z-10">‹</button>
      )}

      {/* Image */}
      <motion.div
        key={photo.id}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex items-center justify-center p-8"
      >
        <img src={mediaUrl(photo.url)} alt={photo.original_filename}
          className="max-h-[85vh] max-w-full object-contain rounded-md shadow-2xl" />
      </motion.div>

      {/* Next */}
      {idx < photos.length - 1 && (
        <button onClick={() => onNavigate(photos[idx + 1].id)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-3xl z-10">›</button>
      )}

      {/* Side panel */}
      <div className="w-72 bg-neutral-900 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-neutral-800 space-y-2">
          <p className="text-xs text-neutral-400 truncate">{photo.original_filename}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onFlag(photo.id, { is_favorite: !photo.is_favorite })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${photo.is_favorite ? 'bg-yellow-500 text-black' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            >♥ Favorite</button>
            <button
              onClick={() => onFlag(photo.id, { is_must_have: !photo.is_must_have })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${photo.is_must_have ? 'bg-brand-500 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            >★ Must-have</button>
          </div>
          <div className="flex gap-2 text-xs text-neutral-500">
            {photo.is_blur && <span className="bg-neutral-800 px-2 py-1 rounded">Blurry</span>}
            {photo.is_duplicate && <span className="bg-neutral-800 px-2 py-1 rounded">Duplicate</span>}
            {!photo.ai_processed && <span className="bg-neutral-800 px-2 py-1 rounded">Processing…</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Comments</p>
          {comments.map(c => (
            <div key={c.id} className="text-sm">
              <span className="font-medium text-neutral-200">{c.author_name} </span>
              <span className="text-neutral-400">{c.body}</span>
            </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-neutral-600">No comments yet.</p>}
        </div>

        <form onSubmit={postComment} className="p-4 border-t border-neutral-800 flex gap-2">
          <input
            className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
            placeholder="Add a comment…"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
          />
          <button type="submit" className="bg-brand-500 px-3 rounded-lg text-sm">→</button>
        </form>
      </div>
    </motion.div>
  )
}
