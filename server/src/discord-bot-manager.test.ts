import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDiscordBotManager,
  type DiscordBotGateway,
  type DiscordBotRuntimeSettings,
} from './discord-bot-manager.js'

const baseSettings: DiscordBotRuntimeSettings = {
  enabled: true,
  token: 'token',
  clientId: 'client-id',
  guildIds: ['guild-id'],
  adminChannelId: 'channel-id',
  adminRoleIds: ['role-id'],
  botActorUserId: null,
  registerCommands: true,
  adminUrl: null,
  supportPollMs: 30_000,
  healthPollMs: 60_000,
  dailySummaryHour: 9,
}

test('DiscordBotManager starts and stops through the gateway', async () => {
  let started = 0
  let stopped = 0
  const gateway: DiscordBotGateway = {
    async start(settings) {
      started += 1
      assert.equal(settings.clientId, 'client-id')
      return {
        botUserTag: 'FocusAI#0001',
        async stop() {
          stopped += 1
        },
      }
    },
  }

  const manager = createDiscordBotManager({ gateway })

  await manager.start(baseSettings)
  assert.equal(manager.getStatus().state, 'running')
  assert.equal(manager.getStatus().botUserTag, 'FocusAI#0001')

  await manager.stop()
  assert.equal(manager.getStatus().state, 'disabled')
  assert.equal(stopped, 1)
  assert.equal(started, 1)
})

test('DiscordBotManager records an error when required runtime settings are missing', async () => {
  const manager = createDiscordBotManager({
    gateway: {
      async start() {
        throw new Error('gateway should not be called')
      },
    },
  })

  await assert.rejects(
    () =>
      manager.start({
        ...baseSettings,
        token: null,
      }),
    /Bot token is required/,
  )

  const status = manager.getStatus()
  assert.equal(status.state, 'error')
  assert.match(status.lastError ?? '', /Bot token is required/)
})

test('DiscordBotManager stops the active runtime before rejecting invalid restart settings', async () => {
  let stopped = 0
  const manager = createDiscordBotManager({
    gateway: {
      async start() {
        return {
          botUserTag: 'FocusAI#0001',
          async stop() {
            stopped += 1
          },
        }
      },
    },
  })

  await manager.start(baseSettings)
  await assert.rejects(
    () =>
      manager.start({
        ...baseSettings,
        token: null,
      }),
    /Bot token is required/,
  )

  assert.equal(stopped, 1)
  assert.equal(manager.getStatus().state, 'error')
})
