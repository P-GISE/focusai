import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { createProcessDiscordBotGateway } from './process-discord-bot-gateway.js'
import type { DiscordBotRuntimeSettings } from './discord-bot-manager.js'

const baseSettings: DiscordBotRuntimeSettings = {
  enabled: true,
  token: 'discord-token',
  clientId: 'discord-client-id',
  guildIds: ['discord-guild-id'],
  adminChannelId: null,
  adminRoleIds: [],
  botActorUserId: null,
  registerCommands: false,
  adminUrl: null,
  supportPollMs: 30_000,
  healthPollMs: 60_000,
  dailySummaryHour: 9,
}

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false

  kill() {
    this.killed = true
    queueMicrotask(() => this.emit('exit', 0, null))
    return true
  }
}

function createProcessBotDir(parentDirectory: string, options?: { deployCommands?: boolean }) {
  const botDir = path.join(parentDirectory, 'process-bot')
  const distDir = path.join(botDir, 'dist')

  mkdirSync(distDir, { recursive: true })
  writeFileSync(path.join(distDir, 'index.js'), '')

  if (options?.deployCommands) {
    writeFileSync(path.join(distDir, 'deploy-commands.js'), '')
  }

  return botDir
}

test('ProcessDiscordBotGateway starts a bot process with Discord env settings', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-process-bot-'))
  const botDir = createProcessBotDir(directory)
  const child = new FakeChildProcess()
  const spawns: Array<{ file: string; args: string[]; options: SpawnOptions }> = []
  const gateway = createProcessDiscordBotGateway({
    botDir,
    startupTimeoutMs: 1,
    spawnProcess(file, args, options) {
      spawns.push({ file, args, options })
      return child as unknown as ChildProcess
    },
  })

  try {
    const runtime = await gateway.start(baseSettings)

    assert.equal(spawns.length, 1)
    assert.equal(spawns[0].file, process.execPath)
    assert.deepEqual(spawns[0].args, ['dist/index.js'])
    assert.equal(spawns[0].options.cwd, botDir)
    assert.equal(spawns[0].options.env?.DISCORD_TOKEN, 'discord-token')
    assert.equal(spawns[0].options.env?.DISCORD_CLIENT_ID, 'discord-client-id')
    assert.equal(spawns[0].options.env?.DISCORD_GUILD_ID, 'discord-guild-id')
    assert.equal(runtime.botUserTag, null)

    await runtime.stop()
    assert.equal(child.killed, true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('ProcessDiscordBotGateway reports early process exits as startup errors', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-process-bot-'))
  const botDir = createProcessBotDir(directory)
  const child = new FakeChildProcess()
  const gateway = createProcessDiscordBotGateway({
    botDir,
    startupTimeoutMs: 100,
    spawnProcess() {
      return child as unknown as ChildProcess
    },
  })

  try {
    const started = gateway.start(baseSettings)
    child.emit('exit', 1, null)

    await assert.rejects(started, /exited before startup/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('ProcessDiscordBotGateway rejects a missing bot directory before spawning', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-missing-process-bot-'))
  const missingBotDir = path.join(directory, 'missing-bot')
  let spawnCalled = false
  const gateway = createProcessDiscordBotGateway({
    botDir: missingBotDir,
    startupTimeoutMs: 1,
    spawnProcess() {
      spawnCalled = true
      return new FakeChildProcess() as unknown as ChildProcess
    },
  })

  try {
    await assert.rejects(gateway.start(baseSettings), /Discord bot directory does not exist/)
    assert.equal(spawnCalled, false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('ProcessDiscordBotGateway deploys commands before starting when requested', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-process-bot-'))
  const botDir = createProcessBotDir(directory, { deployCommands: true })
  const spawns: Array<{ args: string[] }> = []
  const gateway = createProcessDiscordBotGateway({
    botDir,
    startupTimeoutMs: 1,
    spawnProcess(_file, args) {
      spawns.push({ args })
      const child = new FakeChildProcess()

      if (args[0] === 'dist/deploy-commands.js') {
        queueMicrotask(() => child.emit('exit', 0, null))
      }

      return child as unknown as ChildProcess
    },
  })

  try {
    await gateway.start({
      ...baseSettings,
      registerCommands: true,
    })

    assert.deepEqual(
      spawns.map((spawned) => spawned.args),
      [['dist/deploy-commands.js'], ['dist/index.js']],
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('ProcessDiscordBotGateway supports absolute bundled entrypoints with a separate working directory', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-process-bot-'))
  const workingDir = path.join(directory, 'bot-data')
  const runtimeDir = path.join(directory, 'runtime')
  const runtimeDistDir = path.join(runtimeDir, 'dist')
  const spawns: Array<{ args: string[]; options: SpawnOptions }> = []

  mkdirSync(workingDir, { recursive: true })
  mkdirSync(runtimeDistDir, { recursive: true })
  writeFileSync(path.join(runtimeDistDir, 'index.js'), '')
  writeFileSync(path.join(runtimeDistDir, 'deploy-commands.js'), '')

  const gateway = createProcessDiscordBotGateway({
    botDir: workingDir,
    entrypoint: path.join(runtimeDistDir, 'index.js'),
    commandDeployEntrypoint: path.join(runtimeDistDir, 'deploy-commands.js'),
    startupTimeoutMs: 1,
    spawnProcess(_file, args, options) {
      spawns.push({ args, options })
      const child = new FakeChildProcess()

      if (args[0] === path.join(runtimeDistDir, 'deploy-commands.js')) {
        queueMicrotask(() => child.emit('exit', 0, null))
      }

      return child as unknown as ChildProcess
    },
  })

  try {
    await gateway.start({
      ...baseSettings,
      registerCommands: true,
    })

    assert.deepEqual(
      spawns.map((spawned) => spawned.args),
      [[path.join(runtimeDistDir, 'deploy-commands.js')], [path.join(runtimeDistDir, 'index.js')]],
    )
    assert.deepEqual(
      spawns.map((spawned) => spawned.options.cwd),
      [workingDir, workingDir],
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
