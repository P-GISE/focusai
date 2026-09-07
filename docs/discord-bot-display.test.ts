import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDiscordBotDateTime } from '../src/lib/discordBotDisplay.ts'

test('formatDiscordBotDateTime shows a neutral placeholder for missing bot timestamps', () => {
  assert.equal(formatDiscordBotDateTime(null, () => '미동의'), '-')
  assert.equal(formatDiscordBotDateTime('', () => '미동의'), '-')
})

test('formatDiscordBotDateTime delegates present timestamps to the shared formatter', () => {
  assert.equal(formatDiscordBotDateTime('2026-05-13T12:00:00.000Z', () => '2026. 5. 13.'), '2026. 5. 13.')
})
