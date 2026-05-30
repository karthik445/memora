'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,         // 1 minute
            gcTime: 5 * 60 * 1000,        // 5 minutes
            retry: (failureCount, error) => {
              // Don't retry 401/403/404
              if (error instanceof Error && 'status' in error) {
                const status = (error as { status: number }).status
                if ([401, 403, 404].includes(status)) return false
              }
              return failureCount < 2
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      )}
    </QueryClientProvider>
  )
}
