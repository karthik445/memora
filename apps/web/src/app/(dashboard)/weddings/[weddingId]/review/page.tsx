'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/lib/stores/auth.store'
import { useFlatPhotos, useFlagPhoto } from '@/lib/hooks/usePhotos'
import { usePresence } from '@/lib/hooks/usePresence'
import { api } from '@/lib/api/client'
import type { Photo, PhotoComment, PresencePeer } from '@/types/api'
import { PresenceBar } from '@/components/collaboration/PresenceBar'
import { VirtualizedGallery } from '@/components/gallery/VirtualizedGallery'
import { Lightbox } from '@/components/gallery/Lightbox'
import { FilterBar } from '@/components/gallery/FilterBar'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import Image from 'next/image'
import { Send, MessageSquare, Users, Eye } from 'lucide-react'
import { toast } from 'sonner'

interface Props { params: Promise<{ weddingId: string }> }

export default function ReviewPage({ params }: Props) {
  const { weddingId } = use(params)
  const { tenantId, user } = useAuthStore()
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [viewingUsers, setViewingUsers] = useState<PresencePeer[]>([])

  const { photos, signedUrls, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFlatPhotos(weddingId)

  const { mutate: flagPhoto } = useFlagPhoto(weddingId)
  const { peers, isConnected, emit } = usePresence(weddingId)

  // Listen for peer viewing events
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail
      if (msg.type === 'viewing') {
        setViewingUsers(prev => {
          const existing = prev.filter(p => p.userId !== msg.fromUserId)
          return [...existing, { userId: msg.fromUserId, name: msg.fromName, color: '', viewingPhotoId: msg.photoId, lastSeen: Date.now() }]
        })
      }
    }
    window.addEventListener('memora:presence', handler)
    return () => window.removeEventListener('memora:presence', handler)
  }, [])

  // Notify peers when viewing a photo
  const handlePhotoSelect = (photoId: string) => {
    setActivePhotoId(photoId)
    emit({ type: 'viewing', photoId })
  }

  // Comments
  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['comments', tenantId, activePhotoId],
    queryFn: () => api.get<PhotoComment[]>(`/tenants/${tenantId}/photos/${activePhotoId}/comments`),
    enabled: !!activePhotoId && !!tenantId,
  })

  const commentMutation = useMutation({
    mutationFn: () =>
      api.post(`/tenants/${tenantId}/photos/${activePhotoId}/comments`, { body: commentBody }),
    onSuccess: () => {
      setCommentBody('')
      refetchComments()
      emit({ type: 'comment', photoId: activePhotoId })
    },
    onError: () => toast.error('Failed to post comment'),
  })

  const activePhoto = photos.find(p => p.id === activePhotoId)
  const activeThumbUrl = activePhotoId
    ? (signedUrls[`${activePhotoId}:thumbnail`] ?? signedUrls[`${activePhotoId}:original`] ?? '')
    : ''

  return (
    <div className="flex h-full overflow-hidden">
      {/* Gallery panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users size={14} />
            <span>{peers.length} online</span>
            {isConnected && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
          </div>
          <div className="ml-auto">
            <PresenceBar peers={peers} />
          </div>
        </div>

        <FilterBar photos={photos} />

        <div className="flex-1 overflow-hidden">
          <VirtualizedGallery
            photos={photos}
            signedUrls={signedUrls}
            onLoadMore={() => fetchNextPage()}
            hasMore={hasNextPage ?? false}
            isLoading={isLoading || isFetchingNextPage}
            onFlag={(photoId, flag) => {
              flagPhoto({ photoId, flag })
              emit({ type: 'photo_flag', photoId, flag })
            }}
          />
        </div>
      </div>

      {/* Review panel */}
      <div className="w-80 flex flex-col border-l border-border bg-card overflow-hidden flex-shrink-0">
        {activePhoto ? (
          <>
            {/* Photo preview */}
            <div className="relative aspect-square w-full bg-muted flex-shrink-0">
              {activeThumbUrl && (
                <Image src={activeThumbUrl} alt={activePhoto.originalFilename} fill className="object-cover" unoptimized />
              )}
              {/* Who's viewing overlay */}
              {viewingUsers.filter(u => u.viewingPhotoId === activePhotoId).length > 0 && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1 text-white text-xs">
                  <Eye size={10} />
                  {viewingUsers.filter(u => u.viewingPhotoId === activePhotoId).length} viewing
                </div>
              )}
            </div>

            {/* Photo info */}
            <div className="px-3 py-2 border-b border-border flex-shrink-0">
              <p className="text-xs font-medium text-foreground truncate">{activePhoto.originalFilename}</p>
              <div className="flex items-center gap-2 mt-1">
                <FlagBadge flag={activePhoto.selectionFlag} />
              </div>
            </div>

            {/* Comments */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageSquare size={12} />
                <span>{comments.length} comments</span>
              </div>

              <AnimatePresence>
                {comments.map(comment => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-0.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center text-[9px] font-bold text-brand-400">
                        {comment.authorName?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-foreground">{comment.authorName}</span>
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6.5 leading-relaxed">{comment.body}</p>
                  </motion.div>
                ))}
              </AnimatePresence>

              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No comments yet</p>
              )}
            </div>

            {/* Comment input */}
            <div className="p-3 border-t border-border flex-shrink-0">
              <div className="flex gap-2">
                <input
                  value={commentBody}
                  onChange={e => setCommentBody(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && commentBody.trim()) {
                      e.preventDefault()
                      commentMutation.mutate()
                    }
                  }}
                  placeholder="Add a comment…"
                  className="flex-1 h-8 px-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={() => commentBody.trim() && commentMutation.mutate()}
                  disabled={!commentBody.trim() || commentMutation.isPending}
                  className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 transition-colors"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div>
              <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                <MessageSquare size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Select a photo</p>
              <p className="text-xs text-muted-foreground mt-1">Click any photo to view comments and details</p>
            </div>
          </div>
        )}
      </div>

      <Lightbox photos={photos} signedUrls={signedUrls} onFlag={(photoId, flag) => flagPhoto({ photoId, flag })} />
    </div>
  )
}

function FlagBadge({ flag }: { flag: string }) {
  const config = {
    FAVORITE:  { label: '♥ Favorite',  className: 'bg-[#f59e0b]/15 text-[#f59e0b]' },
    MUST_HAVE: { label: '★ Must-have', className: 'bg-[#a855f7]/15 text-[#a855f7]' },
    REJECTED:  { label: '✕ Rejected',  className: 'bg-[#ef4444]/15 text-[#ef4444]' },
    NONE:      { label: 'Unflagged',   className: 'bg-muted text-muted-foreground' },
  }[flag] ?? { label: flag, className: 'bg-muted text-muted-foreground' }

  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', config.className)}>
      {config.label}
    </span>
  )
}
