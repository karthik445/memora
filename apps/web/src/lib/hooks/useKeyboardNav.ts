'use client'

import { useEffect } from 'react'
import { useGalleryStore } from '@/lib/stores/gallery.store'
import type { Photo } from '@/types/api'

interface UseKeyboardNavOptions {
  photos: Photo[]
  onFlag: (photoId: string, flag: 'FAVORITE' | 'MUST_HAVE' | 'REJECTED' | 'NONE') => void
  enabled?: boolean
}

export function useKeyboardNav({ photos, onFlag, enabled = true }: UseKeyboardNavOptions) {
  const { lightboxPhotoId, openLightbox, closeLightbox, lightboxNavigate } = useGalleryStore()

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return

      switch (e.key) {
        case 'Escape':
          closeLightbox()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          if (lightboxPhotoId) {
            e.preventDefault()
            lightboxNavigate(photos, 'next')
          }
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          if (lightboxPhotoId) {
            e.preventDefault()
            lightboxNavigate(photos, 'prev')
          }
          break
        case 'f':
        case 'F':
          if (lightboxPhotoId) {
            const photo = photos.find(p => p.id === lightboxPhotoId)
            onFlag(lightboxPhotoId, photo?.selectionFlag === 'FAVORITE' ? 'NONE' : 'FAVORITE')
          }
          break
        case 'm':
        case 'M':
          if (lightboxPhotoId) {
            const photo = photos.find(p => p.id === lightboxPhotoId)
            onFlag(lightboxPhotoId, photo?.selectionFlag === 'MUST_HAVE' ? 'NONE' : 'MUST_HAVE')
          }
          break
        case 'x':
        case 'X':
          if (lightboxPhotoId) {
            const photo = photos.find(p => p.id === lightboxPhotoId)
            onFlag(lightboxPhotoId, photo?.selectionFlag === 'REJECTED' ? 'NONE' : 'REJECTED')
          }
          break
        case ' ':
          if (!lightboxPhotoId && photos.length > 0) {
            e.preventDefault()
            openLightbox(photos[0]!.id)
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, lightboxPhotoId, photos, onFlag, openLightbox, closeLightbox, lightboxNavigate])
}
