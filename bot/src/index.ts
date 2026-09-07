import '../../server/src/load-env.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
} from 'discord.js'
import {
  createDiscordAdminGuard,
  closeAnnouncement,
  loadAnnouncements,
  loadAdminSummary,
  loadAuditLogs,
  loadHealthStatus,
  loadBotActorUserId,
  loadRecentSessions,
  loadSupportTicketDetail,
  loadSupportTickets,
  normalizeDiscordRoleIds,
  parseAnnouncementId,
  parseTicketId,
  publishAnnouncement,
  resolveSupportTicket,
  resolveTicketWithDefaultReply,
  searchUsers,
  updateAnnouncementFromOverview,
} from './admin-service.js'
import { commandNames, commands, optionNames } from './commands.js'
import { loadDiscordBotConfig } from './config.js'
import {
  formatAnnouncements,
  formatAdminSummary,
  formatAuditLogs,
  formatHealthStatus,
  formatNewSupportTicketNotification,
  formatRecentSessions,
  formatSupportTicketDetail,
  formatSupportTickets,
  formatUserSearchResults,
} from './messages.js'
import {
  createHealthStatusTracker,
  createSupportTicketTracker,
} from './notifier.js'
import {
  allowedNotificationMentions,
  formatNotificationSettings,
  getNotificationChannel,
  getNotificationSettings,
  notificationKindLabel,
  setNotificationChannel,
  type NotificationKind,
  withMention,
} from './notification-settings.js'
import type { SupportTicketAdminUpdatePayload } from '../../server/src/contracts.js'

function interactionRoleIds(interaction: ChatInputCommandInteraction) {
  return normalizeDiscordRoleIds(interaction.member?.roles)
}

function buttonRoleIds(interaction: ButtonInteraction) {
  return normalizeDiscordRoleIds(interaction.member?.roles)
}

function ticketActionRows(ticketId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:reviewing:${ticketId}`)
        .setLabel('검토중')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket:resolved:${ticketId}`)
        .setLabel('해결됨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ticket:closed:${ticketId}`)
        .setLabel('닫힘')
        .setStyle(ButtonStyle.Danger),
    ),
  ]
}

function clampCount(value: number | null, defaultValue: number) {
  if (!value) {
    return defaultValue
  }

  return Math.min(Math.max(value, 1), 10)
}

async function registerCommands(config: ReturnType<typeof loadDiscordBotConfig>) {
  if (!config.registerCommands) {
    return
  }

  const rest = new REST({ version: '10' }).setToken(config.token)

  if (config.guildIds.size > 0) {
    for (const guildId of config.guildIds) {
      try {
        await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), {
          body: commands,
        })
      } catch (error) {
        console.error(`[discord-admin-bot.commands] Failed to register guild commands for ${guildId}`, error)
      }
    }
    return
  }

  await rest.put(Routes.applicationCommands(config.clientId), {
    body: commands,
  })
}

function createGuard(config: ReturnType<typeof loadDiscordBotConfig>) {
  return createDiscordAdminGuard({
    guildIds: config.guildIds,
    channelId: config.adminChannelId,
    roleIds: config.adminRoleIds,
  })
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  config: ReturnType<typeof loadDiscordBotConfig>,
) {
  const guard = createGuard(config)
  const guardResult = guard({
    guildId: interaction.guildId ?? undefined,
    channelId: interaction.channelId,
    roleIds: interactionRoleIds(interaction),
  })

  if (!guardResult.ok) {
    await interaction.reply({ content: guardResult.message, ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  if (interaction.commandName === commandNames.status) {
    await interaction.editReply({ content: formatHealthStatus(await loadHealthStatus()) })
    return
  }

  if (interaction.commandName === commandNames.summary) {
    await interaction.editReply({ content: formatAdminSummary(await loadAdminSummary()) })
    return
  }

  if (interaction.commandName === commandNames.tickets) {
    const status = interaction.options.getString(optionNames.status) as SupportTicketAdminUpdatePayload['status'] | null
    await interaction.editReply({
      content: formatSupportTickets(await loadSupportTickets(status ?? undefined)),
    })
    return
  }

  if (interaction.commandName === commandNames.ticketDetail) {
    const ticketId = parseTicketId(interaction.options.getString(optionNames.ticketId) ?? undefined)
    const ticket = await loadSupportTicketDetail(ticketId)

    await interaction.editReply({
      content: formatSupportTicketDetail(ticket),
      components: ticketActionRows(ticket.id),
    })
    return
  }

  if (interaction.commandName === commandNames.ticketUpdate) {
    const actorUserId = await loadBotActorUserId(config.actorUserId)
    const ticketId = parseTicketId(interaction.options.getString(optionNames.ticketId) ?? undefined)
    const status = interaction.options.getString(optionNames.status, true) as SupportTicketAdminUpdatePayload['status']
    const adminReply = interaction.options.getString(optionNames.reply) ?? ''
    const ticket = await resolveSupportTicket(actorUserId, ticketId, { status, adminReply })

    await interaction.editReply({
      content: `문의 #${ticket.id} 상태를 ${ticket.status}로 변경했습니다.`,
    })
    return
  }

  if (interaction.commandName === commandNames.userSearch) {
    const users = await searchUsers({
      email: interaction.options.getString(optionNames.email),
      name: interaction.options.getString(optionNames.name),
    })

    await interaction.editReply({ content: formatUserSearchResults(users) })
    return
  }

  if (interaction.commandName === commandNames.recentSessions) {
    const count = clampCount(interaction.options.getInteger(optionNames.count), 10)
    await interaction.editReply({ content: formatRecentSessions(await loadRecentSessions(count)) })
    return
  }

  if (interaction.commandName === commandNames.auditLogs) {
    const count = clampCount(interaction.options.getInteger(optionNames.count), 10)
    await interaction.editReply({ content: formatAuditLogs(await loadAuditLogs(count)) })
    return
  }

  if (interaction.commandName === commandNames.notificationChannelSet) {
    const kind = interaction.options.getString(optionNames.notificationKind, true) as NotificationKind
    const role = interaction.options.getRole(optionNames.mentionRole)
    await setNotificationChannel(kind, {
      channelId: interaction.channelId,
      mentionRoleId: role?.id ?? null,
    })

    const mention = role ? `, 멘션: <@&${role.id}>` : ''
    await interaction.editReply({
      content: `${notificationKindLabel(kind)} 알림 채널을 <#${interaction.channelId}>로 설정했습니다${mention}.`,
    })
    return
  }

  if (interaction.commandName === commandNames.notificationChannelList) {
    await interaction.editReply({ content: formatNotificationSettings(await getNotificationSettings()) })
    return
  }

  if (interaction.commandName === commandNames.announcementCreate) {
    const actorUserId = await loadBotActorUserId(config.actorUserId)
    const announcement = await publishAnnouncement(actorUserId, {
      title: interaction.options.getString(optionNames.title, true),
      body: interaction.options.getString(optionNames.body, true),
      tone: (interaction.options.getString(optionNames.tone) ?? 'info') as 'info' | 'good' | 'warn' | 'danger',
      isActive: true,
      isPinned: interaction.options.getBoolean(optionNames.pinned) ?? false,
      startsAt: null,
      endsAt: null,
    })

    await interaction.editReply({
      content: `공지 #${announcement.id}를 등록했습니다: ${announcement.title}`,
    })
    return
  }

  if (interaction.commandName === commandNames.announcementList) {
    await interaction.editReply({ content: formatAnnouncements(await loadAnnouncements()) })
    return
  }

  if (interaction.commandName === commandNames.announcementUpdate) {
    const actorUserId = await loadBotActorUserId(config.actorUserId)
    const announcementId = parseAnnouncementId(interaction.options.getString(optionNames.announcementId) ?? undefined)
    const announcement = await updateAnnouncementFromOverview(actorUserId, announcementId, {
      title: interaction.options.getString(optionNames.title) ?? undefined,
      body: interaction.options.getString(optionNames.body) ?? undefined,
      tone: (interaction.options.getString(optionNames.tone) ?? undefined) as
        | 'info'
        | 'good'
        | 'warn'
        | 'danger'
        | undefined,
      isPinned: interaction.options.getBoolean(optionNames.pinned) ?? undefined,
      isActive: interaction.options.getBoolean(optionNames.active) ?? undefined,
    })

    await interaction.editReply({ content: `공지 #${announcement.id}를 수정했습니다: ${announcement.title}` })
    return
  }

  if (interaction.commandName === commandNames.announcementEnd) {
    const actorUserId = await loadBotActorUserId(config.actorUserId)
    const announcementId = parseAnnouncementId(interaction.options.getString(optionNames.announcementId) ?? undefined)
    const announcement = await closeAnnouncement(actorUserId, announcementId)

    await interaction.editReply({ content: `공지 #${announcement.id}를 종료했습니다: ${announcement.title}` })
  }
}

async function handleButton(interaction: ButtonInteraction, config: ReturnType<typeof loadDiscordBotConfig>) {
  const guard = createGuard(config)
  const guardResult = guard({
    guildId: interaction.guildId ?? undefined,
    channelId: interaction.channelId,
    roleIds: buttonRoleIds(interaction),
  })

  if (!guardResult.ok) {
    await interaction.reply({ content: guardResult.message, ephemeral: true })
    return
  }

  const [kind, status, ticketIdText] = interaction.customId.split(':')

  if (kind !== 'ticket') {
    await interaction.reply({ content: '알 수 없는 버튼입니다.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const actorUserId = await loadBotActorUserId(config.actorUserId)
  const ticketId = parseTicketId(ticketIdText)
  const ticket = await loadSupportTicketDetail(ticketId)
  const updated = await resolveSupportTicket(
    actorUserId,
    ticketId,
    resolveTicketWithDefaultReply(ticket, status as SupportTicketAdminUpdatePayload['status']),
  )

  await interaction.editReply({ content: `문의 #${updated.id} 상태를 ${updated.status}로 변경했습니다.` })
}

async function sendAdminChannelMessage(
  client: Client,
  config: ReturnType<typeof loadDiscordBotConfig>,
  payload: { content: string; components?: ActionRowBuilder<ButtonBuilder>[]; kind?: NotificationKind },
) {
  const setting = payload.kind ? await getNotificationChannel(payload.kind) : null
  const channelId = setting?.channelId ?? config.adminChannelId

  if (!channelId) {
    return
  }

  const channel = await client.channels.fetch(channelId)

  if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
    return
  }

  await channel.send({
    content: withMention(payload.content, setting),
    components: payload.components,
    allowedMentions: allowedNotificationMentions(setting),
  })
}

function startBackgroundTasks(client: Client, config: ReturnType<typeof loadDiscordBotConfig>) {
  const supportTracker = createSupportTicketTracker()
  const healthTracker = createHealthStatusTracker()
  let lastDailySummaryDate: string | null = null

  setInterval(() => {
    loadSupportTickets()
      .then((tickets) => supportTracker.next(tickets))
      .then((tickets) =>
        Promise.all(
          tickets.map((ticket) =>
            sendAdminChannelMessage(client, config, {
              content: formatNewSupportTicketNotification(ticket, config.adminUrl),
              components: ticketActionRows(ticket.id),
              kind: 'support',
            }),
          ),
        ),
      )
      .catch((error: unknown) => console.error('[discord-admin-bot.support-poll]', error))
  }, config.supportPollMs)

  setInterval(() => {
    loadHealthStatus()
      .then((status) => healthTracker.next(status))
      .then((message) => {
        if (!message) {
          return undefined
        }

        return sendAdminChannelMessage(client, config, { content: message, kind: 'health' })
      })
      .catch((error: unknown) => console.error('[discord-admin-bot.health-poll]', error))
  }, config.healthPollMs)

  setInterval(() => {
    const now = new Date()
    const dateKey = now.toISOString().slice(0, 10)

    if (now.getHours() !== config.dailySummaryHour || lastDailySummaryDate === dateKey) {
      return
    }

    lastDailySummaryDate = dateKey
    loadAdminSummary()
      .then((overview) =>
        sendAdminChannelMessage(client, config, { content: formatAdminSummary(overview), kind: 'daily' }),
      )
      .catch((error: unknown) => console.error('[discord-admin-bot.daily-summary]', error))
  }, 60_000)
}

async function boot() {
  const config = loadDiscordBotConfig()
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

  client.once('clientReady', (readyClient) => {
    console.log(`FocusAI Discord admin bot logged in as ${readyClient.user.tag}`)
    startBackgroundTasks(client, config)
  })

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) {
      return
    }

    try {
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction, config)
        return
      }

      await handleButton(interaction, config)
    } catch (error) {
      console.error('[discord-admin-bot]', error)

      const content = error instanceof Error ? error.message : 'FocusAI bot command failed.'

      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content })
        return
      }

      if (interaction.replied) {
        await interaction.followUp({ content, ephemeral: true })
        return
      }

      await interaction.reply({ content, ephemeral: true })
    }
  })

  await registerCommands(config)
  await client.login(config.token)
}

boot().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
