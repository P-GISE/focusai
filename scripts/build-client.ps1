$ErrorActionPreference = 'Stop'

$distPath = Join-Path (Get-Location) 'dist'
if (Test-Path -LiteralPath $distPath) {
  Remove-Item -LiteralPath $distPath -Recurse -Force -ErrorAction SilentlyContinue
}

@'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

await build({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  build: {
    outDir: 'dist',
    reportCompressedSize: false,
    emptyOutDir: false,
  },
})
'@ | node --input-type=module -
