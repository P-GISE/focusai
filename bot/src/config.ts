import { z } from 'zod'

const configSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_ADMIN_CHANNEL_ID: z.string().optional(),
  DISCORD_ADMIN_ROLE_IDS: z.string().default(''),
  DISCORD_BOT_ACTOR_USER_ID: z.string().optional(),
  DISCORD_REGISTER_COMMANDS: z.string().optional(),
  DISCORD_ADMIN_URL: z.string().optional(),
  DISCORD_SUPPORT_POLL_MS: z.coerce.number().default(30_000),
  DISCORD_HEALTH_POLL_MS: z.coerce.number().default(60_000),
  DISCORD_DAILY_SUMMARY_HOUR: z.coerce.number().min(0).max(23).default(9),
})

function parseCsvSet(value: string) {
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

export function loadDiscordBotConfigFromEnv(source: NodeJS.ProcessEnv) {
  const parsed = configSchema.parse(source)

  return {
    token: parsed.DISCORD_BOT_TOKEN,
    clientId: parsed.DISCORD_CLIENT_ID,
    guildIds: parseCsvSet(parsed.DISCORD_GUILD_ID ?? ''),
    adminChannelId: parsed.DISCORD_ADMIN_CHANNEL_ID,
    adminRoleIds: parseCsvSet(parsed.DISCORD_ADMIN_ROLE_IDS),
    actorUserId: parsed.DISCORD_BOT_ACTOR_USER_ID,
    registerCommands: parsed.DISCORD_REGISTER_COMMANDS !== 'false',
    adminUrl: parsed.DISCORD_ADMIN_URL,
    supportPollMs: parsed.DISCORD_SUPPORT_POLL_MS,
    healthPollMs: parsed.DISCORD_HEALTH_POLL_MS,
    dailySummaryHour: parsed.DISCORD_DAILY_SUMMARY_HOUR,
  }
}

export function loadDiscordBotConfig() {
  return loadDiscordBotConfigFromEnv(process.env)
}
