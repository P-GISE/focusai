import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDiscordBotConfigFromEnv } from './config.js'

test('parses comma-separated Discord guild ids', () => {
  const config = loadDiscordBotConfigFromEnv({
    DISCORD_BOT_TOKEN: 'token',
    DISCORD_CLIENT_ID: 'client',
    DISCORD_GUILD_ID: '1501612599454994603, 791362292523466822',
  })

  assert.deepEqual(config.guildIds, new Set(['1501612599454994603', '791362292523466822']))
})

test('allows empty Discord guild id for global command registration', () => {
  const config = loadDiscordBotConfigFromEnv({
    DISCORD_BOT_TOKEN: 'token',
    DISCORD_CLIENT_ID: 'client',
    DISCORD_GUILD_ID: '',
  })

  assert.deepEqual(config.guildIds, new Set())
})
