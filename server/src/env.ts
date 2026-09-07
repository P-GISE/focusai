import { z } from 'zod'

type NodeEnv = 'development' | 'test' | 'production'

type RuntimeEnvInput = {
  NODE_ENV: NodeEnv
  CLIENT_ORIGIN: string
  APP_BASE_URL: string
  AUTO_MIGRATE_SCHEMA?: string
  ALLOW_ROOT_DB_IN_PRODUCTION?: string
  FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART?: string
  SMTP_SECURE?: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_DAILY_BUDGET_USD?: number
  ANTHROPIC_INPUT_USD_PER_MILLION?: number
  ANTHROPIC_OUTPUT_USD_PER_MILLION?: number
  ANTHROPIC_CACHE_WRITE_USD_PER_MILLION?: number
  ANTHROPIC_CACHE_READ_USD_PER_MILLION?: number
  SMTP_HOST?: string
  SMTP_FROM?: string
  SMTP_USER?: string
  SMTP_PASSWORD?: string
}

export function parseBooleanFlag(value: string | undefined, name = 'boolean flag') {
  const normalized = value?.trim().toLowerCase()

  if (!normalized) {
    return false
  }

  if (normalized === 'true') {
    return true
  }

  if (normalized === 'false') {
    return false
  }

  throw new Error(`${name} must be either "true" or "false".`)
}

export function parseOriginList(value: string, name = 'CLIENT_ORIGIN') {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin === '*') {
        throw new Error(`${name} must not contain wildcard origins.`)
      }

      try {
        const parsed = new URL(origin)

        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid protocol')
        }

        return parsed.origin
      } catch {
        throw new Error(`${name} contains an invalid URL origin: ${origin}`)
      }
    })

  if (!origins.length) {
    throw new Error(`${name} must contain at least one URL origin.`)
  }

  return Array.from(new Set(origins))
}

export const CAPACITOR_CLIENT_ORIGIN = 'https://localhost'

export function appendCapacitorClientOrigin(origins: string[]) {
  return Array.from(new Set([...origins, CAPACITOR_CLIENT_ORIGIN]))
}

export function assertProductionUrl(name: string, value: string, nodeEnv: NodeEnv) {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production.`)
  }
}

function assertPositiveNumber(name: string, value: number | undefined) {
  if ((value ?? 0) <= 0) {
    throw new Error(`${name} must be greater than 0 in production.`)
  }
}

function assertNonNegativeNumber(name: string, value: number | undefined) {
  if ((value ?? 0) < 0) {
    throw new Error(`${name} must be 0 or greater in production.`)
  }
}

export function assertProductionRuntimeEnv(envInput: RuntimeEnvInput) {
  if (envInput.NODE_ENV !== 'production') {
    return
  }

  const anthropicConfigured =
    Boolean(envInput.ANTHROPIC_API_KEY?.trim()) ||
    (envInput.ANTHROPIC_DAILY_BUDGET_USD ?? 0) > 0

  if (anthropicConfigured) {
    assertPositiveNumber(
      'ANTHROPIC_INPUT_USD_PER_MILLION',
      envInput.ANTHROPIC_INPUT_USD_PER_MILLION,
    )
    assertPositiveNumber(
      'ANTHROPIC_OUTPUT_USD_PER_MILLION',
      envInput.ANTHROPIC_OUTPUT_USD_PER_MILLION,
    )
    assertNonNegativeNumber(
      'ANTHROPIC_CACHE_WRITE_USD_PER_MILLION',
      envInput.ANTHROPIC_CACHE_WRITE_USD_PER_MILLION,
    )
    assertNonNegativeNumber(
      'ANTHROPIC_CACHE_READ_USD_PER_MILLION',
      envInput.ANTHROPIC_CACHE_READ_USD_PER_MILLION,
    )
  }

  const smtpHost = envInput.SMTP_HOST?.trim()
  const smtpFrom = envInput.SMTP_FROM?.trim()
  const smtpUser = envInput.SMTP_USER?.trim()
  const smtpPassword = envInput.SMTP_PASSWORD?.trim()

  if (smtpHost || smtpFrom || smtpUser || smtpPassword) {
    if (!smtpHost) {
      throw new Error('SMTP_HOST is required when SMTP is configured in production.')
    }

    if (!smtpFrom) {
      throw new Error('SMTP_FROM is required when SMTP is configured in production.')
    }
  }

  if (smtpUser && !smtpPassword) {
    throw new Error('SMTP_PASSWORD is required when SMTP_USER is configured in production.')
  }

  if (smtpPassword && !smtpUser) {
    throw new Error('SMTP_USER is required when SMTP_PASSWORD is configured in production.')
  }
}

export function assertRuntimeEnv(envInput: RuntimeEnvInput, origins = parseOriginList(envInput.CLIENT_ORIGIN)) {
  parseBooleanFlag(envInput.AUTO_MIGRATE_SCHEMA, 'AUTO_MIGRATE_SCHEMA')
  parseBooleanFlag(envInput.ALLOW_ROOT_DB_IN_PRODUCTION, 'ALLOW_ROOT_DB_IN_PRODUCTION')
  parseBooleanFlag(
    envInput.FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART,
    'FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART',
  )
  parseBooleanFlag(envInput.SMTP_SECURE, 'SMTP_SECURE')
  assertProductionUrl('APP_BASE_URL', envInput.APP_BASE_URL, envInput.NODE_ENV)

  for (const origin of origins) {
    assertProductionUrl('CLIENT_ORIGIN', origin, envInput.NODE_ENV)
  }

  assertProductionRuntimeEnv(envInput)
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8787),
  CLIENT_ORIGIN: z.string().default('http://127.0.0.1:5173'),
  APP_BASE_URL: z.string().default('http://127.0.0.1:8787'),
  MARIADB_HOST: z.string().optional(),
  MARIADB_PORT: z.coerce.number().default(3306),
  MARIADB_USER: z.string().optional(),
  MARIADB_PASSWORD: z.string().optional(),
  MARIADB_DATABASE: z.string().optional(),
  MARIADB_CONNECTION_LIMIT: z.coerce.number().default(10),
  AUTO_MIGRATE_SCHEMA: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default('focusai_session'),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  ADMIN_EMAILS: z.string().default(''),
  ALLOW_ROOT_DB_IN_PRODUCTION: z.string().optional(),
  FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART: z.string().optional(),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(10 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
  ACCOUNT_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(10 * 60 * 1000),
  ACCOUNT_RATE_LIMIT_MAX: z.coerce.number().default(10),
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  AI_RATE_LIMIT_MAX: z.coerce.number().default(20),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_VERSION: z.string().default('2023-06-01'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(900),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().default(20_000),
  ANTHROPIC_DAILY_REQUEST_LIMIT: z.coerce.number().default(0),
  ANTHROPIC_DAILY_BUDGET_USD: z.coerce.number().default(0),
  ANTHROPIC_INPUT_USD_PER_MILLION: z.coerce.number().default(0),
  ANTHROPIC_OUTPUT_USD_PER_MILLION: z.coerce.number().default(0),
  ANTHROPIC_CACHE_WRITE_USD_PER_MILLION: z.coerce.number().default(0),
  ANTHROPIC_CACHE_READ_USD_PER_MILLION: z.coerce.number().default(0),
  ADMIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  ADMIN_RATE_LIMIT_MAX: z.coerce.number().default(60),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(30),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
})

export const env = envSchema.parse(process.env)
export const clientOrigins = appendCapacitorClientOrigin(parseOriginList(env.CLIENT_ORIGIN))

assertRuntimeEnv(env, clientOrigins)

export const adminEmailAllowlist = new Set(
  env.ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

export const runtimeFlags = {
  mariaEnabled: Boolean(env.MARIADB_HOST && env.MARIADB_USER && env.MARIADB_DATABASE),
  autoMigrateSchema:
    env.AUTO_MIGRATE_SCHEMA === undefined
      ? env.NODE_ENV !== 'production'
      : parseBooleanFlag(env.AUTO_MIGRATE_SCHEMA, 'AUTO_MIGRATE_SCHEMA'),
  anthropicEnabled: Boolean(env.ANTHROPIC_API_KEY?.trim()),
  allowRootDbInProduction: parseBooleanFlag(
    env.ALLOW_ROOT_DB_IN_PRODUCTION,
    'ALLOW_ROOT_DB_IN_PRODUCTION',
  ),
  discordBotAutostartDisabled: parseBooleanFlag(
    env.FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART,
    'FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART',
  ),
  smtpEnabled: Boolean(env.SMTP_HOST && env.SMTP_FROM),
  smtpSecure: parseBooleanFlag(env.SMTP_SECURE, 'SMTP_SECURE'),
}
