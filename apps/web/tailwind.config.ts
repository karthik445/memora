import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4f0',
          500: '#e07b54',
          900: '#7a2d14',
        },
      },
    },
  },
  plugins: [],
}

export default config
