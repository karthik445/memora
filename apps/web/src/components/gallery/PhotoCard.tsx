'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Heart, Star, X, Loader2 } from 'lucide-react'
import { useGalleryStore } from '@/lib/stores/gallery.store'
import type { Photo, PhotoSelectionFlag } from '@/types/api'
import { cn } from '@/lib/utils'
import { photoCardVariants } from '@/lib/motion/variants'

interface Props {
  photo: Photo
  thumbnailUrl: string
  isSelected: boolean
  isViewing: boolean
  onClick: (e: React.MouseEvent) => void
  onFlag: (photoId: string, flag: PhotoSelectionFlag) => void
}

const FLAG_CONFIG = {
  FAVORITE:  { icon: Heart, color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]', ring: 'photo-ring-favorite' },
  MUST_HAVE: { icon: Star,  color: 'text-[#a855f7]', bg: 'bg-[#a855f7]', ring: 'photo-ring-musthave' },
  REJECTED:  { icon: X,    color: 'text-[#ef4444]', bg: 'bg-[#ef4444]', ring: 'photo-ring-rejected' },
  NONE:      { icon: null,  color: '',                bg: '',               ring: '' },
}

export function PhotoCard({ photo, thumbnailUrl, isSelected, isViewing, onClick, onFlag }: Props) {
  const { pendingFlags } = useGalleryStore()

  const effectiveFlag = pendingFlags[photo.id] ?? photo.selectionFlag
  const flagConfig = FLAG_CONFIG[effectiveFlag]
  const isPending = photo.id in pendingFlags
  const isProcessing = photo.aiStatus === 'QUEUED' || photo.aiStatus === 'PROCESSING'

  const aspectRatio = photo.width && photo.height
    ? photo.height / photo.width
    : 2 / 3

  const FlagIcon = flagConfig.icon

  return (
    <motion.div
      variants={photoCardVariants}
      initial="initial"
      animate="enter"
      whileHover="hover"
      whileTap="tap"
      className={cn(
        'relative overflow-hidden rounded-md cursor-pointer group select-none',
        isSelected && 'photo-ring-selected',
        !isSelected && flagConfig.ring,
      )}
      style={{ paddingBottom: `${aspectRatio * 100}%` }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Photo ${photo.originalFilename}${effectiveFlag !== 'NONE' ? `, ${effectiveFlag}` : ''}`}
      aria-pressed={isSelected}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(e as unknown as React.MouseEvent) }}
    >
      {/* Image */}
      <div className="absolute inset-0">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={photo.originalFilename}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            unoptimized // thumbnails already optimised server-side
          />
        ) : (
          <div className="w-full h-full skeleton" />
        )}
      </div>

      {/* AI processing overlay */}
      {isProcessing && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 size={20} className="text-white animate-spin" />
        </div>
      )}

      {/* Selection checkbox */}
      <div
        className={cn(
          'absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 border-white/80 bg-black/20 backdrop-blur-sm transition-all duration-150 flex items-center justify-center',
          isSelected
            ? 'opacity-100 bg-primary border-primary'
            : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {isSelected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Active flag badge */}
      {FlagIcon && effectiveFlag !== 'NONE' && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={cn(
            'absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center',
            flagConfig.bg,
          )}
        >
          <FlagIcon size={10} className="text-white fill-white" />
        </motion.div>
      )}

      {/* Blur / duplicate badges */}
      {(photo.isBlur || photo.isDuplicate) && (
        <div className="absolute bottom-1.5 left-1.5 flex gap-1">
          {photo.isBlur && (
            <span className="text-[9px] font-medium bg-black/70 text-white/80 px-1 py-0.5 rounded">
              BLUR
            </span>
          )}
          {photo.isDuplicate && (
            <span className="text-[9px] font-medium bg-black/70 text-white/80 px-1 py-0.5 rounded">
              DUP
            </span>
          )}
        </div>
      )}

      {/* Quick-action overlay — visible on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          {/* Favorite */}
          <ActionButton
            active={effectiveFlag === 'FAVORITE'}
            pending={isPending}
            activeColor="bg-[#f59e0b]"
            onClick={e => {
              e.stopPropagation()
              onFlag(photo.id, effectiveFlag === 'FAVORITE' ? 'NONE' : 'FAVORITE')
            }}
            aria-label="Mark as favorite (F)"
            title="Favorite (F)"
          >
            <Heart size={12} className={effectiveFlag === 'FAVORITE' ? 'fill-current' : ''} />
          </ActionButton>

          {/* Must-have */}
          <ActionButton
            active={effectiveFlag === 'MUST_HAVE'}
            pending={isPending}
            activeColor="bg-[#a855f7]"
            onClick={e => {
              e.stopPropagation()
              onFlag(photo.id, effectiveFlag === 'MUST_HAVE' ? 'NONE' : 'MUST_HAVE')
            }}
            aria-label="Mark as must-have (M)"
            title="Must-have (M)"
          >
            <Star size={12} className={effectiveFlag === 'MUST_HAVE' ? 'fill-current' : ''} />
          </ActionButton>

          {/* Reject */}
          <ActionButton
            active={effectiveFlag === 'REJECTED'}
            pending={isPending}
            activeColor="bg-[#ef4444]"
            onClick={e => {
              e.stopPropagation()
              onFlag(photo.id, effectiveFlag === 'REJECTED' ? 'NONE' : 'REJECTED')
            }}
            aria-label="Reject photo (X)"
            title="Reject (X)"
          >
            <X size={12} />
          </ActionButton>
        </div>
      </div>
    </motion.div>
  )
}

function ActionButton({
  children, active, pending, activeColor, onClick, 'aria-label': ariaLabel, title,
}: {
  children: React.ReactNode
  active: boolean
  pending: boolean
  activeColor: string
  onClick: (e: React.MouseEvent) => void
  'aria-label'?: string
  title?: string
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      type="button"
      className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
        active ? `${activeColor} text-white` : 'bg-black/50 text-white/80 hover:bg-black/70',
        pending && 'opacity-60 cursor-wait',
      )}
      disabled={pending}
    >
      {children}
    </motion.button>
  )
}
