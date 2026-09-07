import { pingMaria } from '../../server/src/mariadb.js'
import {
  createAnnouncement,
  getAdminOverview,
  updateAnnouncement,
  updateSupportTicket,
} from '../../server/src/store.js'
import { runtimeFlags } from '../../server/src/env.js'
import type {
  AnnouncementUpsertPayload,
  SupportTicketPayload,
  SupportTicketAdminUpdatePayload,
} from '../../server/src/contracts.js'

export type DiscordAdminConfig = {
  guildIds: Set<string>
  channelId: string | undefined
  roleIds: Set<string>
}

export type DiscordCommandContext = {
  guildId: string | undefined
  channelId: string
  roleIds: Set<string>
}

export type DiscordGuardResult =
  | { ok: true }
  | { ok: false; message: string }

export function normalizeDiscordRoleIds(
  roles: string[] | { cache: { keys(): IterableIterator<string> } } | undefined,
) {
  if (!roles) {
    return new Set<string>()
  }

  if (Array.isArray(roles)) {
    return new Set(roles)
  }

  return new Set(roles.cache.keys())
}

export function createDiscordAdminGuard(config: DiscordAdminConfig) {
  return (context: DiscordCommandContext): DiscordGuardResult => {
    if (config.guildIds.size > 0 && (!context.guildId || !config.guildIds.has(context.guildId))) {
      return {
        ok: false,
        message: 'This command is only available in the configured FocusAI admin server.',
      }
    }

    if (config.channelId && context.channelId !== config.channelId) {
      return {
        ok: false,
        message: 'Please use the configured FocusAI admin channel for bot commands.',
      }
    }

    if (config.roleIds.size > 0) {
      const hasAllowedRole = [...context.roleIds].some((roleId) => config.roleIds.has(roleId))

      if (!hasAllowedRole) {
        return {
          ok: false,
          message: 'You do not have permission to use FocusAI admin bot commands.',
        }
      }
    }

    return { ok: true }
  }
}

function parsePositiveInteger(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required.`)
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }

  return parsed
}

export function parseActorUserId(value: string | undefined) {
  return parsePositiveInteger(value, 'DISCORD_BOT_ACTOR_USER_ID')
}

export function resolveActorUserId(
  value: string | undefined,
  users: Array<{ id: string; isAdmin: boolean }>,
) {
  if (value?.trim()) {
    return parseActorUserId(value)
  }

  const adminUser = users.find((user) => user.isAdmin)

  if (!adminUser) {
    throw new Error('DISCORD_BOT_ACTOR_USER_ID가 비어 있고 FocusAI 관리자 계정을 찾을 수 없습니다.')
  }

  return parseActorUserId(adminUser.id)
}

export async function loadBotActorUserId(value: string | undefined) {
  const overview = await getAdminOverview()
  return resolveActorUserId(value, overview.users)
}

export function parseTicketId(value: string | undefined) {
  return parsePositiveInteger(value, 'ticket id')
}

export function parseAnnouncementId(value: string | undefined) {
  return parsePositiveInteger(value, 'announcement id')
}

export async function loadHealthStatus() {
  return {
    mariaEnabled: runtimeFlags.mariaEnabled,
    mariaReachable: await pingMaria(),
    anthropicEnabled: runtimeFlags.anthropicEnabled,
    smtpEnabled: runtimeFlags.smtpEnabled,
  }
}

export async function loadAdminSummary() {
  return getAdminOverview()
}

export async function loadSupportTickets(status?: SupportTicketAdminUpdatePayload['status']) {
  const overview = await getAdminOverview()

  if (!status) {
    return overview.supportTickets
  }

  return overview.supportTickets.filter((ticket) => ticket.status === status)
}

export async function loadSupportTicketDetail(ticketId: number) {
  const overview = await getAdminOverview()
  const ticket = overview.supportTickets.find((item) => item.id === String(ticketId))

  if (!ticket) {
    throw new Error('문의가 존재하지 않거나 최근 문의 목록에 없습니다.')
  }

  return ticket
}

export async function searchUsers(query: { email?: string | null; name?: string | null }) {
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

export async function loadRecentSessions(count: number) {
  const overview = await getAdminOverview()
  return overview.sessions.slice(0, count)
}

export async function loadAuditLogs(count: number) {
  const overview = await getAdminOverview()
  return overview.auditLogs.slice(0, count)
}

export async function loadAnnouncements() {
  const overview = await getAdminOverview()
  return overview.announcements
}

export async function updateAnnouncementFromOverview(
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

export async function closeAnnouncement(actorUserId: number, announcementId: number) {
  return updateAnnouncementFromOverview(actorUserId, announcementId, {
    isActive: false,
    endsAt: new Date().toISOString(),
  })
}

export async function resolveSupportTicket(
  actorUserId: number,
  ticketId: number,
  payload: SupportTicketAdminUpdatePayload,
) {
  return updateSupportTicket(actorUserId, ticketId, payload)
}

export async function publishAnnouncement(actorUserId: number, payload: AnnouncementUpsertPayload) {
  return createAnnouncement(actorUserId, payload)
}

export function resolveTicketWithDefaultReply(
  ticket: SupportTicketPayload,
  status: SupportTicketAdminUpdatePayload['status'],
) {
  return {
    status,
    adminReply: ticket.adminReply ?? '',
  }
}
