import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type SecretOptions = {
  secret: string | undefined
  nodeEnv: 'development' | 'test' | 'production'
  generatedSecretFilePath?: string
}

const encryptedPrefix = 'aes-256-gcm:'
const localPrefix = 'local:'

function deriveKey(secret: string) {
  return createHash('sha256').update(secret).digest()
}

function readExistingGeneratedSecret(secretFilePath: string) {
  try {
    const secret = readFileSync(secretFilePath, 'utf8').trim()

    return secret || null
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

function readOrCreateGeneratedSecret(secretFilePath: string) {
  const existingSecret = readExistingGeneratedSecret(secretFilePath)

  if (existingSecret) {
    return existingSecret
  }

  mkdirSync(path.dirname(secretFilePath), { recursive: true })

  const generatedSecret = randomBytes(32).toString('base64url')

  try {
    writeFileSync(secretFilePath, `${generatedSecret}\n`, {
      flag: 'wx',
      mode: 0o600,
    })

    return generatedSecret
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      const secret = readExistingGeneratedSecret(secretFilePath)

      if (secret) {
        return secret
      }
    }

    throw error
  }
}

export function resolveDiscordBotSettingsSecret(options: SecretOptions) {
  const configuredSecret = options.secret?.trim()

  if (configuredSecret) {
    return configuredSecret
  }

  if (options.nodeEnv !== 'production') {
    return undefined
  }

  const generatedSecretFilePath = options.generatedSecretFilePath?.trim()

  if (!generatedSecretFilePath) {
    return undefined
  }

  return readOrCreateGeneratedSecret(generatedSecretFilePath)
}

export function isDiscordBotTokenStorageReady(options: SecretOptions) {
  try {
    return options.nodeEnv !== 'production' || Boolean(resolveDiscordBotSettingsSecret(options))
  } catch {
    return false
  }
}

export function encryptDiscordBotToken(token: string, options: SecretOptions) {
  const trimmedToken = token.trim()

  if (!trimmedToken) {
    throw new Error('Discord bot token is required.')
  }

  const secret = resolveDiscordBotSettingsSecret(options)

  if (!secret) {
    if (options.nodeEnv === 'production') {
      throw new Error('DISCORD_BOT_SETTINGS_SECRET is required to store bot tokens in production.')
    }

    return `${localPrefix}${Buffer.from(trimmedToken, 'utf8').toString('base64url')}`
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(trimmedToken, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${encryptedPrefix}${[
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')}`
}

export function decryptDiscordBotToken(value: string | null, options: SecretOptions) {
  if (!value) {
    return null
  }

  if (value.startsWith(localPrefix)) {
    if (options.nodeEnv === 'production') {
      throw new Error('Local Discord bot token storage cannot be used in production.')
    }

    return Buffer.from(value.slice(localPrefix.length), 'base64url').toString('utf8')
  }

  if (!value.startsWith(encryptedPrefix)) {
    throw new Error('Discord bot token is stored in an unknown format.')
  }

  const secret = resolveDiscordBotSettingsSecret(options)

  if (!secret) {
    throw new Error('DISCORD_BOT_SETTINGS_SECRET is required to read encrypted bot tokens.')
  }

  const [ivText, authTagText, ciphertextText] = value.slice(encryptedPrefix.length).split(':')

  if (!ivText || !authTagText || !ciphertextText) {
    throw new Error('Discord bot token is malformed.')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(ivText, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(authTagText, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskDiscordBotToken(token: string | null) {
  if (!token) {
    return null
  }

  if (token.length < 8) {
    return '등록됨'
  }

  return `...${token.slice(-4)}`
}
