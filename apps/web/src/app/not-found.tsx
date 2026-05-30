import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-4">
        <p className="text-6xl font-bold text-brand-500">404</p>
        <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/dashboard" className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
