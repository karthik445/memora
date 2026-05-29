import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Memora — Wedding Gallery',
  description: 'Collaborative wedding photo selection',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen">{children}</body>
    </html>
  )
}
