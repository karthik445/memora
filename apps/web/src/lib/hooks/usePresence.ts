'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '@/lib/stores/auth.store'
import type { PresencePeer } from '@/types/api'

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

// Deterministic colour from userId string
function peerColor(userId: string): string {
  const colors = ['#a855f7','#3b82f6','#22c55e','#f59e0b','#ef4444','#14b8a6','#ec4899','#f97316']
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash << 5) - hash + userId.charCodeAt(i)
  return colors[Math.abs(hash) % colors.length]!
}

export type PresenceMessage =
  | { type: 'photo_flag'; photoId: string; flag: string; fromUserId: string; fromName: string }
  | { type: 'viewing'; photoId: string; fromUserId: string; fromName: string }
  | { type: 'comment'; photoId: string; fromUserId: string; fromName: string }
  | { type: 'presence'; users: { id: string; name: string }[] }

export function usePresence(weddingId: string) {
  const { accessToken, tenantId } = useAuthStore()
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const connect = useCallback(() => {
    if (!accessToken || !tenantId || !weddingId) return

    const url = `${WS_BASE}/presence/${weddingId}?token=${accessToken}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setIsConnected(true)

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as PresenceMessage

        if (msg.type === 'presence') {
          setPeers(
            msg.users.map(u => ({
              userId: u.id,
              name: u.name,
              color: peerColor(u.id),
              viewingPhotoId: null,
              lastSeen: Date.now(),
            })),
          )
        }

        // Dispatch to global event bus for components to consume
        window.dispatchEvent(new CustomEvent('memora:presence', { detail: msg }))
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      // Exponential backoff reconnect
      reconnectTimeout.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
  }, [accessToken, tenantId, weddingId])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
    }
  }, [connect])

  const emit = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { peers, isConnected, emit }
}
