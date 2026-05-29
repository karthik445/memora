'use client'

import { Photo } from '@/app/gallery/[id]/page'
import PhotoAlbum from 'react-photo-album'
import { motion } from 'framer-motion'

interface Props {
  photos: Photo[]
  onSelect: (id: number) => void
  onFlag: (id: number, patch: Partial<Photo>) => void
}

export function GalleryGrid({ photos, onSelect, onFlag }: Props) {
  const albumPhotos = photos.map(p => ({
    src: p.thumbnailUrl || p.url,
    width: p.width || 4,
    height: p.height || 3,
    key: String(p.id),
    photo: p,
  }))

  return (
    <PhotoAlbum
      layout="masonry"
      photos={albumPhotos}
      columns={c => (c < 640 ? 2 : c < 1024 ? 3 : 4)}
      spacing={4}
      renderPhoto={({ photo, imageProps: { src, alt, style, ...rest } }) => {
        const p: Photo = (photo as unknown as { photo: Photo }).photo
        return (
          <motion.div
            key={p.id}
            style={{ ...style, position: 'relative', cursor: 'pointer' }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="group overflow-hidden rounded-md"
            onClick={() => onSelect(p.id)}
          >
            <img src={src} alt={alt} style={{ display: 'block', width: '100%' }} {...rest} />

            {/* Status badges */}
            <div className="absolute top-1.5 left-1.5 flex gap-1">
              {p.is_favorite && <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded-full font-bold">♥</span>}
              {p.is_must_have && <span className="text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-bold">★</span>}
              {p.is_blur && <span className="text-xs bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded-full">blur</span>}
              {p.is_duplicate && <span className="text-xs bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded-full">dup</span>}
            </div>

            {/* Quick-action overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-end justify-end p-2 gap-1 opacity-0 group-hover:opacity-100">
              <button
                onClick={e => { e.stopPropagation(); onFlag(p.id, { is_favorite: !p.is_favorite }) }}
                className={`text-lg leading-none transition ${p.is_favorite ? 'text-yellow-400' : 'text-white/70 hover:text-yellow-400'}`}
                title="Favorite (F)"
              >♥</button>
              <button
                onClick={e => { e.stopPropagation(); onFlag(p.id, { is_must_have: !p.is_must_have }) }}
                className={`text-lg leading-none transition ${p.is_must_have ? 'text-brand-500' : 'text-white/70 hover:text-brand-500'}`}
                title="Must-have (M)"
              >★</button>
            </div>
          </motion.div>
        )
      }}
    />
  )
}
