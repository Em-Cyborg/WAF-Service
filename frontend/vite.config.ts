import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      'frontend.domaintesting.org',
      'localhost',
      '127.0.0.1'
    ],
    proxy: {
      '/api': {
        target: 'http://frontend.domaintesting.org:8000',
        changeOrigin: true,
      },
      '/success': {
        target: 'http://frontend.domaintesting.org:8000',
        changeOrigin: true,
      },
      '/fail': {
        target: 'http://frontend.domaintesting.org:8000',
        changeOrigin: true,
      }
    }
  }
})
