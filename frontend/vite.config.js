import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/login': 'http://127.0.0.1:5000',
      '/logout': 'http://127.0.0.1:5000',
      '/register': 'http://127.0.0.1:5000',
      '/download': 'http://127.0.0.1:5000',
      '/admin': 'http://127.0.0.1:5000',
      '/settings': 'http://127.0.0.1:5000',
      '/status': 'http://127.0.0.1:5000',
      '/events': 'http://127.0.0.1:5000',
    }
  },
  build: {
    outDir: '../static/react',
    emptyOutDir: true,
  }
})
