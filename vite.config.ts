import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const clientHost = process.env.FOCUSAI_CLIENT_HOST ?? '0.0.0.0'
const apiProxyTarget = process.env.FOCUSAI_API_PROXY_TARGET ?? 'http://127.0.0.1:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1100,
  },
  server: {
    host: clientHost,
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
