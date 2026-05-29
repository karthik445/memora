'use client'

interface Peer { id: string; name: string }

export function PresenceBar({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) return null
  return (
    <div className="flex items-center gap-1">
      {peers.slice(0, 5).map(p => (
        <div key={p.id} title={`${p.name} is viewing`}
          className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white">
          {p.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {peers.length > 5 && <span className="text-xs text-neutral-400">+{peers.length - 5}</span>}
    </div>
  )
}
