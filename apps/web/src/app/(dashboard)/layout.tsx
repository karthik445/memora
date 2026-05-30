'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth.store'
import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, isHydrated, router])

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
