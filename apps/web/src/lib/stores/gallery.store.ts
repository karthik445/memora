import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Photo, PhotoSelectionFlag } from '@/types/api'

type GalleryFilter = 'all' | 'favorite' | 'must_have' | 'rejected' | 'blur' | 'duplicate' | 'unprocessed'
type GallerySortBy = 'createdAt' | 'takenAt'
type GallerySortDir = 'asc' | 'desc'
type GalleryView = 'grid' | 'masonry' | 'list'

interface GalleryState {
  // Filters & sort
  filter: GalleryFilter
  sortBy: GallerySortBy
  sortDir: GallerySortDir
  view: GalleryView

  // Selection
  selectedIds: Set<string>
  lightboxPhotoId: string | null

  // Optimistic flag overrides
  // photoId → pending flag (before server confirms)
  pendingFlags: Record<string, PhotoSelectionFlag>

  // Upload
  isUploading: boolean
  uploadProgress: number
  uploadTotal: number
  uploadFailed: string[]
}

interface GalleryActions {
  setFilter: (filter: GalleryFilter) => void
  setSortBy: (sortBy: GallerySortBy) => void
  setSortDir: (dir: GallerySortDir) => void
  setView: (view: GalleryView) => void

  selectPhoto: (id: string) => void
  deselectPhoto: (id: string) => void
  toggleSelect: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void

  openLightbox: (photoId: string) => void
  closeLightbox: () => void
  lightboxNavigate: (photos: Photo[], direction: 'next' | 'prev') => void

  setPendingFlag: (photoId: string, flag: PhotoSelectionFlag) => void
  clearPendingFlag: (photoId: string) => void

  setUploading: (uploading: boolean) => void
  setUploadProgress: (done: number, total: number) => void
  addUploadFailed: (filename: string) => void
  resetUpload: () => void
}

export const useGalleryStore = create<GalleryState & GalleryActions>()(
  immer((set, get) => ({
    filter: 'all',
    sortBy: 'takenAt',
    sortDir: 'asc',
    view: 'masonry',
    selectedIds: new Set(),
    lightboxPhotoId: null,
    pendingFlags: {},
    isUploading: false,
    uploadProgress: 0,
    uploadTotal: 0,
    uploadFailed: [],

    setFilter: (filter) => set(s => { s.filter = filter }),
    setSortBy: (sortBy) => set(s => { s.sortBy = sortBy }),
    setSortDir: (dir) => set(s => { s.sortDir = dir }),
    setView: (view) => set(s => { s.view = view }),

    selectPhoto: (id) => set(s => { s.selectedIds.add(id) }),
    deselectPhoto: (id) => set(s => { s.selectedIds.delete(id) }),
    toggleSelect: (id) => set(s => {
      if (s.selectedIds.has(id)) s.selectedIds.delete(id)
      else s.selectedIds.add(id)
    }),
    selectAll: (ids) => set(s => { s.selectedIds = new Set(ids) }),
    clearSelection: () => set(s => { s.selectedIds = new Set() }),

    openLightbox: (photoId) => set(s => { s.lightboxPhotoId = photoId }),
    closeLightbox: () => set(s => { s.lightboxPhotoId = null }),
    lightboxNavigate: (photos, direction) => {
      const { lightboxPhotoId } = get()
      if (!lightboxPhotoId) return
      const idx = photos.findIndex(p => p.id === lightboxPhotoId)
      if (idx === -1) return
      const next = direction === 'next' ? idx + 1 : idx - 1
      if (next >= 0 && next < photos.length) {
        set(s => { s.lightboxPhotoId = photos[next]!.id })
      }
    },

    setPendingFlag: (photoId, flag) => set(s => { s.pendingFlags[photoId] = flag }),
    clearPendingFlag: (photoId) => set(s => { delete s.pendingFlags[photoId] }),

    setUploading: (uploading) => set(s => { s.isUploading = uploading }),
    setUploadProgress: (done, total) => set(s => {
      s.uploadProgress = done
      s.uploadTotal = total
    }),
    addUploadFailed: (filename) => set(s => { s.uploadFailed.push(filename) }),
    resetUpload: () => set(s => {
      s.isUploading = false
      s.uploadProgress = 0
      s.uploadTotal = 0
      s.uploadFailed = []
    }),
  })),
)
