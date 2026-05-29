'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Peer { id: string; name: string }

export function usePresence(weddingId: string, token: string | null) {
  const [peers, setPeers] = useState<Peer[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!token) return
    const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'
    const ws = new WebSocket(`${wsBase}/presence/${weddingId}?token=${token}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; users?: Peer[] }
        if (msg.type === 'presence' && msg.users) {
          setPeers(msg.users)
        } else {
          // Forward other events as DOM events for components to consume
          window.dispatchEvent(new CustomEvent('memora:ws', { detail: msg }))
        }
      } catch {
        // ignore
      }
    }

    ws.onerror = () => {}
    ws.onclose = () => {}

    return () => { ws.close() }
  }, [weddingId, token])

  const emit = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { peers, emit }
}
