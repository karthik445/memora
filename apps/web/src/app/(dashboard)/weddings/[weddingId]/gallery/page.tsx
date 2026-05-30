'use client'

import { use, useCallback, useRef, useState } from 'react'
import { useAuthStore } from '@/lib/stores/auth.store'
import { useFlatPhotos, useFlagPhoto, useBulkFlagPhotos } from '@/lib/hooks/usePhotos'
import { usePresence } from '@/lib/hooks/usePresence'
import { useKeyboardNav } from '@/lib/hooks/useKeyboardNav'
import { useGalleryStore } from '@/lib/stores/gallery.store'
import { VirtualizedGallery } from '@/components/gallery/VirtualizedGallery'
import { Lightbox } from '@/components/gallery/Lightbox'
import { FilterBar } from '@/components/gallery/FilterBar'
import { PresenceBar } from '@/components/collaboration/PresenceBar'
import { UploadZone } from '@/components/gallery/UploadZone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Trash2, Heart, Star, X as XIcon,
  LayoutGrid, List, SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PhotoSelectionFlag } from '@/types/api'

interface Props {
  params: Promise<{ weddingId: string }>
}

export default function GalleryPage({ params }: Props) {
  const { weddingId } = use(params)
  const { user, tenantId } = useAuthStore()
  const { selectedIds, clearSelection, view, setView } = useGalleryStore()
  const [showUpload, setShowUpload] = useState(false)

  const { photos, signedUrls, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFlatPhotos(weddingId)

  const { mutate: flagPhoto } = useFlagPhoto(weddingId)
  const { mutate: bulkFlag } = useBulkFlagPhotos(weddingId)
  const { peers, emit } = usePresence(weddingId)

  const isPhotographer = user?.role !== 'CLIENT'

  const handleFlag = useCallback(
    (photoId: string, flag: PhotoSelectionFlag) => {
      flagPhoto({ photoId, flag })
      emit({ type: 'photo_flag', photoId, flag })
    },
    [flagPhoto, emit],
  )

  useKeyboardNav({ photos, onFlag: handleFlag, enabled: true })

  const selectedCount = selectedIds.size

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setView('masonry')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'masonry' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
            aria-label="Masonry view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
            aria-label="List view"
          >
            <List size={16} />
          </button>
        </div>

        <div className="h-4 w-px bg-border" />

        <span className="text-sm text-muted-foreground">
          {photos.length.toLocaleString()} photos
          {isLoading && <span className="ml-1 text-xs">(loading…)</span>}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <PresenceBar peers={peers} />

          {isPhotographer && (
            <button
              onClick={() => setShowUpload(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                showUpload ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              <Upload size={14} />
              Upload
            </button>
          )}
        </div>
      </div>

      {/* Upload panel */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border flex-shrink-0"
          >
            <div className="p-4">
              <UploadZone weddingId={weddingId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter bar */}
      <FilterBar photos={photos} />

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20">
              <span className="text-sm font-medium text-primary">{selectedCount} selected</span>
              <div className="ml-auto flex items-center gap-2">
                {[
                  { flag: 'FAVORITE' as const, icon: Heart, color: 'hover:text-[#f59e0b]', label: 'Favorite all' },
                  { flag: 'MUST_HAVE' as const, icon: Star, color: 'hover:text-[#a855f7]', label: 'Must-have all' },
                  { flag: 'REJECTED' as const, icon: XIcon, color: 'hover:text-[#ef4444]', label: 'Reject all' },
                ].map(({ flag, icon: Icon, color, label }) => (
                  <button
                    key={flag}
                    onClick={() => bulkFlag({ photoIds: Array.from(selectedIds), flag })}
                    className={cn('p-1.5 rounded-md text-muted-foreground transition-colors', color)}
                    aria-label={label}
                    title={label}
                  >
                    <Icon size={16} />
                  </button>
                ))}
                <button
                  onClick={clearSelection}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors ml-2"
                  aria-label="Clear selection"
                >
                  <XIcon size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gallery */}
      <div className="flex-1 overflow-hidden">
        <VirtualizedGallery
          photos={photos}
          signedUrls={signedUrls}
          onLoadMore={() => fetchNextPage()}
          hasMore={hasNextPage ?? false}
          isLoading={isLoading || isFetchingNextPage}
          onFlag={handleFlag}
        />
      </div>

      {/* Lightbox */}
      <Lightbox photos={photos} signedUrls={signedUrls} onFlag={handleFlag} />
    </div>
  )
}

