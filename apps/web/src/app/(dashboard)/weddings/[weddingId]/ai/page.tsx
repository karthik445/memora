'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/lib/stores/auth.store'
import { api } from '@/lib/api/client'
import type { Photo } from '@/types/api'
import { staggerContainer, staggerItem } from '@/lib/motion/variants'
import { Loader2, Eye, EyeOff, Trash2, Copy, RefreshCw, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { toast } from 'sonner'
import { photoKeys } from '@/lib/hooks/usePhotos'

interface Props { params: Promise<{ weddingId: string }> }

interface AiInsights {
  totalPhotos: number
  processedPhotos: number
  blurCount: number
  duplicateCount: number
  processingQueue: number
  topFaces: { label: string; count: number }[]
}

export default function AiPage({ params }: Props) {
  const { weddingId } = use(params)
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'overview' | 'blur' | 'duplicates' | 'faces'>('overview')

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['ai-insights', tenantId, weddingId],
    queryFn: () => api.get<AiInsights>(`/tenants/${tenantId}/weddings/${weddingId}/ai/insights`),
    refetchInterval: 10_000, // poll while processing
    enabled: !!tenantId,
  })

  const { data: blurPhotos = [] } = useQuery({
    queryKey: ['blur-photos', tenantId, weddingId],
    queryFn: () => api.get<{ photos: Photo[]; signedUrls: Record<string, string> }>(
      `/tenants/${tenantId}/photos?weddingId=${weddingId}&filter=blur&limit=50`,
    ),
    enabled: activeTab === 'blur' && !!tenantId,
    select: d => d.photos.map(p => ({ ...p, url: d.signedUrls[`${p.id}:thumbnail`] ?? '' })),
  })

  const { data: dupPhotos = [] } = useQuery({
    queryKey: ['dup-photos', tenantId, weddingId],
    queryFn: () => api.get<{ photos: Photo[]; signedUrls: Record<string, string> }>(
      `/tenants/${tenantId}/photos?weddingId=${weddingId}&filter=duplicate&limit=50`,
    ),
    enabled: activeTab === 'duplicates' && !!tenantId,
    select: d => d.photos.map(p => ({ ...p, url: d.signedUrls[`${p.id}:thumbnail`] ?? '' })),
  })

  const rejectBlurMutation = useMutation({
    mutationFn: () =>
      api.patch(`/tenants/${tenantId}/photos/bulk`, {
        photoIds: blurPhotos.map(p => p.id),
        selectionFlag: 'REJECTED',
      }),
    onSuccess: () => {
      toast.success(`${blurPhotos.length} blurry photos rejected`)
      qc.invalidateQueries({ queryKey: photoKeys.all(tenantId!) })
    },
  })

  const deleteDupsMutation = useMutation({
    mutationFn: () =>
      api.delete(`/tenants/${tenantId}/photos/bulk/duplicates?weddingId=${weddingId}`),
    onSuccess: () => {
      toast.success('Duplicate photos removed')
      qc.invalidateQueries({ queryKey: photoKeys.all(tenantId!) })
    },
  })

  const TABS = [
    { key: 'overview',   label: 'Overview' },
    { key: 'blur',       label: `Blur (${insights?.blurCount ?? 0})` },
    { key: 'duplicates', label: `Duplicates (${insights?.duplicateCount ?? 0})` },
    { key: 'faces',      label: 'Faces' },
  ] as const

  return (
    <motion.div
      variants={staggerContainer} initial="initial" animate="enter"
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <motion.div variants={staggerItem} className="px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-brand-400" />
          <h1 className="text-lg font-semibold">AI Insights</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automated quality analysis and smart curation suggestions
        </p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-border flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative px-3 py-2 text-sm font-medium rounded-t-md transition-colors',
              activeTab === tab.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <motion.div layoutId="ai-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <motion.div variants={staggerContainer} initial="initial" animate="enter" className="space-y-6">
            {/* Processing progress */}
            {insightsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 size={14} className="animate-spin" />
                Loading AI insights…
              </div>
            ) : insights && (
              <>
                <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Processing Progress</h3>
                    <span className="text-xs text-muted-foreground">
                      {insights.processedPhotos} / {insights.totalPhotos}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-brand-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${insights.totalPhotos > 0 ? (insights.processedPhotos / insights.totalPhotos) * 100 : 0}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  {insights.processingQueue > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" />
                      {insights.processingQueue} photos in queue
                    </p>
                  )}
                </motion.div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Total Photos',   value: insights.totalPhotos,     color: 'text-foreground' },
                    { label: 'Processed',      value: insights.processedPhotos, color: 'text-green-500' },
                    { label: 'Blurry',         value: insights.blurCount,       color: 'text-orange-400' },
                    { label: 'Duplicates',     value: insights.duplicateCount,  color: 'text-yellow-400' },
                    { label: 'In Queue',       value: insights.processingQueue, color: 'text-blue-400' },
                    { label: 'Faces Found',    value: insights.topFaces.reduce((s, f) => s + f.count, 0), color: 'text-purple-400' },
                  ].map(stat => (
                    <motion.div key={stat.label} variants={staggerItem} className="bg-card rounded-xl border border-border p-4 text-center">
                      <p className={cn('text-2xl font-bold', stat.color)}>{stat.value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        {activeTab === 'blur' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {blurPhotos.length} blurry photos detected. Reject them to keep your gallery clean.
              </p>
              <button
                onClick={() => rejectBlurMutation.mutate()}
                disabled={rejectBlurMutation.isPending || blurPhotos.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {rejectBlurMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />}
                Reject all blurry
              </button>
            </div>
            <PhotoGrid photos={blurPhotos} />
          </div>
        )}

        {activeTab === 'duplicates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {dupPhotos.length} near-duplicate photos found using CLIP embeddings.
              </p>
              <button
                onClick={() => deleteDupsMutation.mutate()}
                disabled={deleteDupsMutation.isPending || dupPhotos.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteDupsMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete duplicates
              </button>
            </div>
            <PhotoGrid photos={dupPhotos} />
          </div>
        )}

        {activeTab === 'faces' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Face tracking groups photos by detected individuals.
            </p>
            {insights?.topFaces && insights.topFaces.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {insights.topFaces.map(face => (
                  <div key={face.label} className="bg-card rounded-xl border border-border p-4 text-center">
                    <div className="w-14 h-14 rounded-full bg-brand-500/20 mx-auto mb-2 flex items-center justify-center">
                      <span className="text-lg">{face.label[0]?.toUpperCase()}</span>
                    </div>
                    <p className="text-sm font-medium">{face.label || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{face.count} photos</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No faces detected yet. AI processing may still be running.</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function PhotoGrid({ photos }: { photos: (Photo & { url: string })[] }) {
  if (photos.length === 0) return (
    <p className="text-sm text-muted-foreground text-center py-8">No photos in this category.</p>
  )
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
      {photos.map(p => (
        <div key={p.id} className="aspect-square rounded-md overflow-hidden bg-muted relative">
          {p.url && <Image src={p.url} alt={p.originalFilename} fill className="object-cover" unoptimized />}
        </div>
      ))}
    </div>
  )
}
