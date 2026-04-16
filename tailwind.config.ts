import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'rs-blue': {
          DEFAULT: '#1E3A6B',
          logo: '#1E3A6B',
          fusion: '#496275',
        },
        'rs-cream': {
          DEFAULT: '#FBF5E4',
          full: '#F6EBC8',
        },
        'rs-ink': '#1a1a1a',
      },
      fontFamily: {
        sans: ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'rs': '14px',
        'rs-lg': '24px',
      },
    },
  },
  plugins: [],
}

export default config
