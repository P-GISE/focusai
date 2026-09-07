import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = process.cwd()
const outDir = path.join(rootDir, 'server', 'dist', 'lostark-discord-bot')
const sourceDataDir = path.join(rootDir, 'lostark-discord-bot', 'data')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`))
    })
  })
}

await rm(outDir, { recursive: true, force: true })

await run(process.execPath, [
  path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  '-p',
  'lostark-discord-bot/tsconfig.json',
  '--outDir',
  'server/dist/lostark-discord-bot',
  '--ignoreDeprecations',
  '6.0',
])

await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, 'package.json'), '{"type":"commonjs"}\n')
await cp(sourceDataDir, path.join(outDir, 'data'), {
  recursive: true,
  force: true,
})
