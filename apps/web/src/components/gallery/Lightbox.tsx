'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import {
  X, ChevronLeft, ChevronRight, Heart, Star, Download,
  MessageSquare, ZoomIn, ZoomOut,
} from 'lucide-react'
import { useGalleryStore } from '@/lib/stores/gallery.store'
import type { Photo, PhotoSelectionFlag } from '@/types/api'
import { cn } from '@/lib/utils'
import { lightboxOverlayVariants, lightboxImageVariants } from '@/lib/motion/variants'
import { formatDate, formatBytes } from '@/lib/utils'

interface Props {
  photos: Photo[]
  signedUrls: Record<string, string>
  onFlag: (photoId: string, flag: PhotoSelectionFlag) => void
}

export function Lightbox({ photos, signedUrls, onFlag }: Props) {
  const { lightboxPhotoId, closeLightbox, lightboxNavigate } = useGalleryStore()
  const [zoom, setZoom] = useState(1)
  const [showInfo, setShowInfo] = useState(false)
  const prevIdRef = useRef<string | null>(null)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')

  const photo = photos.find(p => p.id === lightboxPhotoId)

  // Track navigation direction for slide animation
  useEffect(() => {
    if (!lightboxPhotoId || !prevIdRef.current) { prevIdRef.current = lightboxPhotoId; return }
    const prevIdx = photos.findIndex(p => p.id === prevIdRef.current)
    const currIdx = photos.findIndex(p => p.id === lightboxPhotoId)
    setDirection(currIdx >= prevIdx ? 'next' : 'prev')
    prevIdRef.current = lightboxPhotoId
    setZoom(1)
  }, [lightboxPhotoId, photos])

  if (!photo) return null

  const signedUrl = signedUrls[`${photo.id}:original`]
    ?? signedUrls[`${photo.id}:thumbnail`]
    ?? ''

  const currentIdx = photos.findIndex(p => p.id === lightboxPhotoId)

  const xSlide = direction === 'next'
    ? { initial: { x: 60, opacity: 0 }, exit: { x: -60, opacity: 0 } }
    : { initial: { x: -60, opacity: 0 }, exit: { x: 60, opacity: 0 } }

  return (
    <AnimatePresence>
      {lightboxPhotoId && (
        <motion.div
          variants={lightboxOverlayVariants}
          initial="initial"
          animate="enter"
          exit="exit"
          className="fixed inset-0 z-50 bg-black/95 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
        >
          {/* Navigation — prev */}
          <button
            onClick={() => lightboxNavigate(photos, 'prev')}
            disabled={currentIdx === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors disabled:opacity-20"
            aria-label="Previous photo"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Navigation — next */}
          <button
            onClick={() => lightboxNavigate(photos, 'next')}
            disabled={currentIdx === photos.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors disabled:opacity-20"
            aria-label="Next photo"
          >
            <ChevronRight size={20} />
          </button>

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span>{currentIdx + 1}</span>
              <span>/</span>
              <span>{photos.length}</span>
            </div>

            <p className="text-white/60 text-xs font-mono truncate max-w-xs">
              {photo.originalFilename}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(z => Math.min(z + 0.5, 3))}
                className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))}
                className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => setShowInfo(v => !v)}
                className={cn(
                  'w-8 h-8 rounded-md text-white flex items-center justify-center transition-colors',
                  showInfo ? 'bg-brand-500' : 'bg-white/10 hover:bg-white/20',
                )}
                aria-label="Photo info"
              >
                <MessageSquare size={14} />
              </button>
              {signedUrl && (
                <a
                  href={signedUrl}
                  download={photo.originalFilename}
                  className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                  aria-label="Download photo"
                >
                  <Download size={14} />
                </a>
              )}
              <button
                onClick={closeLightbox}
                className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label="Close (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Image */}
          <div className={cn('flex-1 flex items-center justify-center overflow-hidden', showInfo && 'mr-80')}>
            <AnimatePresence mode="wait">
              <motion.div
                key={photo.id}
                initial={xSlide.initial}
                animate={{ x: 0, opacity: 1 }}
                exit={xSlide.exit}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative w-full h-full flex items-center justify-center"
                style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s ease' }}
              >
                {signedUrl ? (
                  <Image
                    src={signedUrl}
                    alt={photo.originalFilename}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    priority
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full skeleton" />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom action bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-4 p-4 bg-gradient-to-t from-black/60 to-transparent">
            <FlagButton
              active={photo.selectionFlag === 'FAVORITE'}
              label="Favorite (F)"
              activeColor="bg-[#f59e0b]"
              onClick={() => onFlag(photo.id, photo.selectionFlag === 'FAVORITE' ? 'NONE' : 'FAVORITE')}
            >
              <Heart size={16} className={photo.selectionFlag === 'FAVORITE' ? 'fill-current' : ''} />
              <span className="text-xs">Favorite</span>
            </FlagButton>

            <FlagButton
              active={photo.selectionFlag === 'MUST_HAVE'}
              label="Must-have (M)"
              activeColor="bg-[#a855f7]"
              onClick={() => onFlag(photo.id, photo.selectionFlag === 'MUST_HAVE' ? 'NONE' : 'MUST_HAVE')}
            >
              <Star size={16} className={photo.selectionFlag === 'MUST_HAVE' ? 'fill-current' : ''} />
              <span className="text-xs">Must-have</span>
            </FlagButton>

            <FlagButton
              active={photo.selectionFlag === 'REJECTED'}
              label="Reject (X)"
              activeColor="bg-[#ef4444]"
              onClick={() => onFlag(photo.id, photo.selectionFlag === 'REJECTED' ? 'NONE' : 'REJECTED')}
            >
              <X size={16} />
              <span className="text-xs">Reject</span>
            </FlagButton>
          </div>

          {/* Info panel */}
          <AnimatePresence>
            {showInfo && (
              <motion.div
                initial={{ x: 320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 320, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute right-0 top-0 bottom-0 w-80 bg-black/80 backdrop-blur-sm border-l border-white/10 p-4 overflow-y-auto"
              >
                <h3 className="text-white font-medium mb-4">Photo details</h3>
                <dl className="space-y-3 text-sm">
                  <Detail label="Filename" value={photo.originalFilename} />
                  <Detail label="Size" value={formatBytes(photo.fileSize)} />
                  {photo.width && photo.height && (
                    <Detail label="Dimensions" value={`${photo.width} × ${photo.height}`} />
                  )}
                  {photo.takenAt && (
                    <Detail label="Taken" value={formatDate(photo.takenAt, { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions)} />
                  )}
                  <Detail label="AI Status" value={photo.aiStatus} />
                  {photo.blurScore !== null && (
                    <Detail label="Blur score" value={photo.blurScore?.toFixed(2)} />
                  )}
                </dl>

                {/* Keyboard shortcuts */}
                <div className="mt-6 pt-4 border-t border-white/10">
                  <p className="text-white/50 text-xs font-medium mb-2 uppercase tracking-wider">Shortcuts</p>
                  <div className="space-y-1.5">
                    {[
                      ['F', 'Favorite'],
                      ['M', 'Must-have'],
                      ['X', 'Reject'],
                      ['← →', 'Navigate'],
                      ['Esc', 'Close'],
                    ].map(([key, action]) => (
                      <div key={key} className="flex items-center justify-between">
                        <kbd className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded font-mono">
                          {key}
                        </kbd>
                        <span className="text-white/50 text-xs">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FlagButton({
  children, active, label, activeColor, onClick,
}: {
  children: React.ReactNode
  active: boolean
  label: string
  activeColor: string
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active ? `${activeColor} text-white` : 'bg-white/10 text-white/80 hover:bg-white/20',
      )}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </motion.button>
  )
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-white/40 text-xs uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className="text-white/80 font-mono text-xs break-all">{value}</dd>
    </div>
  )
}
