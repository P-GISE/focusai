import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function isInsideDirectory(parentDir, childPath) {
  const relativePath = path.relative(parentDir, childPath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    child.once('error', rejectRun)
    child.once('exit', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }

      rejectRun(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`))
    })
  })
}

export async function buildTsProject(tsconfigPath, outDir) {
  if (!tsconfigPath || !outDir) {
    throw new Error('Usage: node scripts/build-ts-project.mjs <tsconfig> <outDir>')
  }

  const rootDir = process.cwd()
  const resolvedOutDir = path.resolve(rootDir, outDir)

  if (!isInsideDirectory(rootDir, resolvedOutDir)) {
    throw new Error(`Refusing to clean output directory outside the project: ${outDir}`)
  }

  await rm(resolvedOutDir, { recursive: true, force: true })
  await run(process.execPath, [
    path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p',
    tsconfigPath,
  ])
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildTsProject(process.argv[2], process.argv[3])
}
