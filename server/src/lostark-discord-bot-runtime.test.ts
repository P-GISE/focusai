import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { seedBundledLostarkDiscordBotData } from './lostark-discord-bot-runtime.js'

test('seedBundledLostarkDiscordBotData copies bundled json files into an empty working directory', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-lostark-runtime-'))
  const bundledBotDir = path.join(directory, 'bundled')
  const workingBotDir = path.join(directory, 'working')
  const bundledDataDir = path.join(bundledBotDir, 'data')

  try {
    mkdirSync(bundledDataDir, { recursive: true })
    writeFileSync(path.join(bundledDataDir, 'merchant-alerts.json'), '{"guilds":{"1":{}}}')
    writeFileSync(path.join(bundledDataDir, 'notes.txt'), 'ignored')

    seedBundledLostarkDiscordBotData({ bundledBotDir, workingBotDir })

    assert.equal(
      readFileSync(path.join(workingBotDir, 'data', 'merchant-alerts.json'), 'utf8'),
      '{"guilds":{"1":{}}}',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('seedBundledLostarkDiscordBotData preserves existing working values', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-lostark-runtime-'))
  const bundledBotDir = path.join(directory, 'bundled')
  const workingBotDir = path.join(directory, 'working')
  const bundledDataDir = path.join(bundledBotDir, 'data')
  const workingDataDir = path.join(workingBotDir, 'data')

  try {
    mkdirSync(bundledDataDir, { recursive: true })
    mkdirSync(workingDataDir, { recursive: true })
    writeFileSync(path.join(bundledDataDir, 'merchant-alerts.json'), '{"guilds":{"bundled":{}}}')
    writeFileSync(path.join(workingDataDir, 'merchant-alerts.json'), '{"guilds":{"working":{}}}')

    seedBundledLostarkDiscordBotData({ bundledBotDir, workingBotDir })

    assert.deepEqual(JSON.parse(readFileSync(path.join(workingDataDir, 'merchant-alerts.json'), 'utf8')), {
      guilds: {
        bundled: {},
        working: {},
      },
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('seedBundledLostarkDiscordBotData merges bundled defaults into existing empty stores', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-lostark-runtime-'))
  const bundledBotDir = path.join(directory, 'bundled')
  const workingBotDir = path.join(directory, 'working')
  const bundledDataDir = path.join(bundledBotDir, 'data')
  const workingDataDir = path.join(workingBotDir, 'data')

  try {
    mkdirSync(bundledDataDir, { recursive: true })
    mkdirSync(workingDataDir, { recursive: true })
    writeFileSync(
      path.join(bundledDataDir, 'homework-reminders.json'),
      JSON.stringify({
        guilds: {
          '791362292523466822': {
            channelId: '1501882727039762562',
            rosterChannelId: '1496171895203299541',
          },
        },
      }),
    )
    writeFileSync(path.join(workingDataDir, 'homework-reminders.json'), '{"guilds":{}}')

    seedBundledLostarkDiscordBotData({ bundledBotDir, workingBotDir })

    assert.deepEqual(
      JSON.parse(readFileSync(path.join(workingDataDir, 'homework-reminders.json'), 'utf8')),
      {
        guilds: {
          '791362292523466822': {
            channelId: '1501882727039762562',
            rosterChannelId: '1496171895203299541',
          },
        },
      },
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('seedBundledLostarkDiscordBotData preserves existing guild configuration while filling missing defaults', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-lostark-runtime-'))
  const bundledBotDir = path.join(directory, 'bundled')
  const workingBotDir = path.join(directory, 'working')
  const bundledDataDir = path.join(bundledBotDir, 'data')
  const workingDataDir = path.join(workingBotDir, 'data')

  try {
    mkdirSync(bundledDataDir, { recursive: true })
    mkdirSync(workingDataDir, { recursive: true })
    writeFileSync(
      path.join(bundledDataDir, 'merchant-alerts.json'),
      JSON.stringify({
        guilds: {
          configured: {
            channelId: 'bundled-channel',
            roleId: 'bundled-role',
          },
          missing: {
            channelId: 'missing-channel',
          },
        },
      }),
    )
    writeFileSync(
      path.join(workingDataDir, 'merchant-alerts.json'),
      JSON.stringify({
        guilds: {
          configured: {
            channelId: 'working-channel',
          },
        },
      }),
    )

    seedBundledLostarkDiscordBotData({ bundledBotDir, workingBotDir })

    assert.deepEqual(
      JSON.parse(readFileSync(path.join(workingDataDir, 'merchant-alerts.json'), 'utf8')),
      {
        guilds: {
          configured: {
            channelId: 'working-channel',
            roleId: 'bundled-role',
          },
          missing: {
            channelId: 'missing-channel',
          },
        },
      },
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
