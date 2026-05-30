import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/lib/providers/ThemeProvider'
import { QueryProvider } from '@/lib/providers/QueryProvider'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Memora', template: '%s | Memora' },
  description: 'AI-powered wedding photo curation and collaborative album selection',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <QueryProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                classNames: {
                  toast: 'bg-card text-card-foreground border border-border shadow-lg',
                  title: 'text-sm font-medium',
                  description: 'text-xs text-muted-foreground',
                },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
