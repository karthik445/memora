import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    ppr: true,                    // Partial Pre-Rendering
    reactCompiler: true,          // React Compiler (no manual memo)
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default config
