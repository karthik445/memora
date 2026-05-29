'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { apiFetch } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore(s => s.setAuth)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'client' })
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : form
      const data = await apiFetch<{ token: string; user: { id: number; email: string; name: string; role: string } }>(
        endpoint, { method: 'POST', body: JSON.stringify(body) },
      )
      setAuth(data.token, data.user)
      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-center">Memora</h1>
        <p className="text-neutral-400 text-center text-sm">Wedding gallery platform</p>

        <form onSubmit={submit} className="space-y-4 bg-neutral-900 p-6 rounded-2xl">
          {mode === 'register' && (
            <>
              <input
                className="w-full bg-neutral-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <select
                className="w-full bg-neutral-800 rounded-lg px-4 py-2 text-sm outline-none"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              >
                <option value="client">Client (Bride / Family)</option>
                <option value="photographer">Photographer</option>
              </select>
            </>
          )}
          <input
            type="email"
            className="w-full bg-neutral-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
          <input
            type="password"
            className="w-full bg-neutral-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-brand-500 hover:bg-brand-500/80 rounded-lg py-2 font-medium transition">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-neutral-400">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="text-brand-500 hover:underline" onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
