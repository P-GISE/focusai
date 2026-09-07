$ErrorActionPreference = 'Stop'

@'
import { preview } from 'vite'
import react from '@vitejs/plugin-react'

const server = await preview({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})

server.printUrls()
'@ | node --input-type=module -
