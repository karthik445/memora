'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Image, Album, Users, Settings,
  ChevronLeft, ChevronRight, LogOut, Moon, Sun,
} from 'lucide-react'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/lib/stores/auth.store'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { sidebarVariants } from '@/lib/motion/variants'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/dashboard',  icon: <LayoutDashboard size={18} />, exact: true },
  { label: 'Weddings',   href: '/weddings',   icon: <Image size={18} /> },
  { label: 'Albums',     href: '/albums',     icon: <Album size={18} /> },
  { label: 'Clients',    href: '/clients',    icon: <Users size={18} /> },
  { label: 'Settings',   href: '/settings',   icon: <Settings size={18} /> },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { user, clearAuth } = useAuthStore()
  const router = useRouter()

  const handleLogout = async () => {
    clearAuth()
    router.replace('/login')
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <motion.aside
      variants={sidebarVariants}
      animate={collapsed ? 'closed' : 'open'}
      initial={false}
      className="relative flex flex-col h-full bg-sidebar border-r border-sidebar-border overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border flex-shrink-0">
        <div className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-xs">M</span>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="ml-2.5 font-semibold text-sidebar-foreground overflow-hidden whitespace-nowrap"
            >
              Memora
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors relative group',
              isActive(item)
                ? 'bg-brand-500/15 text-brand-400 font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
            {/* Active indicator */}
            {isActive(item) && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-500 rounded-r-full"
              />
            )}
            {/* Tooltip on collapsed */}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md border border-border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </div>
            )}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* User + logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut size={18} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden whitespace-nowrap">
                {user ? `${user.firstName} ${user.lastName}` : 'Sign out'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground flex items-center justify-center shadow-sm transition-colors z-10"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  )
}
