'use client'

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/lib/stores/auth.store'
import { useGalleryStore } from '@/lib/stores/gallery.store'
import type { Photo, PhotoPage, PhotoSelectionFlag } from '@/types/api'
import { toast } from 'sonner'

// ── Query keys ─────────────────────────────────────────────────────────────────
export const photoKeys = {
  all:    (tenantId: string) => ['photos', tenantId] as const,
  list:   (tenantId: string, weddingId: string, params: object) =>
    ['photos', tenantId, weddingId, params] as const,
  detail: (tenantId: string, photoId: string) =>
    ['photos', tenantId, 'detail', photoId] as const,
}

// ── Infinite gallery query ─────────────────────────────────────────────────────
export function useInfinitePhotos(weddingId: string) {
  const { tenantId } = useAuthStore()
  const { filter, sortBy, sortDir } = useGalleryStore()

  return useInfiniteQuery({
    queryKey: photoKeys.list(tenantId!, weddingId, { filter, sortBy, sortDir }),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        weddingId,
        filter,
        sortBy,
        sortDir,
        limit: '100',
        ...(pageParam ? { cursor: pageParam as string } : {}),
      })
      return api.get<PhotoPage>(
        `/tenants/${tenantId}/photos?${params}`,
      )
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!tenantId && !!weddingId,
    staleTime: 30 * 1000,
  })
}

// ── Flatten pages into a flat photo array ─────────────────────────────────────
export function useFlatPhotos(weddingId: string) {
  const query = useInfinitePhotos(weddingId)

  const photos: Photo[] = query.data?.pages.flatMap(p => p.photos) ?? []

  const signedUrls: Record<string, string> = {}
  query.data?.pages.forEach(p => Object.assign(signedUrls, p.signedUrls))

  return { ...query, photos, signedUrls }
}

// ── Flag mutation with optimistic update ────────────────────────────────────────
export function useFlagPhoto(weddingId: string) {
  const { tenantId } = useAuthStore()
  const { setPendingFlag, clearPendingFlag } = useGalleryStore()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ photoId, flag }: { photoId: string; flag: PhotoSelectionFlag }) =>
      api.patch(`/tenants/${tenantId}/photos/${photoId}`, { selectionFlag: flag }),

    onMutate: async ({ photoId, flag }) => {
      // Optimistic update
      setPendingFlag(photoId, flag)

      await qc.cancelQueries({ queryKey: photoKeys.all(tenantId!) })

      const previous = qc.getQueryData(
        photoKeys.list(tenantId!, weddingId, {}),
      )

      qc.setQueriesData(
        { queryKey: photoKeys.all(tenantId!) },
        (old: InfiniteData<PhotoPage> | undefined) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              photos: page.photos.map(p =>
                p.id === photoId ? { ...p, selectionFlag: flag } : p,
              ),
            })),
          }
        },
      )

      return { previous }
    },

    onError: (_err, { photoId }, context) => {
      clearPendingFlag(photoId)
      if (context?.previous) {
        qc.setQueryData(
          photoKeys.list(tenantId!, weddingId, {}),
          context.previous,
        )
      }
      toast.error('Failed to update photo flag')
    },

    onSettled: (_data, _err, { photoId }) => {
      clearPendingFlag(photoId)
      qc.invalidateQueries({ queryKey: photoKeys.all(tenantId!) })
    },
  })
}

// ── Bulk flag mutation ─────────────────────────────────────────────────────────
export function useBulkFlagPhotos(weddingId: string) {
  const { tenantId } = useAuthStore()
  const { clearSelection } = useGalleryStore()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ photoIds, flag }: { photoIds: string[]; flag: PhotoSelectionFlag }) =>
      api.patch(`/tenants/${tenantId}/photos/bulk`, { photoIds, selectionFlag: flag }),

    onSuccess: (_data, { photoIds, flag }) => {
      // Optimistic apply
      qc.setQueriesData(
        { queryKey: photoKeys.all(tenantId!) },
        (old: InfiniteData<PhotoPage> | undefined) => {
          if (!old) return old
          const idSet = new Set(photoIds)
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              photos: page.photos.map(p =>
                idSet.has(p.id) ? { ...p, selectionFlag: flag } : p,
              ),
            })),
          }
        },
      )
      clearSelection()
      toast.success(`Updated ${photoIds.length} photos`)
    },

    onError: () => toast.error('Bulk update failed'),
  })
}

// ── Upload mutation ────────────────────────────────────────────────────────────
export function useUploadPhotos(weddingId: string) {
  const { tenantId } = useAuthStore()
  const { setUploading, setUploadProgress, addUploadFailed, resetUpload } = useGalleryStore()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ files, eventId }: { files: File[]; eventId?: string }) => {
      setUploading(true)
      setUploadProgress(0, files.length)

      const results = await Promise.allSettled(
        files.map(async (file, i) => {
          const form = new FormData()
          form.append('file', file)

          const idempotencyKey = await computeIdempotencyKey(file)

          const params = new URLSearchParams({
            weddingId,
            idempotencyKey,
            ...(eventId ? { eventId } : {}),
          })

          const result = await api.upload(
            `/tenants/${tenantId}/photos/upload?${params}`,
            form,
          )
          setUploadProgress(i + 1, files.length)
          return result
        }),
      )

      results.forEach((r, i) => {
        if (r.status === 'rejected') addUploadFailed(files[i]!.name)
      })

      return results
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: photoKeys.all(tenantId!) })
      toast.success('Photos uploaded successfully')
    },

    onError: () => toast.error('Upload failed'),

    onSettled: () => {
      setTimeout(resetUpload, 3000)
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function computeIdempotencyKey(file: File): Promise<string> {
  const buffer = await file.slice(0, 65536).arrayBuffer() // first 64KB
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${file.name.slice(0, 20)}-${file.size}-${hex.slice(0, 16)}`
}
