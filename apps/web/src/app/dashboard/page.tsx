'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { apiFetch } from '@/lib/api'

interface Wedding {
  id: number
  title: string
  date: string
  slug: string
}

export default function Dashboard() {
  const router = useRouter()
  const { token, user, logout } = useAuthStore()
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', date: '', slug: '' })

  useEffect(() => {
    if (!token) { router.replace('/login'); return }
    apiFetch<Wedding[]>('/weddings', {}, token).then(setWeddings).catch(() => logout())
  }, [token, router, logout])

  async function createWedding(e: React.FormEvent) {
    e.preventDefault()
    const w = await apiFetch<Wedding>('/weddings', { method: 'POST', body: JSON.stringify(form) }, token!)
    setWeddings(prev => [w, ...prev])
    setCreating(false)
    setForm({ title: '', date: '', slug: '' })
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Memora</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">{user?.name} · {user?.role}</span>
          <button onClick={logout} className="text-sm text-neutral-400 hover:text-white transition">Logout</button>
        </div>
      </header>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Galleries</h2>
          {user?.role === 'photographer' && (
            <button
              onClick={() => setCreating(c => !c)}
              className="text-sm bg-brand-500 hover:bg-brand-500/80 px-4 py-1.5 rounded-lg transition"
            >
              + New Gallery
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={createWedding} className="bg-neutral-900 p-4 rounded-xl mb-4 space-y-3">
            <input className="w-full bg-neutral-800 rounded px-3 py-2 text-sm outline-none"
              placeholder="Wedding title" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input className="w-full bg-neutral-800 rounded px-3 py-2 text-sm outline-none"
              placeholder="URL slug (e.g. sarah-john-2024)" value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} />
            <input type="date" className="w-full bg-neutral-800 rounded px-3 py-2 text-sm outline-none"
              value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <button type="submit" className="bg-brand-500 px-4 py-2 rounded text-sm">Create</button>
          </form>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {weddings.map(w => (
            <Link key={w.id} href={`/gallery/${w.id}`}
              className="bg-neutral-900 hover:bg-neutral-800 p-4 rounded-xl transition group">
              <p className="font-medium group-hover:text-brand-500 transition">{w.title}</p>
              <p className="text-sm text-neutral-400 mt-1">{new Date(w.date).toLocaleDateString()}</p>
            </Link>
          ))}
          {weddings.length === 0 && (
            <p className="text-neutral-500 text-sm col-span-2">No galleries yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
