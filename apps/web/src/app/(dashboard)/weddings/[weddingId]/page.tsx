'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/lib/stores/auth.store'
import { api } from '@/lib/api/client'
import type { Wedding } from '@/types/api'
import { formatDate } from '@/lib/utils'
import { staggerContainer, staggerItem } from '@/lib/motion/variants'
import { Image, Zap, Users, Album, Calendar, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props { params: Promise<{ weddingId: string }> }

const TABS = [
  { href: 'gallery', label: 'Gallery',  icon: Image },
  { href: 'ai',      label: 'AI',       icon: Zap },
  { href: 'review',  label: 'Review',   icon: Users },
  { href: 'album',   label: 'Albums',   icon: Album },
]

export default function WeddingWorkspacePage({ params }: Props) {
  const { weddingId } = use(params)
  const { tenantId } = useAuthStore()
  const pathname = usePathname()

  const { data: wedding, isLoading } = useQuery({
    queryKey: ['wedding', tenantId, weddingId],
    queryFn: () => api.get<Wedding>(`/tenants/${tenantId}/weddings/${weddingId}`),
    enabled: !!tenantId,
  })

  return (
    <motion.div
      variants={staggerContainer} initial="initial" animate="enter"
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Wedding header */}
      <motion.div variants={staggerItem} className="px-6 py-4 border-b border-border flex-shrink-0 bg-background">
        <Link href="/weddings" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 w-fit">
          <ArrowLeft size={12} />
          All weddings
        </Link>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-6 w-48 skeleton rounded" />
            <div className="h-4 w-32 skeleton rounded" />
          </div>
        ) : wedding && (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">{wedding.title}</h1>
              {wedding.coupleNames && (
                <p className="text-sm text-muted-foreground">{wedding.coupleNames}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar size={12} />
              {formatDate(wedding.date)}
            </div>
          </div>
        )}

        {/* Sub-navigation tabs */}
        <div className="flex gap-1 mt-4 -mb-4">
          {TABS.map(tab => {
            const href = `/weddings/${weddingId}/${tab.href}`
            const isActive = pathname.startsWith(href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={href}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={14} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="wedding-tab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </motion.div>

      {/* Default redirect to gallery */}
      <motion.div variants={staggerItem} className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">Select a section above to get started</p>
          <Link
            href={`/weddings/${weddingId}/gallery`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Image size={16} />
            Open Gallery
          </Link>
        </div>
      </motion.div>
    </motion.div>
  )
}
