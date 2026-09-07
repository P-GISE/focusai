import test from 'node:test'
import assert from 'node:assert/strict'
import { commands as standaloneCommands } from '../../bot/src/commands.js'
import { allowedNotificationMentions, focusaiDiscordCommands } from './discord-bot-gateway.js'

test('in-process FocusAI Discord gateway registers the full admin command set', () => {
  assert.deepEqual(
    focusaiDiscordCommands.map((command) => ({
      name: command.name,
      options: command.options?.map((option) => option.name) ?? [],
    })),
    standaloneCommands.map((command) => ({
      name: command.name,
      options: command.options?.map((option) => option.name) ?? [],
    })),
  )
})

test('in-process gateway suppresses user-controlled Discord mentions', () => {
  assert.deepEqual(allowedNotificationMentions({ channelId: 'channel-1', mentionRoleId: 'role-1' }), {
    parse: [],
    roles: ['role-1'],
  })
  assert.deepEqual(allowedNotificationMentions(null), {
    parse: [],
    roles: [],
  })
})
