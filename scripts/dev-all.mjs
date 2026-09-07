import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const tsxPackagePath = require.resolve('tsx/package.json')
const tsxCliPath = join(dirname(tsxPackagePath), 'dist', 'cli.mjs')

const children = [
  {
    name: 'server',
    child: spawn(process.execPath, [tsxCliPath, 'server/src/index.ts'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
    }),
  },
  {
    name: 'client',
    child: spawn(process.execPath, ['scripts/dev-client.mjs'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
    }),
  },
  {
    name: 'bot',
    child: spawn(process.execPath, [tsxCliPath, 'bot/src/index.ts'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
    }),
  },
]

let shuttingDown = false

function prefixStream(name, stream, output) {
  let pending = ''

  stream.on('data', (chunk) => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''

    for (const line of lines) {
      output.write(`[${name}] ${line}\n`)
    }
  })

  stream.on('end', () => {
    if (pending) {
      output.write(`[${name}] ${pending}\n`)
    }
  })
}

function stopChildren() {
  shuttingDown = true

  for (const { child } of children) {
    if (!child.killed) {
      child.kill()
    }
  }
}

for (const { name, child } of children) {
  prefixStream(name, child.stdout, process.stdout)
  prefixStream(name, child.stderr, process.stderr)

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }

    const reason = signal ? `signal ${signal}` : `code ${code}`
    console.error(`[${name}] exited with ${reason}`)
    stopChildren()
    process.exitCode = code ?? 1
  })
}

process.on('SIGINT', stopChildren)
process.on('SIGTERM', stopChildren)
