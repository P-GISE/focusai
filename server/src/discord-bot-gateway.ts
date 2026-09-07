import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type APIApplicationCommandOptionChoice,
  type ButtonInteraction,
} from 'discord.js'
import { runtimeFlags } from './env.js'
import { pingMaria } from './mariadb.js'
import {
  createAnnouncement,
  getAdminOverview,
  updateAnnouncement,
  updateSupportTicket,
} from './store.js'
import type {
  AdminAuditLogPayload,
  AdminOverviewPayload,
  AdminSessionRecordPayload,
  AdminUserRecordPayload,
  AnnouncementPayload,
  AnnouncementUpsertPayload,
  SupportTicketAdminUpdatePayload,
  SupportTicketPayload,
} from './contracts.js'
import type { DiscordBotGateway, DiscordBotRuntimeSettings } from './discord-bot-manager.js'

type NotificationKind = 'support' | 'health' | 'daily'

type NotificationChannelSetting = {
  channelId: string
  mentionRoleId: string | null
}

type NotificationSettings = Partial<Record<NotificationKind, NotificationChannelSetting>>

export const focusaiDiscordCommandNames = {
  status: '포커스상태',
  summary: '포커스요약',
  tickets: '문의목록',
  ticketDetail: '문의상세',
  ticketUpdate: '문의처리',
  userSearch: '사용자조회',
  recentSessions: '최근세션',
  auditLogs: '감사로그',
  notificationChannelSet: '알림채널설정',
  notificationChannelList: '알림채널목록',
  announcementCreate: '공지등록',
  announcementList: '공지목록',
  announcementUpdate: '공지수정',
  announcementEnd: '공지종료',
} as const

const optionNames = {
  ticketId: '문의id',
  announcementId: '공지id',
  status: '상태',
  reply: '답변',
  email: '이메일',
  name: '이름',
  count: '개수',
  notificationKind: '종류',
  mentionRole: '멘션역할',
  title: '제목',
  body: '내용',
  tone: '공지유형',
  pinned: '고정',
  active: '활성',
} as const

const ticketStatusChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: '열림', value: 'open' },
  { name: '검토중', value: 'reviewing' },
  { name: '해결됨', value: 'resolved' },
  { name: '닫힘', value: 'closed' },
]

const toneChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: '정보', value: 'info' },
  { name: '좋음', value: 'good' },
  { name: '주의', value: 'warn' },
  { name: '위험', value: 'danger' },
]

const notificationKindChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: '문의', value: 'support' },
  { name: '상태', value: 'health' },
  { name: '일일요약', value: 'daily' },
]

export const focusaiDiscordCommands = [
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.status)
    .setDescription('FocusAI 서비스 상태를 확인합니다.'),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.summary)
    .setDescription('FocusAI 관리자 운영 요약을 확인합니다.'),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.tickets)
    .setDescription('최근 문의 목록을 확인합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.status)
        .setDescription('문의 상태로 필터링합니다.')
        .setRequired(false)
        .addChoices(...ticketStatusChoices),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.ticketDetail)
    .setDescription('문의 상세 내용을 확인합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.ticketId)
        .setDescription('문의 ID입니다.')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.ticketUpdate)
    .setDescription('문의 상태와 관리자 답변을 수정합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.ticketId)
        .setDescription('문의 ID입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.status)
        .setDescription('새 문의 상태입니다.')
        .setRequired(true)
        .addChoices(...ticketStatusChoices),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.reply)
        .setDescription('문의에 저장할 관리자 답변입니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.userSearch)
    .setDescription('사용자를 이름이나 이메일로 조회합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.email)
        .setDescription('조회할 사용자 이메일입니다.')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.name)
        .setDescription('조회할 사용자 이름입니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.recentSessions)
    .setDescription('최근 학습 세션을 확인합니다.')
    .addIntegerOption((option) =>
      option
        .setName(optionNames.count)
        .setDescription('조회할 세션 개수입니다.')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.auditLogs)
    .setDescription('최근 관리자 감사 로그를 확인합니다.')
    .addIntegerOption((option) =>
      option
        .setName(optionNames.count)
        .setDescription('조회할 로그 개수입니다.')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.notificationChannelSet)
    .setDescription('현재 채널을 알림 채널로 지정합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.notificationKind)
        .setDescription('설정할 알림 종류입니다.')
        .setRequired(true)
        .addChoices(...notificationKindChoices),
    )
    .addRoleOption((option) =>
      option
        .setName(optionNames.mentionRole)
        .setDescription('알림 때 멘션할 관리자 역할입니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.notificationChannelList)
    .setDescription('설정된 알림 채널을 확인합니다.'),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.announcementCreate)
    .setDescription('FocusAI 공지를 등록합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.title)
        .setDescription('공지 제목입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.body)
        .setDescription('공지 내용입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.tone)
        .setDescription('공지 유형입니다.')
        .setRequired(false)
        .addChoices(...toneChoices),
    )
    .addBooleanOption((option) =>
      option
        .setName(optionNames.pinned)
        .setDescription('공지를 고정합니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.announcementList)
    .setDescription('최근 공지 목록을 확인합니다.'),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.announcementUpdate)
    .setDescription('공지 제목, 내용, 유형, 고정 여부를 수정합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.announcementId)
        .setDescription('공지 ID입니다.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.title)
        .setDescription('새 공지 제목입니다.')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.body)
        .setDescription('새 공지 내용입니다.')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName(optionNames.tone)
        .setDescription('새 공지 유형입니다.')
        .setRequired(false)
        .addChoices(...toneChoices),
    )
    .addBooleanOption((option) =>
      option
        .setName(optionNames.pinned)
        .setDescription('공지를 고정합니다.')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName(optionNames.active)
        .setDescription('공지를 활성화합니다.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName(focusaiDiscordCommandNames.announcementEnd)
    .setDescription('공지를 비활성화합니다.')
    .addStringOption((option) =>
      option
        .setName(optionNames.announcementId)
        .setDescription('공지 ID입니다.')
        .setRequired(true),
    ),
].map((command) => command.toJSON())

const notificationSettingsPath = path.resolve(
  process.cwd(),
  'uploads',
  'discord-notification-settings.json',
)

function yesNo(value: boolean) {
  return value ? '설정됨' : '설정 안 됨'
}

function ticketStatusLabel(status: SupportTicketPayload['status']) {
  const labels: Record<SupportTicketPayload['status'], string> = {
    open: '열림',
    reviewing: '검토중',
    resolved: '해결됨',
    closed: '닫힘',
  }

  return labels[status]
}

function ticketCategoryLabel(category: SupportTicketPayload['category']) {
  const labels: Record<SupportTicketPayload['category'], string> = {
    inquiry: '문의',
    bug: '버그',
    report: '신고',
    account: '계정',
    other: '기타',
  }

  return labels[category]
}

function announcementToneLabel(tone: AnnouncementPayload['tone']) {
  const labels: Record<AnnouncementPayload['tone'], string> = {
    info: '정보',
    good: '좋음',
    warn: '주의',
    danger: '위험',
  }

  return labels[tone]
}

function notificationKindLabel(kind: NotificationKind) {
  const labels: Record<NotificationKind, string> = {
    support: '문의',
    health: '상태',
    daily: '일일요약',
  }

  return labels[kind]
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function isActionableTicket(ticket: SupportTicketPayload) {
  return ticket.status === 'open' || ticket.status === 'reviewing'
}

function createSupportTicketTracker() {
  const seenTicketIds = new Set<string>()
  let initialized = false

  return {
    next(tickets: SupportTicketPayload[]) {
      const actionableTickets = tickets.filter(isActionableTicket)
      const freshTickets = initialized
        ? actionableTickets.filter((ticket) => !seenTicketIds.has(ticket.id))
        : []

      for (const ticket of actionableTickets) {
        seenTicketIds.add(ticket.id)
      }
      initialized = true

      return freshTickets
    },
  }
}

function isHealthy(status: {
  mariaEnabled: boolean
  mariaReachable: boolean
  anthropicEnabled: boolean
  smtpEnabled: boolean
}) {
  return status.mariaEnabled && status.mariaReachable && status.anthropicEnabled && status.smtpEnabled
}

function createHealthStatusTracker() {
  let previousHealthy: boolean | null = null

  return {
    next(status: Awaited<ReturnType<typeof loadHealthStatus>>) {
      const currentHealthy = isHealthy(status)

      if (previousHealthy === null) {
        previousHealthy = currentHealthy
        return null
      }

      if (previousHealthy && !currentHealthy) {
        previousHealthy = currentHealthy

        if (!status.mariaReachable) {
          return 'FocusAI 상태 경고: MariaDB 연결이 끊겼습니다.'
        }

        return 'FocusAI 상태 경고: 주요 서비스 설정을 확인해야 합니다.'
      }

      if (!previousHealthy && currentHealthy) {
        previousHealthy = currentHealthy
        return 'FocusAI 상태 복구: 모든 주요 서비스가 정상입니다.'
      }

      previousHealthy = currentHealthy
      return null
    },
  }
}

function formatHealthStatus(status: Awaited<ReturnType<typeof loadHealthStatus>>) {
  const mariaState = status.mariaEnabled
    ? `설정됨 / ${status.mariaReachable ? '연결됨' : '연결 안 됨'}`
    : '설정 안 됨'

  return [
    'FocusAI 상태',
    `MariaDB: ${mariaState}`,
    `AI: ${yesNo(status.anthropicEnabled)}`,
    `SMTP: ${yesNo(status.smtpEnabled)}`,
  ].join('\n')
}

function formatAdminSummary(overview: AdminOverviewPayload) {
  const topSubjects = overview.topSubjects.length
    ? overview.topSubjects
        .map((subject) => `${subject.subject} (${subject.sessionCount}개, 평균 ${subject.averageFocusScore}점)`)
        .join(', ')
    : '아직 학습 과목 데이터가 없습니다.'

  const openTickets = overview.supportTickets.filter(isActionableTicket).length

  return [
    'FocusAI 관리자 요약',
    `전체 사용자: ${overview.totals.totalUsers}명`,
    `관리자: ${overview.totals.adminUsers}명`,
    `오늘 세션: ${overview.totals.sessionsToday}개`,
    `최근 7일 세션: ${overview.totals.sessions7d}개`,
    `최근 7일 활성 사용자: ${overview.totals.activeUsers7d}명`,
    `평균 집중 점수: ${overview.totals.averageFocusScore}점`,
    `열림/검토중 문의: ${openTickets}개`,
    `상위 과목: ${topSubjects}`,
  ].join('\n')
}

function formatSupportTickets(tickets: SupportTicketPayload[]) {
  if (tickets.length === 0) {
    return '조회된 문의가 없습니다.'
  }

  return tickets
    .slice(0, 10)
    .map((ticket) =>
      [
        `#${ticket.id} [${ticketStatusLabel(ticket.status)}] ${ticket.subject}`,
        `${ticket.userName} <${ticket.userEmail}>`,
        `분류: ${ticketCategoryLabel(ticket.category)}`,
        `수정일: ${ticket.updatedAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

function formatSupportTicketDetail(ticket: SupportTicketPayload) {
  return [
    `문의 #${ticket.id} [${ticketStatusLabel(ticket.status)}]`,
    `제목: ${ticket.subject}`,
    `사용자: ${ticket.userName} <${ticket.userEmail}>`,
    `분류: ${ticketCategoryLabel(ticket.category)}`,
    `작성일: ${ticket.createdAt}`,
    `수정일: ${ticket.updatedAt}`,
    '',
    '내용',
    truncate(ticket.body, 1200),
    '',
    '관리자 답변',
    ticket.adminReply ? truncate(ticket.adminReply, 800) : '아직 답변이 없습니다.',
  ].join('\n')
}

function formatUserSearchResults(users: AdminUserRecordPayload[]) {
  if (users.length === 0) {
    return '조회된 사용자가 없습니다.'
  }

  return users
    .slice(0, 10)
    .map((user) =>
      [
        `${user.name} <${user.email}>`,
        `ID: ${user.id}`,
        `관리자: ${user.isAdmin ? '예' : '아니오'}`,
        `세션: ${user.sessionCount}개, 평균 집중 점수: ${user.averageFocusScore}점`,
        `최근 세션: ${user.lastSessionAt ?? '없음'}`,
      ].join('\n'),
    )
    .join('\n\n')
}

function formatRecentSessions(sessions: AdminSessionRecordPayload[]) {
  if (sessions.length === 0) {
    return '조회된 학습 세션이 없습니다.'
  }

  return sessions
    .slice(0, 10)
    .map((session) =>
      [
        `${session.userName} <${session.userEmail}>`,
        `과목: ${session.subject}, 모드: ${session.mode}`,
        `평균/최종 점수: ${session.avgScore}/${session.finalScore}`,
        `집중 시간: ${Math.round(session.focusedSeconds / 60)}분 / 총 ${Math.round(session.elapsedSeconds / 60)}분`,
        `생성일: ${session.createdAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

function formatAuditLogs(logs: AdminAuditLogPayload[]) {
  if (logs.length === 0) {
    return '조회된 감사 로그가 없습니다.'
  }

  return logs
    .slice(0, 10)
    .map((log) =>
      [
        `#${log.id} ${log.actionType}`,
        `${log.actorName} <${log.actorEmail}>`,
        `대상: ${log.targetType}${log.targetId ? ` #${log.targetId}` : ''}`,
        `요약: ${log.summary}`,
        `생성일: ${log.createdAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

function formatAnnouncements(announcements: AnnouncementPayload[]) {
  if (announcements.length === 0) {
    return '조회된 공지가 없습니다.'
  }

  return announcements
    .slice(0, 10)
    .map((announcement) =>
      [
        `#${announcement.id} [${announcement.isActive ? '활성' : '비활성'}] ${announcement.title}`,
        `공지 유형: ${announcementToneLabel(announcement.tone)}, 고정: ${announcement.isPinned ? '예' : '아니오'}`,
        `수정일: ${announcement.updatedAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

function formatNewSupportTicketNotification(ticket: SupportTicketPayload, adminUrl: string | null) {
  const lines = [
    '새 문의가 접수되었습니다.',
    `#${ticket.id} [${ticketStatusLabel(ticket.status)}] ${ticket.subject}`,
    `${ticket.userName} <${ticket.userEmail}>`,
    `분류: ${ticketCategoryLabel(ticket.category)}`,
  ]

  if (adminUrl) {
    lines.push(`관리자 페이지: ${adminUrl}`)
  }

  return lines.join('\n')
}

function formatNotificationSettings(settings: NotificationSettings) {
  const kinds: NotificationKind[] = ['support', 'health', 'daily']
  const lines = kinds.map((kind) => {
    const setting = settings[kind]

    if (!setting) {
      return `${notificationKindLabel(kind)}: 설정 안 됨`
    }

    const mention = setting.mentionRoleId ? `, 멘션: <@&${setting.mentionRoleId}>` : ''
    return `${notificationKindLabel(kind)}: <#${setting.channelId}>${mention}`
  })

  return ['알림 채널 설정', ...lines].join('\n')
}

function withMention(content: string, setting: NotificationChannelSetting | null) {
  if (!setting?.mentionRoleId) {
    return content
  }

  return `<@&${setting.mentionRoleId}>\n${content}`
}

export function allowedNotificationMentions(setting: NotificationChannelSetting | null) {
  return {
    parse: [],
    roles: setting?.mentionRoleId ? [setting.mentionRoleId] : [],
  }
}

async function readNotificationSettingsFile(): Promise<NotificationSettings> {
  try {
    const raw = await readFile(notificationSettingsPath, 'utf8')
    return JSON.parse(raw) as NotificationSettings
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

async function writeNotificationSettingsFile(settings: NotificationSettings) {
  await mkdir(path.dirname(notificationSettingsPath), { recursive: true })
  await writeFile(notificationSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

async function setNotificationChannel(
  kind: NotificationKind,
  setting: NotificationChannelSetting,
) {
  const settings = await readNotificationSettingsFile()
  settings[kind] = setting
  await writeNotificationSettingsFile(settings)
  return settings
}

async function getNotificationSettings() {
  return readNotificationSettingsFile()
}

async function getNotificationChannel(kind: NotificationKind) {
  const settings = await readNotificationSettingsFile()
  return settings[kind] ?? null
}

function normalizeRoleIds(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const roles = interaction.member?.roles

  if (!roles || Array.isArray(roles)) {
    return new Set(Array.isArray(roles) ? roles : [])
  }

  return new Set(roles.cache.keys())
}

function guardInteraction(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  settings: DiscordBotRuntimeSettings,
) {
  if (settings.guildIds.length > 0 && (!interaction.guildId || !settings.guildIds.includes(interaction.guildId))) {
    return 'This command is only available in the configured FocusAI admin server.'
  }

  if (settings.adminChannelId && interaction.channelId !== settings.adminChannelId) {
    return 'Please use the configured FocusAI admin channel for bot commands.'
  }

  if (settings.adminRoleIds.length > 0) {
    const roleIds = normalizeRoleIds(interaction)
    const hasRole = settings.adminRoleIds.some((roleId) => roleIds.has(roleId))

    if (!hasRole) {
      return 'You do not have permission to use FocusAI admin bot commands.'
    }
  }

  return null
}

function parsePositiveInteger(value: string | null | undefined, name: string) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }

  return parsed
}

function parseAnnouncementId(value: string | null | undefined) {
  return parsePositiveInteger(value, 'Announcement ID')
}

async function resolveActorUserId(settings: DiscordBotRuntimeSettings) {
  if (settings.botActorUserId?.trim()) {
    return parsePositiveInteger(settings.botActorUserId, 'Bot actor user ID')
  }

  const overview = await getAdminOverview()
  const admin = overview.users.find((user) => user.isAdmin)

  if (!admin) {
    throw new Error('FocusAI 관리자 계정을 찾을 수 없습니다.')
  }

  return parsePositiveInteger(admin.id, 'Bot actor user ID')
}

async function loadHealthStatus() {
  return {
    mariaEnabled: runtimeFlags.mariaEnabled,
    mariaReachable: await pingMaria(),
    anthropicEnabled: runtimeFlags.anthropicEnabled,
    smtpEnabled: runtimeFlags.smtpEnabled,
  }
}

async function loadSupportTickets(status?: SupportTicketAdminUpdatePayload['status']) {
  const overview = await getAdminOverview()

  if (!status) {
    return overview.supportTickets
  }

  return overview.supportTickets.filter((ticket) => ticket.status === status)
}

async function loadSupportTicket(ticketId: number) {
  const overview = await getAdminOverview()
  const ticket = overview.supportTickets.find((item) => item.id === String(ticketId))

  if (!ticket) {
    throw new Error('문의가 존재하지 않거나 최근 문의 목록에 없습니다.')
  }

  return ticket
}

async function searchUsers(query: { email?: string | null; name?: string | null }) {
  const overview = await getAdminOverview()
  const email = query.email?.trim().toLowerCase()
  const name = query.name?.trim().toLowerCase()

  if (!email && !name) {
    return overview.users.slice(0, 10)
  }

  return overview.users.filter((user) => {
    const emailMatches = email ? user.email.toLowerCase().includes(email) : true
    const nameMatches = name ? user.name.toLowerCase().includes(name) : true

    return emailMatches && nameMatches
  })
}

async function loadRecentSessions(count: number) {
  const overview = await getAdminOverview()
  return overview.sessions.slice(0, count)
}

async function loadAuditLogs(count: number) {
  const overview = await getAdminOverview()
  return overview.auditLogs.slice(0, count)
}

async function loadAnnouncements() {
  const overview = await getAdminOverview()
  return overview.announcements
}

async function updateAnnouncementFromOverview(
  actorUserId: number,
  announcementId: number,
  updates: Partial<AnnouncementUpsertPayload>,
) {
  const overview = await getAdminOverview()
  const announcement = overview.announcements.find((item) => item.id === String(announcementId))

  if (!announcement) {
    throw new Error('공지가 존재하지 않거나 최근 공지 목록에 없습니다.')
  }

  return updateAnnouncement(actorUserId, announcementId, {
    title: updates.title ?? announcement.title,
    body: updates.body ?? announcement.body,
    tone: updates.tone ?? announcement.tone,
    isActive: updates.isActive ?? announcement.isActive,
    isPinned: updates.isPinned ?? announcement.isPinned,
    startsAt: updates.startsAt ?? announcement.startsAt,
    endsAt: updates.endsAt ?? announcement.endsAt,
  })
}

async function closeAnnouncement(actorUserId: number, announcementId: number) {
  return updateAnnouncementFromOverview(actorUserId, announcementId, {
    isActive: false,
    endsAt: new Date().toISOString(),
  })
}

function resolveTicketWithDefaultReply(
  ticket: SupportTicketPayload,
  status: SupportTicketAdminUpdatePayload['status'],
) {
  return {
    status,
    adminReply: ticket.adminReply ?? '',
  }
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

async function registerCommands(settings: DiscordBotRuntimeSettings) {
  if (!settings.registerCommands || !settings.token) {
    return
  }

  const rest = new REST({ version: '10' }).setToken(settings.token)

  if (settings.guildIds.length > 0) {
    await Promise.all(
      settings.guildIds.map((guildId) =>
        rest.put(Routes.applicationGuildCommands(settings.clientId, guildId), {
          body: focusaiDiscordCommands,
        }),
      ),
    )
    return
  }

  await rest.put(Routes.applicationCommands(settings.clientId), {
    body: focusaiDiscordCommands,
  })
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  settings: DiscordBotRuntimeSettings,
) {
  const guardMessage = guardInteraction(interaction, settings)

  if (guardMessage) {
    await interaction.reply({ content: guardMessage, ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  if (interaction.commandName === focusaiDiscordCommandNames.status) {
    await interaction.editReply({ content: formatHealthStatus(await loadHealthStatus()) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.summary) {
    await interaction.editReply({ content: formatAdminSummary(await getAdminOverview()) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.tickets) {
    const status = interaction.options.getString(optionNames.status) as SupportTicketAdminUpdatePayload['status'] | null
    await interaction.editReply({ content: formatSupportTickets(await loadSupportTickets(status ?? undefined)) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.ticketDetail) {
    const ticketId = parsePositiveInteger(interaction.options.getString(optionNames.ticketId), 'Ticket ID')
    const ticket = await loadSupportTicket(ticketId)

    await interaction.editReply({
      content: formatSupportTicketDetail(ticket),
      components: ticketActionRows(ticket.id),
    })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.ticketUpdate) {
    const actorUserId = await resolveActorUserId(settings)
    const ticketId = parsePositiveInteger(interaction.options.getString(optionNames.ticketId), 'Ticket ID')
    const status = interaction.options.getString(optionNames.status, true) as SupportTicketAdminUpdatePayload['status']
    const adminReply = interaction.options.getString(optionNames.reply) ?? ''
    const ticket = await updateSupportTicket(actorUserId, ticketId, { status, adminReply })

    await interaction.editReply({
      content: `문의 #${ticket.id} 상태를 ${ticketStatusLabel(ticket.status)}로 변경했습니다.`,
    })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.userSearch) {
    const users = await searchUsers({
      email: interaction.options.getString(optionNames.email),
      name: interaction.options.getString(optionNames.name),
    })

    await interaction.editReply({ content: formatUserSearchResults(users) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.recentSessions) {
    const count = clampCount(interaction.options.getInteger(optionNames.count), 10)
    await interaction.editReply({ content: formatRecentSessions(await loadRecentSessions(count)) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.auditLogs) {
    const count = clampCount(interaction.options.getInteger(optionNames.count), 10)
    await interaction.editReply({ content: formatAuditLogs(await loadAuditLogs(count)) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.notificationChannelSet) {
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

  if (interaction.commandName === focusaiDiscordCommandNames.notificationChannelList) {
    await interaction.editReply({ content: formatNotificationSettings(await getNotificationSettings()) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.announcementCreate) {
    const actorUserId = await resolveActorUserId(settings)
    const announcement = await createAnnouncement(actorUserId, {
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

  if (interaction.commandName === focusaiDiscordCommandNames.announcementList) {
    await interaction.editReply({ content: formatAnnouncements(await loadAnnouncements()) })
    return
  }

  if (interaction.commandName === focusaiDiscordCommandNames.announcementUpdate) {
    const actorUserId = await resolveActorUserId(settings)
    const announcementId = parseAnnouncementId(interaction.options.getString(optionNames.announcementId))
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

  if (interaction.commandName === focusaiDiscordCommandNames.announcementEnd) {
    const actorUserId = await resolveActorUserId(settings)
    const announcementId = parseAnnouncementId(interaction.options.getString(optionNames.announcementId))
    const announcement = await closeAnnouncement(actorUserId, announcementId)

    await interaction.editReply({ content: `공지 #${announcement.id}를 종료했습니다: ${announcement.title}` })
    return
  }

  await interaction.editReply({ content: '지원하지 않는 명령입니다.' })
}

async function handleButton(interaction: ButtonInteraction, settings: DiscordBotRuntimeSettings) {
  const guardMessage = guardInteraction(interaction, settings)

  if (guardMessage) {
    await interaction.reply({ content: guardMessage, ephemeral: true })
    return
  }

  const [kind, status, ticketIdText] = interaction.customId.split(':')

  if (kind !== 'ticket') {
    await interaction.reply({ content: '알 수 없는 버튼입니다.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })
  const actorUserId = await resolveActorUserId(settings)
  const ticketId = parsePositiveInteger(ticketIdText, 'Ticket ID')
  const ticket = await loadSupportTicket(ticketId)
  const updated = await updateSupportTicket(
    actorUserId,
    ticketId,
    resolveTicketWithDefaultReply(ticket, status as SupportTicketAdminUpdatePayload['status']),
  )

  await interaction.editReply({
    content: `문의 #${updated.id} 상태를 ${ticketStatusLabel(updated.status)}로 변경했습니다.`,
  })
}

async function sendAdminChannelMessage(
  client: Client,
  settings: DiscordBotRuntimeSettings,
  payload: { content: string; components?: ActionRowBuilder<ButtonBuilder>[]; kind?: NotificationKind },
) {
  const setting = payload.kind ? await getNotificationChannel(payload.kind) : null
  const channelId = setting?.channelId ?? settings.adminChannelId

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

function startBackgroundTasks(client: Client, settings: DiscordBotRuntimeSettings) {
  const timers: NodeJS.Timeout[] = []
  const supportTracker = createSupportTicketTracker()
  const healthTracker = createHealthStatusTracker()
  let lastDailySummaryDate: string | null = null

  timers.push(setInterval(() => {
    loadSupportTickets()
      .then((tickets) => supportTracker.next(tickets))
      .then((tickets) =>
        Promise.all(
          tickets.map((ticket) =>
            sendAdminChannelMessage(client, settings, {
              content: formatNewSupportTicketNotification(ticket, settings.adminUrl),
              components: ticketActionRows(ticket.id),
              kind: 'support',
            }),
          ),
        ),
      )
      .catch((error: unknown) => console.error('[discord-bot.support-poll]', error))
  }, settings.supportPollMs))

  timers.push(setInterval(() => {
    loadHealthStatus()
      .then((status) => healthTracker.next(status))
      .then((message) => {
        if (!message) {
          return undefined
        }

        return sendAdminChannelMessage(client, settings, { content: message, kind: 'health' })
      })
      .catch((error: unknown) => console.error('[discord-bot.health-poll]', error))
  }, settings.healthPollMs))

  timers.push(setInterval(() => {
    const now = new Date()
    const dateKey = now.toISOString().slice(0, 10)

    if (now.getHours() !== settings.dailySummaryHour || lastDailySummaryDate === dateKey) {
      return
    }

    lastDailySummaryDate = dateKey
    getAdminOverview()
      .then((overview) =>
        sendAdminChannelMessage(client, settings, { content: formatAdminSummary(overview), kind: 'daily' }),
      )
      .catch((error: unknown) => console.error('[discord-bot.daily-summary]', error))
  }, 60_000))

  return timers
}

export function createDiscordJsBotGateway(): DiscordBotGateway {
  return {
    async start(settings) {
      if (!settings.token) {
        throw new Error('Bot token is required.')
      }

      await registerCommands(settings)

      const client = new Client({ intents: [GatewayIntentBits.Guilds] })
      let timers: NodeJS.Timeout[] = []

      client.once('clientReady', () => {
        timers = startBackgroundTasks(client, settings)
      })

      client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand() && !interaction.isButton()) {
          return
        }

        try {
          if (interaction.isChatInputCommand()) {
            await handleCommand(interaction, settings)
            return
          }

          await handleButton(interaction, settings)
        } catch (error) {
          console.error('[discord-bot.interaction]', error)
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

      await client.login(settings.token)

      return {
        botUserTag: client.user?.tag ?? null,
        async stop() {
          for (const timer of timers) {
            clearInterval(timer)
          }

          client.removeAllListeners()
          client.destroy()
        },
      }
    },
  }
}
