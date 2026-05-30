'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[App Error]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center space-y-4"
      >
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          {error.message ?? 'An unexpected error occurred.'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
      </motion.div>
    </div>
  )
}
