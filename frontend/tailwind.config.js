/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: '#1DB954',
          'green-hover': '#1ed760',
          'green-dark': '#169c46',
        },
        nb: {
          bg: '#121212',
          foreground: '#f0f0f0',
          main: '#1DB954',
          'main-foreground': '#000000',
          secondary: '#1e1e1e',
          border: '#f0f0f0',
          shadow: '#f0f0f0',
          muted: '#a1a1a1',
          muted2: '#5a5a5a',
          surface: '#181818',
          surface2: '#222222',
          danger: '#ef4444',
          'danger-foreground': '#ffffff',
          warning: '#f59e0b',
          info: '#3b82f6',
          success: '#1DB954',
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        nb: '0.75rem',
      },
      boxShadow: {
        nb: '4px 4px 0px 0px #f0f0f0',
        'nb-sm': '2px 2px 0px 0px #f0f0f0',
        'nb-lg': '6px 6px 0px 0px #f0f0f0',
        'nb-green': '4px 4px 0px 0px #1DB954',
        'nb-hover': '0px 0px 0px 0px #f0f0f0',
        'nb-green-hover': '0px 0px 0px 0px #1DB954',
      },
      translate: {
        nb: '3px',
        'nb-sm': '2px',
        'nb-lg': '4px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-green': 'pulseGreen 2s ease-in-out infinite',
        'spin-slow': 'spin 1.2s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        pulseGreen: { '0%, 100%': { boxShadow: '0 0 0 0 rgba(29,185,84,0.4)' }, '50%': { boxShadow: '0 0 0 8px rgba(29,185,84,0)' } },
      },
    },
  },
  plugins: [],
}
