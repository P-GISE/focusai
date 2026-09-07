import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const tasksVisionRoot = dirname(require.resolve('@mediapipe/tasks-vision'))
const tasksVisionWasmDir = join(tasksVisionRoot, 'wasm')
const assetNames = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

function hashFile(filePath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)

    stream.on('error', rejectHash)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

async function hasSameFileContent(sourcePath, targetPath) {
  try {
    const [sourceStats, targetStats] = await Promise.all([stat(sourcePath), stat(targetPath)])

    if (sourceStats.size !== targetStats.size) {
      return false
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }

    throw error
  }

  const [sourceHash, targetHash] = await Promise.all([hashFile(sourcePath), hashFile(targetPath)])

  return sourceHash === targetHash
}

export async function syncMediapipeAssets(root = process.cwd()) {
  const targetDir = resolve(root, 'public/mediapipe/tasks-vision/wasm')

  await mkdir(targetDir, { recursive: true })

  await Promise.all(
    assetNames.map(async (assetName) => {
      const sourcePath = join(tasksVisionWasmDir, assetName)
      const targetPath = join(targetDir, assetName)

      if (await hasSameFileContent(sourcePath, targetPath)) {
        return
      }

      await copyFile(sourcePath, targetPath)
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncMediapipeAssets()
}
