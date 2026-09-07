import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { syncMediapipeAssets } from './sync-mediapipe-assets.mjs'

const distPath = resolve(process.cwd(), 'dist')
const defaultApiBaseUrl = 'https://focusai.ibetter.kr/api'
const androidApiBaseUrl =
  process.env.VITE_ANDROID_API_BASE_URL?.trim() ||
  process.env.VITE_API_BASE_URL?.trim() ||
  defaultApiBaseUrl

process.env.VITE_API_BASE_URL = androidApiBaseUrl

await syncMediapipeAssets()
await rm(distPath, { recursive: true, force: true })

await build({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1100,
    reportCompressedSize: false,
    emptyOutDir: false,
  },
})
