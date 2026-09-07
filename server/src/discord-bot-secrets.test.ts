import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  decryptDiscordBotToken,
  encryptDiscordBotToken,
  isDiscordBotTokenStorageReady,
  maskDiscordBotToken,
  resolveDiscordBotSettingsSecret,
} from './discord-bot-secrets.js'

test('encryptDiscordBotToken round trips with a secret', () => {
  const encrypted = encryptDiscordBotToken('bot-token-value', {
    secret: 'local-secret',
    nodeEnv: 'production',
  })

  assert.notEqual(encrypted, 'bot-token-value')
  assert.equal(
    decryptDiscordBotToken(encrypted, {
      secret: 'local-secret',
      nodeEnv: 'production',
    }),
    'bot-token-value',
  )
})

test('encryptDiscordBotToken rejects production token storage without a secret', () => {
  assert.throws(
    () =>
      encryptDiscordBotToken('bot-token-value', {
        secret: undefined,
        nodeEnv: 'production',
      }),
    /DISCORD_BOT_SETTINGS_SECRET/,
  )
})

test('isDiscordBotTokenStorageReady requires a production secret', () => {
  assert.equal(
    isDiscordBotTokenStorageReady({
      secret: undefined,
      nodeEnv: 'production',
    }),
    false,
  )
  assert.equal(
    isDiscordBotTokenStorageReady({
      secret: 'configured-secret',
      nodeEnv: 'production',
    }),
    true,
  )
  assert.equal(
    isDiscordBotTokenStorageReady({
      secret: undefined,
      nodeEnv: 'development',
    }),
    true,
  )
})

test('resolveDiscordBotSettingsSecret creates and reuses a production fallback secret', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-discord-secret-'))
  const secretFilePath = path.join(directory, 'discord-bot-settings-secret')

  try {
    const firstSecret = resolveDiscordBotSettingsSecret({
      secret: undefined,
      nodeEnv: 'production',
      generatedSecretFilePath: secretFilePath,
    })
    const secondSecret = resolveDiscordBotSettingsSecret({
      secret: undefined,
      nodeEnv: 'production',
      generatedSecretFilePath: secretFilePath,
    })

    assert.ok(firstSecret)
    assert.equal(firstSecret, secondSecret)
    assert.equal(readFileSync(secretFilePath, 'utf8').trim(), firstSecret)
    assert.equal(firstSecret.length > 20, true)
    assert.equal(
      isDiscordBotTokenStorageReady({
        secret: undefined,
        nodeEnv: 'production',
        generatedSecretFilePath: secretFilePath,
      }),
      true,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('encryptDiscordBotToken uses the production fallback secret file', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'focusai-discord-secret-'))
  const secretFilePath = path.join(directory, 'discord-bot-settings-secret')

  try {
    const options = {
      secret: undefined,
      nodeEnv: 'production' as const,
      generatedSecretFilePath: secretFilePath,
    }
    const encrypted = encryptDiscordBotToken('bot-token-value', options)

    assert.notEqual(encrypted, 'bot-token-value')
    assert.equal(decryptDiscordBotToken(encrypted, options), 'bot-token-value')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('maskDiscordBotToken only exposes a short suffix', () => {
  assert.equal(maskDiscordBotToken('abcdefghijklmnopqrstuvwxyz'), '...wxyz')
  assert.equal(maskDiscordBotToken('abc'), '등록됨')
  assert.equal(maskDiscordBotToken(null), null)
})
