import { preview } from 'vite'
import react from '@vitejs/plugin-react'

const previewHost = process.env.FOCUSAI_PREVIEW_HOST ?? process.env.FOCUSAI_CLIENT_HOST ?? '0.0.0.0'
const apiProxyTarget = process.env.FOCUSAI_API_PROXY_TARGET ?? 'http://127.0.0.1:8787'

const server = await preview({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  preview: {
    host: previewHost,
    port: 4173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})

server.printUrls()
