import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { syncMediapipeAssets } from './sync-mediapipe-assets.mjs'

const clientHost = process.env.FOCUSAI_CLIENT_HOST ?? '0.0.0.0'
const clientPort = Number(process.env.FOCUSAI_CLIENT_PORT ?? 5173)
const apiProxyTarget = process.env.FOCUSAI_API_PROXY_TARGET ?? 'http://127.0.0.1:8787'

await syncMediapipeAssets()

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  server: {
    host: clientHost,
    port: clientPort,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})

await server.listen()
server.printUrls()
