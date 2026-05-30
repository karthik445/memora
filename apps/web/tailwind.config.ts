import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary:     { DEFAULT: 'hsl(var(--primary))',     foreground: 'hsl(var(--primary-foreground))' },
        secondary:   { DEFAULT: 'hsl(var(--secondary))',   foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted:       { DEFAULT: 'hsl(var(--muted))',       foreground: 'hsl(var(--muted-foreground))' },
        accent:      { DEFAULT: 'hsl(var(--accent))',      foreground: 'hsl(var(--accent-foreground))' },
        popover:     { DEFAULT: 'hsl(var(--popover))',     foreground: 'hsl(var(--popover-foreground))' },
        card:        { DEFAULT: 'hsl(var(--card))',        foreground: 'hsl(var(--card-foreground))' },
        sidebar:     { DEFAULT: 'hsl(var(--sidebar))',     foreground: 'hsl(var(--sidebar-foreground))', border: 'hsl(var(--sidebar-border))' },
        brand: {
          50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe',
          400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce',
          800: '#6b21a8', 900: '#581c87', 950: '#3b0764',
        },
        favorite: { DEFAULT: '#f59e0b', subtle: 'rgb(254 243 199)' },
        musthave: { DEFAULT: '#a855f7', subtle: 'rgb(243 232 255)' },
        rejected: { DEFAULT: '#ef4444', subtle: 'rgb(254 226 226)' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', ...fontFamily.sans],
        mono: ['var(--font-mono)', ...fontFamily.mono],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        photo:    '0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3)',
        'photo-lg': '0 10px 30px -5px rgb(0 0 0 / 0.5)',
        glow:     '0 0 20px -5px hsl(var(--primary) / 0.5)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        shimmer:          'shimmer 2s linear infinite',
        'fade-in':        'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
