export type DiscordBotRuntimeSettings = {
  enabled: boolean
  token: string | null
  clientId: string
  guildIds: string[]
  adminChannelId: string | null
  adminRoleIds: string[]
  botActorUserId: string | null
  registerCommands: boolean
  adminUrl: string | null
  supportPollMs: number
  healthPollMs: number
  dailySummaryHour: number
}

export type DiscordBotStatusState =
  | 'disabled'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export type DiscordBotStatus = {
  state: DiscordBotStatusState
  botUserTag: string | null
  lastStartedAt: string | null
  lastStoppedAt: string | null
  lastError: string | null
}

export type DiscordBotGatewayRuntime = {
  botUserTag: string | null
  stop(): Promise<void>
}

export type DiscordBotGateway = {
  start(settings: DiscordBotRuntimeSettings): Promise<DiscordBotGatewayRuntime>
}

export type DiscordBotManager = ReturnType<typeof createDiscordBotManager>

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function assertStartableSettings(settings: DiscordBotRuntimeSettings) {
  if (!settings.token?.trim()) {
    throw new Error('Bot token is required.')
  }

  if (!settings.clientId.trim()) {
    throw new Error('Discord application ID is required.')
  }
}

export function createDiscordBotManager(options: { gateway: DiscordBotGateway }) {
  let runtime: DiscordBotGatewayRuntime | null = null
  let status: DiscordBotStatus = {
    state: 'disabled',
    botUserTag: null,
    lastStartedAt: null,
    lastStoppedAt: null,
    lastError: null,
  }

  async function stopRuntime(nextState: DiscordBotStatusState) {
    if (!runtime) {
      status = {
        ...status,
        state: nextState,
        botUserTag: null,
        lastStoppedAt: new Date().toISOString(),
      }
      return
    }

    const activeRuntime = runtime
    runtime = null
    await activeRuntime.stop()
    status = {
      ...status,
      state: nextState,
      botUserTag: null,
      lastStoppedAt: new Date().toISOString(),
    }
  }

  return {
    getStatus() {
      return status
    },

    async start(settings: DiscordBotRuntimeSettings) {
      try {
        if (runtime) {
          await stopRuntime('starting')
        }

        assertStartableSettings(settings)

        status = {
          ...status,
          state: 'starting',
          lastError: null,
        }

        runtime = await options.gateway.start(settings)
        status = {
          state: 'running',
          botUserTag: runtime.botUserTag,
          lastStartedAt: new Date().toISOString(),
          lastStoppedAt: status.lastStoppedAt,
          lastError: null,
        }
      } catch (error) {
        status = {
          ...status,
          state: 'error',
          botUserTag: null,
          lastError: errorMessage(error),
        }
        throw error
      }
    },

    async stop() {
      status = {
        ...status,
        state: 'stopping',
      }

      await stopRuntime('disabled')
      status = {
        ...status,
        state: 'disabled',
        lastError: null,
      }
    },
  }
}
