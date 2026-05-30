import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check for auth token in cookie (set by the auth store on login)
  // We use a lightweight check here — full verification happens in the API
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // Redirect root to dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // If accessing protected route without auth cookie, redirect to login
  // The actual token validation happens client-side via Zustand persistence
  if (!isPublicPath && !pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
    const hasAuthCookie = request.cookies.has('memora_refresh')
    if (!hasAuthCookie) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
