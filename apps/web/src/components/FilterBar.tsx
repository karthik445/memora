'use client'

import type { Photo } from '@/app/gallery/[id]/page'

type Filter = 'all' | 'favorite' | 'must_have' | 'blur' | 'duplicate'

interface Props {
  active: Filter
  onChange: (f: Filter) => void
  photos: Photo[]
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'favorite', label: '♥ Favorites' },
  { key: 'must_have', label: '★ Must-have' },
  { key: 'blur', label: 'Blurry' },
  { key: 'duplicate', label: 'Duplicates' },
]

export function FilterBar({ active, onChange, photos }: Props) {
  const counts: Record<Filter, number> = {
    all: photos.length,
    favorite: photos.filter(p => p.is_favorite).length,
    must_have: photos.filter(p => p.is_must_have).length,
    blur: photos.filter(p => p.is_blur).length,
    duplicate: photos.filter(p => p.is_duplicate).length,
  }

  return (
    <div className="flex gap-2 px-4 py-3 border-b border-neutral-800 overflow-x-auto">
      {FILTERS.map(f => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full transition ${
            active === f.key
              ? 'bg-brand-500 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`}
        >
          {f.label} <span className="opacity-60 text-xs">{counts[f.key]}</span>
        </button>
      ))}
    </div>
  )
}
