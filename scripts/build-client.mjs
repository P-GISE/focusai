import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { syncMediapipeAssets } from './sync-mediapipe-assets.mjs'

const distPath = resolve(process.cwd(), 'dist')

await syncMediapipeAssets()
await rm(distPath, { recursive: true, force: true })

await build({
  configFile: false,
  root: '.',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1100,
    reportCompressedSize: false,
    emptyOutDir: false,
  },
})
