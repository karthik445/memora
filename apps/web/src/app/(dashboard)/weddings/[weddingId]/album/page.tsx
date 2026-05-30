'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, Reorder, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/lib/stores/auth.store'
import { api } from '@/lib/api/client'
import type { Album, Photo } from '@/types/api'
import { useFlatPhotos } from '@/lib/hooks/usePhotos'
import Image from 'next/image'
import {
  Plus, GripVertical, Trash2, Share2, Eye, EyeOff,
  Copy, CheckCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { staggerContainer, staggerItem } from '@/lib/motion/variants'

interface Props { params: Promise<{ weddingId: string }> }

interface AlbumPhoto extends Photo { url: string; sortOrder: number }

export default function AlbumBuilderPage({ params }: Props) {
  const { weddingId } = use(params)
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [copiedShareLink, setCopiedShareLink] = useState(false)
  const [newAlbumTitle, setNewAlbumTitle] = useState('')
  const [showCreateAlbum, setShowCreateAlbum] = useState(false)

  // Albums list
  const { data: albums = [], isLoading: albumsLoading } = useQuery({
    queryKey: ['albums', tenantId, weddingId],
    queryFn: () => api.get<Album[]>(`/tenants/${tenantId}/weddings/${weddingId}/albums`),
    enabled: !!tenantId,
  })

  const selectedAlbum = albums.find(a => a.id === selectedAlbumId)

  // Album photos
  const { data: albumPhotos = [], refetch: refetchAlbumPhotos } = useQuery({
    queryKey: ['album-photos', tenantId, selectedAlbumId],
    queryFn: () =>
      api.get<{ photos: AlbumPhoto[]; signedUrls: Record<string, string> }>(
        `/tenants/${tenantId}/albums/${selectedAlbumId}/photos`,
      ).then(d => d.photos.map(p => ({ ...p, url: d.signedUrls[`${p.id}:thumbnail`] ?? '' }))),
    enabled: !!selectedAlbumId && !!tenantId,
  })

  // Source: Favorites/Must-haves not yet in album
  const { photos: sourcePhotos, signedUrls } = useFlatPhotos(weddingId)
  const curated = sourcePhotos.filter(
    p => ['FAVORITE', 'MUST_HAVE'].includes(p.selectionFlag) &&
    !albumPhotos.find(ap => ap.id === p.id),
  )

  const createAlbumMutation = useMutation({
    mutationFn: () =>
      api.post<Album>(`/tenants/${tenantId}/weddings/${weddingId}/albums`, {
        title: newAlbumTitle,
      }),
    onSuccess: (album) => {
      qc.invalidateQueries({ queryKey: ['albums', tenantId, weddingId] })
      setSelectedAlbumId(album.id)
      setNewAlbumTitle('')
      setShowCreateAlbum(false)
      toast.success('Album created')
    },
  })

  const addPhotoMutation = useMutation({
    mutationFn: (photoId: string) =>
      api.post(`/tenants/${tenantId}/albums/${selectedAlbumId}/photos`, { photoId }),
    onSuccess: () => refetchAlbumPhotos(),
  })

  const removePhotoMutation = useMutation({
    mutationFn: (photoId: string) =>
      api.delete(`/tenants/${tenantId}/albums/${selectedAlbumId}/photos/${photoId}`),
    onSuccess: () => refetchAlbumPhotos(),
  })

  const reorderMutation = useMutation({
    mutationFn: (photoIds: string[]) =>
      api.patch(`/tenants/${tenantId}/albums/${selectedAlbumId}/photos/reorder`, { photoIds }),
  })

  const togglePublicMutation = useMutation({
    mutationFn: () =>
      api.patch<Album>(`/tenants/${tenantId}/albums/${selectedAlbumId}`, {
        isPublic: !selectedAlbum?.isPublic,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums', tenantId, weddingId] }),
  })

  const copyShareLink = () => {
    if (!selectedAlbum) return
    const url = `${window.location.origin}/gallery/${selectedAlbum.shareToken}`
    navigator.clipboard.writeText(url)
    setCopiedShareLink(true)
    setTimeout(() => setCopiedShareLink(false), 2000)
    toast.success('Share link copied')
  }

  const [orderedPhotos, setOrderedPhotos] = useState<AlbumPhoto[]>(albumPhotos)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Album list */}
      <div className="w-60 border-r border-border flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold">Albums</h2>
          <button
            onClick={() => setShowCreateAlbum(v => !v)}
            className="w-6 h-6 rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        <AnimatePresence>
          {showCreateAlbum && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border"
            >
              <div className="p-3 space-y-2">
                <input
                  value={newAlbumTitle}
                  onChange={e => setNewAlbumTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && newAlbumTitle.trim() && createAlbumMutation.mutate()}
                  placeholder="Album name"
                  autoFocus
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={() => createAlbumMutation.mutate()}
                  disabled={!newAlbumTitle.trim() || createAlbumMutation.isPending}
                  className="w-full h-7 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                >
                  {createAlbumMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                  Create
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-2">
          {albumsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 skeleton rounded-md" />)}
            </div>
          ) : albums.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No albums yet</p>
          ) : (
            albums.map(album => (
              <button
                key={album.id}
                onClick={() => setSelectedAlbumId(album.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left',
                  selectedAlbumId === album.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span className="truncate">{album.title}</span>
                <span className="text-[10px] ml-2 flex-shrink-0">{album._count?.photos ?? 0}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Middle: Album canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedAlbum ? (
          <>
            {/* Album toolbar */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
              <h2 className="font-semibold text-sm">{selectedAlbum.title}</h2>
              <span className="text-xs text-muted-foreground">{albumPhotos.length} photos</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => togglePublicMutation.mutate()}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    selectedAlbum.isPublic
                      ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {selectedAlbum.isPublic ? <Eye size={12} /> : <EyeOff size={12} />}
                  {selectedAlbum.isPublic ? 'Public' : 'Private'}
                </button>
                {selectedAlbum.isPublic && (
                  <button
                    onClick={copyShareLink}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors"
                  >
                    {copiedShareLink ? <CheckCircle size={12} /> : <Copy size={12} />}
                    {copiedShareLink ? 'Copied!' : 'Share link'}
                  </button>
                )}
              </div>
            </div>

            {/* Draggable photo grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {albumPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Plus size={24} />
                  </div>
                  <p className="text-sm">Add photos from the panel on the right</p>
                </div>
              ) : (
                <Reorder.Group
                  axis="x"
                  values={albumPhotos}
                  onReorder={ordered => {
                    setOrderedPhotos(ordered)
                    reorderMutation.mutate(ordered.map(p => p.id))
                  }}
                  className="grid grid-cols-4 md:grid-cols-6 gap-2"
                  as="div"
                >
                  {albumPhotos.map(photo => (
                    <Reorder.Item key={photo.id} value={photo} as="div">
                      <div className="relative aspect-square rounded-md overflow-hidden bg-muted group cursor-grab active:cursor-grabbing">
                        {photo.url && (
                          <Image src={photo.url} alt={photo.originalFilename} fill className="object-cover" unoptimized />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => removePhotoMutation.mutate(photo.id)}
                            className="w-7 h-7 rounded-full bg-red-500/90 text-white flex items-center justify-center"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripVertical size={14} className="text-white/80" />
                        </div>
                        <FlagDot flag={photo.selectionFlag} />
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <p className="text-sm font-medium text-foreground">Select or create an album</p>
              <p className="text-xs text-muted-foreground mt-1">Albums are curated collections you share with clients</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Source photos (curated) */}
      {selectedAlbumId && (
        <div className="w-56 border-l border-border flex flex-col overflow-hidden flex-shrink-0">
          <div className="px-4 py-3 border-b border-border flex-shrink-0">
            <h3 className="text-xs font-semibold text-foreground">Curated photos</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Favorites & must-haves</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 content-start">
            {curated.map(photo => {
              const url = signedUrls[`${photo.id}:thumbnail`] ?? signedUrls[`${photo.id}:original`] ?? ''
              return (
                <button
                  key={photo.id}
                  onClick={() => addPhotoMutation.mutate(photo.id)}
                  className="relative aspect-square rounded-md overflow-hidden bg-muted group hover:ring-2 hover:ring-brand-400 transition-all"
                  title={`Add ${photo.originalFilename}`}
                >
                  {url && <Image src={url} alt={photo.originalFilename} fill className="object-cover" unoptimized />}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Plus size={16} className="text-white" />
                  </div>
                  <FlagDot flag={photo.selectionFlag} />
                </button>
              )
            })}
            {curated.length === 0 && (
              <p className="col-span-2 text-[10px] text-muted-foreground text-center py-4">
                Mark photos as favorites or must-haves in the gallery to see them here
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FlagDot({ flag }: { flag: string }) {
  const color = { FAVORITE: 'bg-[#f59e0b]', MUST_HAVE: 'bg-[#a855f7]', REJECTED: 'bg-[#ef4444]', NONE: '' }[flag]
  if (!color) return null
  return <div className={cn('absolute top-1 right-1 w-2 h-2 rounded-full', color)} />
}
