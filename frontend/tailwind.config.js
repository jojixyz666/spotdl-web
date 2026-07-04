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
        surface: {
          0: '#0a0a0a',
          1: '#121212',
          2: '#181818',
          3: '#1e1e1e',
          4: '#242424',
          5: '#2a2a2a',
        },
        text: {
          primary: '#f0f0f0',
          secondary: '#8a8a8a',
          muted: '#5a5a5a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-green': 'pulseGreen 2s ease-in-out infinite',
        'spin-slow': 'spin 1.2s linear infinite',
        'blob': 'blob 7s infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        pulseGreen: { '0%, 100%': { boxShadow: '0 0 0 0 rgba(29,185,84,0.4)' }, '50%': { boxShadow: '0 0 0 8px rgba(29,185,84,0)' } },
        blob: { '0%': { transform: 'translate(0px, 0px) scale(1)' }, '33%': { transform: 'translate(30px, -50px) scale(1.1)' }, '66%': { transform: 'translate(-20px, 20px) scale(0.9)' }, '100%': { transform: 'translate(0px, 0px) scale(1)' } },
      },
    },
  },
  plugins: [],
}
