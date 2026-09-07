import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type NotificationKind = 'support' | 'health' | 'daily'

export type NotificationChannelSetting = {
  channelId: string
  mentionRoleId: string | null
}

export type NotificationSettings = Partial<Record<NotificationKind, NotificationChannelSetting>>

const settingsPath = path.resolve(process.cwd(), 'bot/data/notification-settings.json')

export function notificationKindLabel(kind: NotificationKind) {
  const labels: Record<NotificationKind, string> = {
    support: '문의',
    health: '상태',
    daily: '일일요약',
  }

  return labels[kind]
}

async function readSettingsFile(): Promise<NotificationSettings> {
  try {
    const raw = await readFile(settingsPath, 'utf8')
    return JSON.parse(raw) as NotificationSettings
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

async function writeSettingsFile(settings: NotificationSettings) {
  await mkdir(path.dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

export async function setNotificationChannel(
  kind: NotificationKind,
  setting: NotificationChannelSetting,
) {
  const settings = await readSettingsFile()
  settings[kind] = setting
  await writeSettingsFile(settings)
  return settings
}

export async function getNotificationSettings() {
  return readSettingsFile()
}

export async function getNotificationChannel(kind: NotificationKind) {
  const settings = await readSettingsFile()
  return settings[kind] ?? null
}

export function formatNotificationSettings(settings: NotificationSettings) {
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

export function withMention(content: string, setting: NotificationChannelSetting | null) {
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
