'use client'

import { motion } from 'framer-motion'
import { useGalleryStore } from '@/lib/stores/gallery.store'
import type { Photo } from '@/types/api'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'favorite' | 'must_have' | 'rejected' | 'blur' | 'duplicate' | 'unprocessed'

interface FilterOption {
  key: Filter
  label: string
  color?: string
  getCount: (photos: Photo[]) => number
}

const FILTERS: FilterOption[] = [
  { key: 'all',         label: 'All',         getCount: (p) => p.length },
  { key: 'favorite',    label: '♥ Favorites',  color: 'text-[#f59e0b]', getCount: (p) => p.filter(x => x.selectionFlag === 'FAVORITE').length },
  { key: 'must_have',   label: '★ Must-have',  color: 'text-[#a855f7]', getCount: (p) => p.filter(x => x.selectionFlag === 'MUST_HAVE').length },
  { key: 'rejected',    label: '✕ Rejected',   color: 'text-[#ef4444]', getCount: (p) => p.filter(x => x.selectionFlag === 'REJECTED').length },
  { key: 'blur',        label: 'Blur',         getCount: (p) => p.filter(x => x.isBlur).length },
  { key: 'duplicate',   label: 'Duplicates',   getCount: (p) => p.filter(x => x.isDuplicate).length },
  { key: 'unprocessed', label: 'Processing',   getCount: (p) => p.filter(x => x.aiStatus === 'QUEUED' || x.aiStatus === 'PROCESSING').length },
]

interface Props {
  photos: Photo[]
}

export function FilterBar({ photos }: Props) {
  const { filter, setFilter } = useGalleryStore()

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto scrollbar-none flex-shrink-0">
      {FILTERS.map(f => {
        const count = f.getCount(photos)
        const isActive = filter === f.key
        return (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {isActive && (
              <motion.div
                layoutId="filter-pill"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span className={cn('relative', f.color)}>{f.label}</span>
            {count > 0 && (
              <span className="relative bg-muted px-1.5 py-0.5 rounded-full text-[10px] text-muted-foreground">
                {count.toLocaleString()}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
