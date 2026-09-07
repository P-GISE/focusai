import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import type { DiscordBotGateway, DiscordBotRuntimeSettings } from './discord-bot-manager.js'

type SpawnProcess = (
  file: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess

type ProcessDiscordBotGatewayOptions = {
  botDir: string
  entrypoint?: string
  commandDeployEntrypoint?: string
  startupTimeoutMs?: number
  spawnProcess?: SpawnProcess
  logPrefix?: string
}

function pipeProcessOutput(prefix: string, stream: Readable | null, isError: boolean) {
  if (!stream) {
    return
  }

  let pending = ''
  stream.on('data', (chunk: Buffer | string) => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''

    for (const line of lines) {
      if (line.trim()) {
        const output = `[${prefix}] ${line}`
        if (isError) {
          console.error(output)
        } else {
          console.log(output)
        }
      }
    }
  })
}

function formatExitReason(code: number | null, signal: NodeJS.Signals | null) {
  if (signal) {
    return `signal ${signal}`
  }

  return `code ${code ?? 'unknown'}`
}

function assertProcessStartable(settings: DiscordBotRuntimeSettings) {
  if (!settings.token?.trim()) {
    throw new Error('Bot token is required.')
  }

  if (!settings.clientId.trim()) {
    throw new Error('Discord application ID is required.')
  }
}

function assertDirectoryExists(directoryPath: string, label: string) {
  try {
    if (statSync(directoryPath).isDirectory()) {
      return
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${directoryPath}`, { cause: error })
    }

    throw error
  }

  throw new Error(`${label} is not a directory: ${directoryPath}`)
}

function assertFileExists(filePath: string, label: string) {
  try {
    if (statSync(filePath).isFile()) {
      return
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`${label} does not exist: ${filePath}`, { cause: error })
    }

    throw error
  }

  throw new Error(`${label} is not a file: ${filePath}`)
}

function resolveBotPath(botDir: string, filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.join(botDir, filePath)
}

function assertProcessBotFiles(options: {
  botDir: string
  entrypoint: string
  commandDeployEntrypoint: string
  registerCommands: boolean
}) {
  assertDirectoryExists(options.botDir, 'Discord bot directory')
  assertFileExists(resolveBotPath(options.botDir, options.entrypoint), 'Discord bot entrypoint')

  if (options.registerCommands) {
    assertFileExists(
      resolveBotPath(options.botDir, options.commandDeployEntrypoint),
      'Discord bot command deploy entrypoint',
    )
  }
}

async function runOneShotProcess(options: {
  entrypoint: string
  botDir: string
  env: NodeJS.ProcessEnv
  spawnProcess: SpawnProcess
  logPrefix: string
}) {
  const child = options.spawnProcess(process.execPath, [options.entrypoint], {
    cwd: options.botDir,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  pipeProcessOutput(options.logPrefix, child.stdout, false)
  pipeProcessOutput(options.logPrefix, child.stderr, true)

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Process Discord bot command failed (${formatExitReason(code, signal)}).`))
    })
  })
}

export function createProcessDiscordBotGateway(
  options: ProcessDiscordBotGatewayOptions,
): DiscordBotGateway {
  const entrypoint = options.entrypoint ?? 'dist/index.js'
  const commandDeployEntrypoint = options.commandDeployEntrypoint ?? 'dist/deploy-commands.js'
  const startupTimeoutMs = options.startupTimeoutMs ?? 3_000
  const spawnProcess = options.spawnProcess ?? spawn
  const logPrefix = options.logPrefix ?? 'discord-process-bot'

  return {
    async start(settings) {
      assertProcessStartable(settings)
      assertProcessBotFiles({
        botDir: options.botDir,
        entrypoint,
        commandDeployEntrypoint,
        registerCommands: settings.registerCommands,
      })

      const token = settings.token!.trim()
      const clientId = settings.clientId.trim()
      const processEnv = {
        ...process.env,
        DISCORD_TOKEN: token,
        DISCORD_CLIENT_ID: clientId,
        DISCORD_GUILD_ID: settings.guildIds[0] ?? '',
      }

      if (settings.registerCommands) {
        await runOneShotProcess({
          entrypoint: commandDeployEntrypoint,
          botDir: options.botDir,
          env: processEnv,
          spawnProcess,
          logPrefix,
        })
      }

      const child = spawnProcess(process.execPath, [entrypoint], {
        cwd: options.botDir,
        env: processEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let exited = false

      pipeProcessOutput(logPrefix, child.stdout, false)
      pipeProcessOutput(logPrefix, child.stderr, true)

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const cleanup = () => {
          child.off('error', handleError)
          child.off('exit', handleExit)
          clearTimeout(timer)
        }
        const settle = (callback: () => void) => {
          if (settled) {
            return
          }

          settled = true
          cleanup()
          callback()
        }
        const handleError = (error: Error) => {
          settle(() => reject(error))
        }
        const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
          exited = true
          settle(() =>
            reject(new Error(`Process Discord bot exited before startup (${formatExitReason(code, signal)}).`)),
          )
        }
        const timer = setTimeout(() => {
          settle(resolve)
        }, startupTimeoutMs)

        child.once('error', handleError)
        child.once('exit', handleExit)
      })

      child.once('exit', () => {
        exited = true
      })

      return {
        botUserTag: null,
        async stop() {
          if (exited || child.killed) {
            return
          }

          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5_000)
            child.once('exit', () => {
              clearTimeout(timer)
              resolve()
            })

            if (!child.kill()) {
              clearTimeout(timer)
              resolve()
            }
          })
        },
      }
    },
  }
}
