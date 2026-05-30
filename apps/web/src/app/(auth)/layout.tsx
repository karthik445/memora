import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sign in' }

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left — branding panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-neutral-950 relative overflow-hidden">
        {/* Abstract gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-neutral-950 to-neutral-950" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-700/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-600/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-white font-semibold text-lg">Memora</span>
          </div>
        </div>

        <div className="relative space-y-4">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Every moment,<br />perfectly curated.
          </h1>
          <p className="text-neutral-400 text-lg max-w-sm">
            AI-powered wedding photo curation. Collaborate with clients in real time.
            Deliver albums they&apos;ll love forever.
          </p>
        </div>

        <div className="relative">
          <p className="text-neutral-600 text-sm">
            &copy; {new Date().getFullYear()} Memora. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right — auth form */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-foreground font-semibold text-lg">Memora</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
