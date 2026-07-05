/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nb: {
          bg: '#FFFDF6',
          foreground: '#000000',
          main: '#00FFCC',
          'main-foreground': '#000000',
          secondary: '#FFFFFF',
          'secondary-foreground': '#000000',
          border: '#000000',
          shadow: '#000000',
          muted: '#555555',
          muted2: '#888888',
          surface: '#FFFFFF',
          surface2: '#F5F5F5',
          danger: '#FF3333',
          'danger-foreground': '#000000',
          warning: '#FFB703',
          'warning-foreground': '#000000',
          info: '#7B2CBF',
          'info-foreground': '#FFFFFF',
          success: '#00FFCC',
          purple: '#7B2CBF',
          yellow: '#FFB703',
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
        nb: '5px 5px 0px 0px #000000',
        'nb-sm': '3px 3px 0px 0px #000000',
        'nb-lg': '8px 8px 0px 0px #000000',
        'nb-hover': '0px 0px 0px 0px #000000',
        'nb-green': '5px 5px 0px 0px #00FFCC',
        'nb-purple': '5px 5px 0px 0px #7B2CBF',
      },
      translate: {
        nb: '4px',
        'nb-sm': '3px',
        'nb-lg': '5px',
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
        pulseGreen: { '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,255,204,0.4)' }, '50%': { boxShadow: '0 0 0 8px rgba(0,255,204,0)' } },
      },
    },
  },
  plugins: [],
}
