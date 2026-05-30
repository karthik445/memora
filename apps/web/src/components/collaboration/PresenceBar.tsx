'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { PresencePeer } from '@/types/api'
import { cn } from '@/lib/utils'
import { presenceBadgeVariants } from '@/lib/motion/variants'

interface Props {
  peers: PresencePeer[]
  maxVisible?: number
}

export function PresenceBar({ peers, maxVisible = 5 }: Props) {
  const visible = peers.slice(0, maxVisible)
  const overflow = peers.length - maxVisible

  return (
    <div className="flex items-center gap-1" role="status" aria-label={`${peers.length} people viewing`}>
      <AnimatePresence mode="popLayout">
        {visible.map(peer => (
          <motion.div
            key={peer.userId}
            variants={presenceBadgeVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            layout
            className="relative group"
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white border-2 border-background cursor-default"
              style={{ backgroundColor: peer.color }}
              aria-label={peer.name}
            >
              {peer.name.slice(0, 2).toUpperCase()}
            </div>

            {/* Online dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-background" />

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md border border-border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {peer.name}
            </div>
          </motion.div>
        ))}

        {overflow > 0 && (
          <motion.div
            key="overflow"
            variants={presenceBadgeVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground border-2 border-background"
          >
            +{overflow}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
