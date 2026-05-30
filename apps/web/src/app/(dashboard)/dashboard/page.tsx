'use client'

import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Image, Heart, Star, TrendingUp, Calendar } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth.store'
import { api } from '@/lib/api/client'
import type { Wedding } from '@/types/api'
import { formatDate } from '@/lib/utils'
import { staggerContainer, staggerItem } from '@/lib/motion/variants'
import { cn } from '@/lib/utils'

function StatCard({ label, value, icon: Icon, trend }: {
  label: string; value: string | number; icon: React.ElementType; trend?: string
}) {
  return (
    <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 flex items-start justify-between">
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        {trend && <p className="text-xs text-green-500 mt-1">{trend}</p>}
      </div>
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon size={18} className="text-primary" />
      </div>
    </motion.div>
  )
}

function WeddingCard({ wedding }: { wedding: Wedding }) {
  return (
    <motion.div variants={staggerItem}>
      <Link
        href={`/weddings/${wedding.id}`}
        className="block bg-card rounded-xl border border-border hover:border-brand-400/50 p-4 transition-all hover:shadow-glow group"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-brand-400 transition-colors">
              {wedding.title}
            </h3>
            {wedding.coupleNames && (
              <p className="text-sm text-muted-foreground truncate">{wedding.coupleNames}</p>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2 flex-shrink-0">
            <Calendar size={12} />
            {formatDate(wedding.date, { month: 'short', day: 'numeric' })}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Image size={12} /> {wedding._count?.photos?.toLocaleString() ?? 0} photos
          </span>
          {wedding.isArchived && (
            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">Archived</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

function WeddingsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="h-4 w-3/4 skeleton rounded" />
          <div className="h-3 w-1/2 skeleton rounded" />
          <div className="h-3 w-1/4 skeleton rounded" />
        </div>
      ))}
    </div>
  )
}

function DashboardContent() {
  const { tenantId, user } = useAuthStore()

  const { data: weddings = [], isLoading } = useQuery({
    queryKey: ['weddings', tenantId],
    queryFn: () => api.get<Wedding[]>(`/tenants/${tenantId}/weddings`),
    enabled: !!tenantId,
  })

  const totalPhotos = weddings.reduce((s, w) => s + (w._count?.photos ?? 0), 0)
  const activeWeddings = weddings.filter(w => !w.isArchived).length

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="enter"
      className="p-6 space-y-6 overflow-y-auto flex-1"
    >
      {/* Header */}
      <motion.div variants={staggerItem} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Good {getTimeOfDay()}, {user?.firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening in your studio</p>
        </div>
        <Link
          href="/weddings/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          New Wedding
        </Link>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Weddings" value={weddings.length} icon={Calendar} />
        <StatCard label="Active" value={activeWeddings} icon={TrendingUp} />
        <StatCard label="Total Photos" value={totalPhotos.toLocaleString()} icon={Image} />
        <StatCard label="This Month" value={getThisMonthCount(weddings)} icon={Star} />
      </div>

      {/* Recent weddings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Recent Weddings</h2>
          <Link href="/weddings" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
            View all →
          </Link>
        </div>

        {isLoading ? (
          <WeddingsSkeleton />
        ) : weddings.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
              <Image size={24} />
            </div>
            <p className="text-sm font-medium">No weddings yet</p>
            <p className="text-xs mt-1 mb-4">Create your first wedding gallery to get started</p>
            <Link href="/weddings/new" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
              Create a wedding →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weddings.slice(0, 9).map(w => <WeddingCard key={w.id} wedding={w} />)}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <DashboardContent />
    </Suspense>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function getThisMonthCount(weddings: Wedding[]) {
  const now = new Date()
  return weddings.filter(w => {
    const d = new Date(w.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
}
