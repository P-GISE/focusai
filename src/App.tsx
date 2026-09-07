import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  acceptCurrentConsentInApi,
  changePasswordInApi,
  createAdminAnnouncementInApi,
  deleteAdminAnnouncementInApi,
  createSupportTicketInApi,
  deleteAccountInApi,
  fetchActiveAnnouncementFromApi,
  fetchAdminOverviewFromApi,
  fetchAnnouncementsFromApi,
  fetchDiscordBotAdminStateFromApi,
  fetchLostarkDiscordBotAdminStateFromApi,
  fetchAiFeedbackFromApi,
  fetchBootstrapFromApi,
  fetchSupportTicketsFromApi,
  getApiHealth,
  loginWithApi,
  logoutFromApi,
  requestPasswordResetInApi,
  registerWithApi,
  resetPasswordWithTokenInApi,
  saveSessionToApi,
  startDiscordBotInApi,
  startLostarkDiscordBotInApi,
  stopDiscordBotInApi,
  stopLostarkDiscordBotInApi,
  syncProfileToApi,
  updateAdminAnnouncementInApi,
  updateDiscordBotSettingsInApi,
  updateLostarkDiscordBotSettingsInApi,
  updateAdminSupportTicketInApi,
  updateAdminUserRoleInApi,
  updateSessionNotesInApi,
} from './lib/api'
import type {
  Announcement as BackendAnnouncement,
  AdminOverview as BackendAdminOverview,
  AdminSystemStatus as BackendAdminSystemStatus,
  AiFeedback as BackendAiFeedback,
  AiFeedbackResult as BackendAiFeedbackResult,
  ApiBootstrap as BackendBootstrap,
  ApiHealth as BackendHealth,
  DiscordBotSettings as BackendDiscordBotSettings,
  DiscordBotSettingsUpdate as BackendDiscordBotSettingsUpdate,
  DiscordBotStatus as BackendDiscordBotStatus,
  SupportTicket as BackendSupportTicket,
  SupportTicketCategory as BackendSupportTicketCategory,
  SupportTicketStatus as BackendSupportTicketStatus,
} from './lib/contracts'
import { formatDiscordBotDateTime } from './lib/discordBotDisplay'
import {
  createFocusTracker,
  DEFAULT_FOCUS_TRACKING_SUMMARY,
  updateFocusTracker,
  type FocusTrackingState,
  type FocusTrackingSummary,
} from './lib/focusTracking'
import {
  analyzeStudyVision,
  loadStudyVision,
  resetStudyVision,
  type StudyAttentionState,
} from './lib/studyVision'
import {
  CAMERA_ACCESS_RECOVERY_STEPS,
  UNSUPPORTED_CAMERA_MESSAGE,
  VISION_MODEL_FALLBACK_MESSAGE,
  describeCameraAccessError,
} from './lib/cameraGuidance'
import { exportReportPdf } from './lib/reportPdf'
import {
  SESSION_SAVE_FAILURE_MESSAGE,
  SESSION_SAVE_OFFLINE_MESSAGE,
  mergeRecentSession,
} from './lib/sessionCompletion'
import type { Screen } from './lib/navigation'
import { AuthRuntimePanel, Sidebar, TopNavigation } from './components/AppNavigation'
import './App.css'

type Severity = 'good' | 'warn' | 'info'

type BootstrapNavigationMode = 'restore' | 'camera'

type FocusRangeMode = 'current-week' | 'previous-week' | 'month'

type UserProfile = {
  id: string
  name: string
  email: string
  dailyGoalHours: number
  subjects: string[]
  authSource: 'mariadb'
  isAdmin: boolean
  consentVersion: string
  privacyConsentAt: string | null
  cameraConsentAt: string | null
}

type AppSettings = {
  dailyGoalHours: number
  idleThresholdSeconds: number
  focusAlert: boolean
  breakReminder: boolean
  saveRawVideo: boolean
  defaultSessionMinutes: number
  defaultSessionMode: string
  autoResumeSession: boolean
  soundAlerts: boolean
  showLiveScore: boolean
  showEventLog: boolean
  reduceMotion: boolean
  keepScreenAwake: boolean
}

type SessionSetup = {
  subject: string
  durationMinutes: number
  mode: string
}

type SessionEvent = {
  id: string
  severity: Severity
  message: string
  timestamp: number
}

type LiveSession = {
  id: string
  createdAt: string
  subject: string
  mode: string
  goalMinutes: number
  elapsedSeconds: number
  focusedSeconds: number
  score: number
  timeline: number[]
  events: SessionEvent[]
  tabSwitches: number
  idleEvents: number
  absenceEvents: number
  hiddenSeconds: number
  highestScore: number
  lowestScore: number
}

type SessionNotes = {
  studied: string
  distraction: string
  nextGoal: string
}

type StoredSession = {
  id: string
  createdAt: string
  subject: string
  mode: string
  goalMinutes: number
  elapsedSeconds: number
  focusedSeconds: number
  avgScore: number
  finalScore: number
  timeline: number[]
  tabSwitches: number
  idleEvents: number
  absenceEvents: number
  hiddenSeconds: number
  highestScore: number
  lowestScore: number
  notes: SessionNotes
}

type RegisterConsents = {
  privacyPolicyAccepted: boolean
  cameraPolicyAccepted: boolean
}

type PasswordForm = {
  currentPassword: string
  nextPassword: string
  confirmPassword: string
}

type AccountDeleteForm = {
  password: string
  confirmText: string
}

type ResetPasswordForm = {
  nextPassword: string
  confirmPassword: string
}

type SettingsSection =
  | 'profile'
  | 'measurement'
  | 'session'
  | 'alerts'
  | 'interface'
  | 'privacy'
  | 'account'
  | 'security'
  | 'danger'

type AdminSection =
  | 'overview'
  | 'users'
  | 'sessions'
  | 'announcements'
  | 'support'
  | 'discord'
  | 'audit'
  | 'system'

type AppFeedback = {
  tone: 'good' | 'warn' | 'danger' | 'info'
  text: string
}

type RuntimeMode =
  | {
      kind: 'local'
      label: string
      detail: string
    }
  | {
      kind: 'server'
      label: null
      detail: null
    }

type FeedbackInsights = BackendAiFeedback

type AdminOverview = BackendAdminOverview
type AdminSystemStatus = BackendAdminSystemStatus
type Announcement = BackendAnnouncement
type SupportTicket = BackendSupportTicket
type SupportTicketCategory = BackendSupportTicketCategory
type SupportTicketStatus = BackendSupportTicketStatus
type DiscordBotSettings = BackendDiscordBotSettings
type DiscordBotStatus = BackendDiscordBotStatus
type DiscordBotSettingsUpdate = BackendDiscordBotSettingsUpdate

type FeedbackProvider = Pick<BackendAiFeedbackResult, 'source' | 'model'>

type SessionDraft = {
  userId: string
  session: LiveSession
  setup: SessionSetup
  isPaused: boolean
  savedAt: number
}

type AnnouncementForm = {
  title: string
  body: string
  tone: Announcement['tone']
  isActive: boolean
  isPinned: boolean
  startsAt: string
  endsAt: string
}

type SupportTicketForm = {
  category: SupportTicketCategory
  subject: string
  body: string
}

type DiscordBotSettingsForm = {
  botToken: string
  clearToken: boolean
  clientId: string
  guildIds: string
  adminChannelId: string
  adminRoleIds: string
  botActorUserId: string
  registerCommands: boolean
  adminUrl: string
  supportPollMs: number
  healthPollMs: number
  dailySummaryHour: number
}

type CameraDeviceOption = {
  deviceId: string
  label: string
}

type CameraLightingState = 'unknown' | 'good' | 'dim' | 'bright'

type CameraFramingState =
  | 'unknown'
  | 'good'
  | 'adjust'
  | 'not-found'
  | 'multi-face'
  | 'unsupported'

type CameraConnectionState = 'idle' | 'active' | 'stalled' | 'error'

type CameraDiagnostics = {
  deviceId: string
  deviceLabel: string
  width: number
  height: number
  frameRate: number
  brightness: number
  motion: number
  lighting: CameraLightingState
  framing: CameraFramingState
  faceCount: number
  faceSupported: boolean
  attention: StudyAttentionState
  faceCenterX: number | null
  faceCenterY: number | null
  faceRatio: number | null
  headYawScore: number
  headPitchScore: number
  blinkScore: number
  connection: CameraConnectionState
  lastUpdatedAt: number | null
  issue: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const BACKEND_HEALTH_RETRY_MS = 5_000
const APP_MESSAGE_AUTO_DISMISS_MS = 7_000
const SESSION_DRAFT_KEY = 'focusai:web:session-draft'
const CAMERA_DEVICE_KEY = 'focusai:web:camera-device-id'
const LAST_SCREEN_KEY = 'focusai:web:last-screen'
const CONSENT_VERSION = '2026-05-web-v1'
const FOCUS_RANGE_OPTIONS: Array<{
  id: FocusRangeMode
  label: string
  badge: string
  days: number
  offsetDays: number
}> = [
  { id: 'current-week', label: '이번 주', badge: '최근 7일', days: 7, offsetDays: 0 },
  { id: 'previous-week', label: '지난 주', badge: '7-14일 전', days: 7, offsetDays: 7 },
  { id: 'month', label: '최근 30일', badge: '월간', days: 30, offsetDays: 0 },
]
const ACCOUNT_DELETE_CONFIRM_TEXT = 'DELETE'
const SESSION_DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000
const RESTORABLE_SCREENS: Screen[] = [
  'dashboard',
  'announcements',
  'support',
  'session-setup',
  'report',
  'feedback',
  'admin',
  'settings',
]
const SCREEN_PATHS: Partial<Record<Screen, string>> = {
  login: '/login',
  camera: '/camera',
  dashboard: '/dashboard',
  announcements: '/announcements',
  support: '/support',
  'session-setup': '/session',
  learning: '/learning',
  result: '/result',
  report: '/report',
  feedback: '/feedback',
  admin: '/admin',
  settings: '/settings',
}
const PATH_SCREENS = Object.fromEntries(
  Object.entries(SCREEN_PATHS).map(([screen, path]) => [path, screen]),
) as Record<string, Screen>
const SUBJECTS = ['알고리즘', '운영체제', '데이터베이스', '네트워크', '프론트엔드', 'AI']
const FALLBACK_SESSION_SUBJECT = '자율 학습'
const REST_CYCLE_MODE_NAME = '집중 휴식 반복'
const SUPPORT_TICKET_SUBJECT_MAX_LENGTH = 80
const SUPPORT_TICKET_BODY_MAX_LENGTH = 800
const SESSION_MODES = [
  { name: '능동 학습', description: '입력·탭 전환·활동성을 함께 보고 집중도를 계산합니다.' },
  { name: REST_CYCLE_MODE_NAME, description: '45분 집중 후 짧은 휴식 알림을 함께 제공합니다.' },
  { name: '가벼운 복습', description: '낮은 강도의 복습 세션에 맞춰 완만하게 측정합니다.' },
]
const SUPPORT_CATEGORY_OPTIONS: Array<{
  id: SupportTicketCategory
  label: string
  description: string
  example: string
}> = [
  {
    id: 'inquiry',
    label: '일반 문의',
    description: '기능 사용법이나 개선 의견',
    example: '예: 로그인은 되지만 리포트에서 특정 과목만 보고 싶습니다.',
  },
  {
    id: 'bug',
    label: '오류 제보',
    description: '화면 오류, 저장 실패, 버튼 동작 문제',
    example: '예: 문의 접수하기를 누르면 알림은 뜨지만 목록에 보이지 않습니다.',
  },
  {
    id: 'report',
    label: '신고',
    description: '부적절한 내용이나 운영상 확인이 필요한 문제',
    example: '예: 관리자에게 확인이 필요한 이상한 메시지가 반복해서 표시됩니다.',
  },
  {
    id: 'account',
    label: '계정 문제',
    description: '로그인, 비밀번호, 계정 정보 문제',
    example: '예: 비밀번호를 바꾼 뒤 다시 로그인할 수 없습니다.',
  },
  {
    id: 'other',
    label: '기타',
    description: '위 유형에 맞지 않는 요청',
    example: '예: 수업 운영 방식에 맞춘 별도 설정이 필요합니다.',
  },
]

const DEFAULT_SETTINGS: AppSettings = {
  dailyGoalHours: 4,
  idleThresholdSeconds: 25,
  focusAlert: true,
  breakReminder: true,
  saveRawVideo: false,
  defaultSessionMinutes: 90,
  defaultSessionMode: SESSION_MODES[0].name,
  autoResumeSession: true,
  soundAlerts: true,
  showLiveScore: true,
  showEventLog: true,
  reduceMotion: false,
  keepScreenAwake: false,
}

function buildDefaultSetup(settings: Pick<AppSettings, 'defaultSessionMinutes' | 'defaultSessionMode'>): SessionSetup {
  return {
    subject: FALLBACK_SESSION_SUBJECT,
    durationMinutes: settings.defaultSessionMinutes,
    mode: settings.defaultSessionMode,
  }
}

function isBackendServiceReady(health: BackendHealth) {
  return health.apiReachable && health.mariaEnabled && health.mariaReachable
}

function getRuntimeMode(): RuntimeMode {
  if (typeof window === 'undefined') {
    return {
      kind: 'server',
      label: null,
      detail: null,
    }
  }

  const hostname = window.location.hostname.toLowerCase()
  const isPrivateLanHost =
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    isPrivateLanHost

  return isLocalHost
    ? {
        kind: 'local',
        label: '로컬세팅',
        detail: '개발 API',
      }
    : {
        kind: 'server',
        label: null,
        detail: null,
      }
}

const DEFAULT_SETUP: SessionSetup = buildDefaultSetup(DEFAULT_SETTINGS)

const EMPTY_NOTES: SessionNotes = {
  studied: '',
  distraction: '',
  nextGoal: '',
}

const EMPTY_REGISTER_FORM: UserProfile = {
  id: '',
  name: '',
  email: '',
  dailyGoalHours: 0,
  subjects: [],
  authSource: 'mariadb',
  isAdmin: false,
  consentVersion: CONSENT_VERSION,
  privacyConsentAt: null,
  cameraConsentAt: null,
}

const EMPTY_REGISTER_CONSENTS: RegisterConsents = {
  privacyPolicyAccepted: false,
  cameraPolicyAccepted: false,
}

const EMPTY_PASSWORD_FORM: PasswordForm = {
  currentPassword: '',
  nextPassword: '',
  confirmPassword: '',
}

const EMPTY_DELETE_FORM: AccountDeleteForm = {
  password: '',
  confirmText: '',
}

const EMPTY_RESET_PASSWORD_FORM: ResetPasswordForm = {
  nextPassword: '',
  confirmPassword: '',
}

const DEFAULT_SETTINGS_SECTION: SettingsSection = 'profile'

const EMPTY_ANNOUNCEMENT_FORM: AnnouncementForm = {
  title: '',
  body: '',
  tone: 'info',
  isActive: true,
  isPinned: false,
  startsAt: '',
  endsAt: '',
}

const EMPTY_SUPPORT_TICKET_FORM: SupportTicketForm = {
  category: 'inquiry',
  subject: '',
  body: '',
}

const EMPTY_DISCORD_BOT_FORM: DiscordBotSettingsForm = {
  botToken: '',
  clearToken: false,
  clientId: '',
  guildIds: '',
  adminChannelId: '',
  adminRoleIds: '',
  botActorUserId: '',
  registerCommands: true,
  adminUrl: '',
  supportPollMs: 30_000,
  healthPollMs: 60_000,
  dailySummaryHour: 9,
}
const DISCORD_BOT_TOKEN_STORAGE_UNAVAILABLE_MESSAGE =
  '운영 서버의 Discord 봇 토큰 암호화 키를 준비하지 못해 Discord 봇 토큰 저장과 활성화를 사용할 수 없습니다. uploads 볼륨 권한을 확인하고 web 컨테이너를 재생성해 주세요.'

const DEFAULT_CAMERA_DIAGNOSTICS: CameraDiagnostics = {
  deviceId: '',
  deviceLabel: '연결된 카메라 없음',
  width: 0,
  height: 0,
  frameRate: 0,
  brightness: 0,
  motion: 0,
  lighting: 'unknown',
  framing: 'unknown',
  faceCount: 0,
  faceSupported: false,
  attention: 'unknown',
  faceCenterX: null,
  faceCenterY: null,
  faceRatio: null,
  headYawScore: 0,
  headPitchScore: 0,
  blinkScore: 0,
  connection: 'idle',
  lastUpdatedAt: null,
  issue: '',
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (!hours) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function formatStudyDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours <= 0) {
    return `${minutes}분`
  }

  if (minutes <= 0) {
    return `${hours}시간`
  }

  return `${hours}시간 ${minutes}분`
}

function formatCompactHour(hour: number) {
  return `${String(hour).padStart(2, '0')}시`
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatDateTime(value: string | null) {
  if (!value) return '미동의'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) {
    return '기록 오류'
  }

  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCalendarDay(value: Date) {
  return `${value.getMonth() + 1}/${value.getDate()}`
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.valueOf())) {
    return ''
  }

  const offsetTime = parsed.getTime() - parsed.getTimezoneOffset() * 60_000
  return new Date(offsetTime).toISOString().slice(0, 16)
}

function toIsoFromDateTimeLocal(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.valueOf())) {
    return null
  }

  return parsed.toISOString()
}

function parseCsvInput(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
}

function formatCsvInput(values: string[]) {
  return values.join(', ')
}

function discordSettingsToForm(settings: DiscordBotSettings | null): DiscordBotSettingsForm {
  if (!settings) {
    return EMPTY_DISCORD_BOT_FORM
  }

  return {
    botToken: '',
    clearToken: false,
    clientId: settings.clientId,
    guildIds: formatCsvInput(settings.guildIds),
    adminChannelId: settings.adminChannelId ?? '',
    adminRoleIds: formatCsvInput(settings.adminRoleIds),
    botActorUserId: settings.botActorUserId ?? '',
    registerCommands: settings.registerCommands,
    adminUrl: settings.adminUrl ?? '',
    supportPollMs: settings.supportPollMs,
    healthPollMs: settings.healthPollMs,
    dailySummaryHour: settings.dailySummaryHour,
  }
}

function discordFormToPayload(form: DiscordBotSettingsForm): DiscordBotSettingsUpdate {
  return {
    botToken: form.botToken.trim() || undefined,
    clearToken: form.clearToken,
    clientId: form.clientId.trim(),
    guildIds: parseCsvInput(form.guildIds),
    adminChannelId: form.adminChannelId.trim() || null,
    adminRoleIds: parseCsvInput(form.adminRoleIds),
    botActorUserId: form.botActorUserId.trim() || null,
    registerCommands: form.registerCommands,
    adminUrl: form.adminUrl.trim() || null,
    supportPollMs: form.supportPollMs,
    healthPollMs: form.healthPollMs,
    dailySummaryHour: form.dailySummaryHour,
  }
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getBucketLabel(hour: number) {
  if (hour < 12) return '오전'
  if (hour < 18) return '오후'
  return '저녁'
}

function scoreColor(score: number) {
  if (score >= 85) return '#4f46e5'
  if (score >= 75) return '#6366f1'
  if (score >= 65) return '#f59e0b'
  return '#ef4444'
}

function scoreTone(score: number) {
  if (score >= 80) return 'good'
  if (score >= 65) return 'warn'
  return 'danger'
}

function formatSupportCategory(category: SupportTicketCategory) {
  return (
    {
      inquiry: '일반 문의',
      bug: '오류 제보',
      report: '신고',
      account: '계정 문제',
      other: '기타',
    }[category] ?? '기타'
  )
}

function formatSupportStatus(status: SupportTicketStatus) {
  return (
    {
      open: '접수됨',
      reviewing: '검토 중',
      resolved: '해결됨',
      closed: '종료됨',
    }[status] ?? '접수됨'
  )
}

function supportStatusTone(status: SupportTicketStatus) {
  if (status === 'resolved') return 'good'
  if (status === 'reviewing') return 'subtle'
  if (status === 'closed') return 'warn'
  return 'danger'
}

function discordBotStatusLabel(status: DiscordBotStatus | null) {
  return (
    {
      disabled: '비활성',
      starting: '시작 중',
      running: '실행 중',
      stopping: '중지 중',
      error: '오류',
    }[status?.state ?? 'disabled'] ?? '비활성'
  )
}

function discordBotStatusTone(status: DiscordBotStatus | null) {
  if (status?.state === 'running') return 'good'
  if (status?.state === 'error') return 'danger'
  if (status?.state === 'starting' || status?.state === 'stopping') return 'warn'
  return 'subtle'
}

function announcementState(entry: Announcement) {
  const now = Date.now()
  const startsAt = entry.startsAt ? new Date(entry.startsAt).getTime() : null
  const endsAt = entry.endsAt ? new Date(entry.endsAt).getTime() : null

  if (startsAt && startsAt > now) {
    return { label: '예정 공지', tone: 'subtle' as const }
  }

  if (endsAt && endsAt < now) {
    return { label: '지난 공지', tone: 'warn' as const }
  }

  return { label: '현재 공지', tone: 'good' as const }
}

function buildLinePath(values: number[], width: number, height: number) {
  const points = values.length ? values : [80, 82, 84, 81, 86, 88]
  return points
    .map((value, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
      const y = height - ((value - 40) / 60) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function lastNDates(days: number, offsetDays = 0) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - offsetDays - (days - index - 1))
    date.setHours(0, 0, 0, 0)
    return date
  })
}

function getFocusRangeOption(mode: FocusRangeMode) {
  return FOCUS_RANGE_OPTIONS.find((option) => option.id === mode) ?? FOCUS_RANGE_OPTIONS[0]
}

function isSessionInDateRange(session: StoredSession, dates: Date[]) {
  const start = dates[0]?.getTime() ?? 0
  const endDate = dates.at(-1)

  if (!endDate) {
    return false
  }

  const end = endDate.getTime() + DAY_MS
  const createdAt = new Date(session.createdAt).getTime()
  return createdAt >= start && createdAt < end
}

function formatFocusBarLabel(date: Date, mode: FocusRangeMode) {
  if (mode === 'month') {
    return `${date.getDate()}일`
  }

  return new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(date)
}

function toStoredSession(session: LiveSession): StoredSession {
  return {
    id: session.id,
    createdAt: session.createdAt,
    subject: session.subject,
    mode: session.mode,
    goalMinutes: session.goalMinutes,
    elapsedSeconds: session.elapsedSeconds,
    focusedSeconds: session.focusedSeconds,
    avgScore: Math.round(average(session.timeline)),
    finalScore: session.score,
    timeline: session.timeline,
    tabSwitches: session.tabSwitches,
    idleEvents: session.idleEvents,
    absenceEvents: session.absenceEvents,
    hiddenSeconds: session.hiddenSeconds,
    highestScore: session.highestScore,
    lowestScore: session.lowestScore,
    notes: EMPTY_NOTES,
  }
}

function prependEvent(session: LiveSession, event: SessionEvent) {
  return [event, ...session.events].slice(0, 10)
}

function loadSessionDraft() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_DRAFT_KEY)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as SessionDraft
  } catch {
    window.localStorage.removeItem(SESSION_DRAFT_KEY)
    return null
  }
}

function saveSessionDraft(draft: SessionDraft) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify(draft))
}

function clearSessionDraft() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(SESSION_DRAFT_KEY)
}

function isRestorableScreen(value: string | null, user?: Pick<UserProfile, 'isAdmin'> | null): value is Screen {
  return RESTORABLE_SCREENS.includes(value as Screen) && (value !== 'admin' || Boolean(user?.isAdmin))
}

function loadLastScreen(user?: Pick<UserProfile, 'isAdmin'> | null) {
  if (typeof window === 'undefined') {
    return null
  }

  const saved = window.localStorage.getItem(LAST_SCREEN_KEY)
  return isRestorableScreen(saved, user) ? saved : null
}

function saveLastScreen(screen: Screen) {
  if (typeof window === 'undefined' || !isRestorableScreen(screen)) {
    return
  }

  window.localStorage.setItem(LAST_SCREEN_KEY, screen)
}

function clearLastScreen() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(LAST_SCREEN_KEY)
}

function screenFromPath(
  pathname: string,
  user?: Pick<UserProfile, 'isAdmin'> | null,
  options: { hasLiveSession?: boolean; hasResultSession?: boolean } = {},
) {
  const normalizedPath = pathname === '/' ? '' : pathname.replace(/\/+$/, '')
  const screen = PATH_SCREENS[normalizedPath]

  if (!screen) {
    return null
  }

  if (screen === 'admin' && !user?.isAdmin) {
    return null
  }

  if (screen === 'learning' && !options.hasLiveSession) {
    return 'session-setup'
  }

  if (screen === 'result' && !options.hasResultSession) {
    return 'report'
  }

  return screen
}

function screenToPath(screen: Screen) {
  return SCREEN_PATHS[screen] ?? '/'
}

function buildProfileSyncPayloadKey(profile: UserProfile, settings: AppSettings) {
  return JSON.stringify({
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      dailyGoalHours: profile.dailyGoalHours,
      subjects: profile.subjects,
      authSource: profile.authSource,
      isAdmin: profile.isAdmin,
      consentVersion: profile.consentVersion,
      privacyConsentAt: profile.privacyConsentAt,
      cameraConsentAt: profile.cameraConsentAt,
    },
    settings,
  })
}

function buildScreenUrl(screen: Screen) {
  if (typeof window === 'undefined') {
    return screenToPath(screen)
  }

  const url = new URL(window.location.href)
  url.pathname = screenToPath(screen)
  url.search = ''
  url.hash = ''
  return url.toString()
}

function formatAuthErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''

  if (message.includes('Too many requests')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (message.includes('already registered')) {
    return '이미 가입된 이메일입니다. 로그인으로 진행해 주세요.'
  }

  if (message.includes('Email or password is incorrect')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  }

  return fallback
}

function loadPreferredCameraId() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.localStorage.getItem(CAMERA_DEVICE_KEY) ?? ''
}

function savePreferredCameraId(deviceId: string) {
  if (typeof window === 'undefined') {
    return
  }

  if (!deviceId) {
    window.localStorage.removeItem(CAMERA_DEVICE_KEY)
    return
  }

  window.localStorage.setItem(CAMERA_DEVICE_KEY, deviceId)
}

const PASSWORD_POLICY_MESSAGE =
  '비밀번호는 10자 이상이며 영문 대소문자, 숫자, 특수문자 중 2종류 이상을 포함해야 합니다.'

function isStrongPassword(password: string) {
  const normalized = password.trim()
  const comparable = normalized.toLowerCase().replace(/[^a-z0-9]/g, '')
  const characterClassCount = [
    /[a-z]/.test(normalized),
    /[A-Z]/.test(normalized),
    /\d/.test(normalized),
    /[^A-Za-z0-9]/.test(normalized),
  ].filter(Boolean).length

  return (
    normalized.length >= 10 &&
    normalized.length <= 72 &&
    new Set(normalized).size > 1 &&
    characterClassCount >= 2 &&
    !/^password\d*$/.test(comparable) &&
    !/^qwerty\d*$/.test(comparable) &&
    !/^letmein\d*$/.test(comparable) &&
    !/^admin\d*$/.test(comparable) &&
    !/^welcome\d*$/.test(comparable) &&
    !/^(focusai)+$/.test(comparable)
  )
}

function readResetTokenFromUrl() {
  if (typeof window === 'undefined') {
    return ''
  }

  const hashToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('reset_token')

  return hashToken || new URLSearchParams(window.location.search).get('reset_token') || ''
}

function clearResetTokenFromUrl() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('reset_token')

  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))

    if (hashParams.has('reset_token')) {
      hashParams.delete('reset_token')
      const nextHash = hashParams.toString()
      url.hash = nextHash ? `#${nextHash}` : ''
    }
  }

  window.history.replaceState({}, '', url.toString())
}

function formatCameraConnection(state: CameraConnectionState) {
  return (
    {
      idle: '대기 중',
      active: '정상 연결',
      stalled: '프레임 정체',
      error: '연결 오류',
    }[state] ?? '대기 중'
  )
}

function formatCameraLighting(state: CameraLightingState) {
  return (
    {
      unknown: '측정 전',
      good: '적정 밝기',
      dim: '어두움',
      bright: '너무 밝음',
    }[state] ?? '측정 전'
  )
}

function formatCameraFraming(state: CameraFramingState, faceSupported: boolean) {
  if (!faceSupported && state === 'unsupported') {
    return '브라우저 기본 진단'
  }

  return (
    {
      unknown: '확인 중',
      good: '정상 위치',
      adjust: '위치 조정 필요',
      'not-found': '얼굴 미감지',
      'multi-face': '여러 얼굴 감지',
      unsupported: '기본 확인만 가능',
    }[state] ?? '확인 중'
  )
}

function cameraStatusTone(
  state: CameraConnectionState | CameraLightingState | CameraFramingState,
): 'good' | 'warn' | 'danger' | 'subtle' {
  if (state === 'active' || state === 'good') return 'good'
  if (state === 'stalled' || state === 'dim' || state === 'bright' || state === 'adjust') return 'warn'
  if (state === 'error' || state === 'not-found' || state === 'multi-face') return 'danger'
  return 'subtle'
}

function buildDashboardMetrics(
  sessions: StoredSession[],
  settings: AppSettings,
  focusRangeMode: FocusRangeMode,
) {
  const now = new Date()
  const focusRangeOption = getFocusRangeOption(focusRangeMode)
  const focusRangeDates = lastNDates(focusRangeOption.days, focusRangeOption.offsetDays)
  const focusRangeSessions = sessions.filter((session) => isSessionInDateRange(session, focusRangeDates))
  const last30DayDates = lastNDates(30)
  const last30DaySessions = sessions.filter((session) => isSessionInDateRange(session, last30DayDates))
  const todaySessions = sessions.filter((session) => isSameDay(new Date(session.createdAt), now))
  const recentWeekSessions = sessions.filter((session) => isSessionInDateRange(session, lastNDates(7)))
  const previousWeekSessions = sessions.filter((session) => isSessionInDateRange(session, lastNDates(7, 7)))

  const focusRangeBars = focusRangeDates.map((date) => {
    const daySessions = sessions.filter((session) => isSameDay(new Date(session.createdAt), date))
    return {
      key: date.toISOString(),
      label: formatFocusBarLabel(date, focusRangeMode),
      score: Math.round(average(daySessions.map((session) => session.avgScore))),
      active: focusRangeMode !== 'previous-week' && isSameDay(date, now),
    }
  })

  const subjectStats = Object.entries(
    focusRangeSessions.reduce<Record<string, number[]>>((accumulator, session) => {
      accumulator[session.subject] ??= []
      accumulator[session.subject].push(session.avgScore)
      return accumulator
    }, {}),
  )
    .map(([subject, values]) => ({
      subject,
      score: Math.round(average(values)),
    }))
    .sort((a, b) => b.score - a.score)

  const hourlyCells = Array.from({ length: 12 }, (_, index) => {
    const hour = 9 + index
    const values = focusRangeSessions
      .filter((session) => new Date(session.createdAt).getHours() === hour)
      .map((session) => session.avgScore)
    return { hour, score: Math.round(average(values)) }
  })

  const hourlyStudyCells = Array.from({ length: 24 }, (_, hour) => {
    const hourSessions = focusRangeSessions.filter((session) => new Date(session.createdAt).getHours() === hour)
    const studySeconds = hourSessions.reduce((sum, session) => sum + session.elapsedSeconds, 0)
    const focusedSeconds = hourSessions.reduce((sum, session) => sum + session.focusedSeconds, 0)
    const disturbanceCount = hourSessions.reduce(
      (sum, session) => sum + session.tabSwitches + session.idleEvents + session.absenceEvents,
      0,
    )

    return {
      hour,
      studySeconds,
      focusedSeconds,
      score: Math.round(average(hourSessions.map((session) => session.avgScore))),
      disturbanceCount,
    }
  })

  const maxHourlyStudySeconds = Math.max(...hourlyStudyCells.map((cell) => cell.studySeconds), 1)

  const disturbanceTotals = focusRangeSessions.reduce(
    (accumulator, session) => {
      accumulator.tabSwitches += session.tabSwitches
      accumulator.idleEvents += session.idleEvents
      accumulator.absenceEvents += session.absenceEvents
      return accumulator
    },
    { tabSwitches: 0, idleEvents: 0, absenceEvents: 0 },
  )

  const studyTodaySeconds = todaySessions.reduce((sum, session) => sum + session.elapsedSeconds, 0)
  const weeklyStudySeconds = recentWeekSessions.reduce((sum, session) => sum + session.elapsedSeconds, 0)
  const weeklyFocusedSeconds = recentWeekSessions.reduce((sum, session) => sum + session.focusedSeconds, 0)
  const goalPercent = clamp((studyTodaySeconds / (settings.dailyGoalHours * 3600)) * 100, 0, 100)
  const focusRangeStudySeconds = focusRangeSessions.reduce((sum, session) => sum + session.elapsedSeconds, 0)
  const focusRangeFocusedSeconds = focusRangeSessions.reduce((sum, session) => sum + session.focusedSeconds, 0)
  const last30StudySeconds = last30DaySessions.reduce((sum, session) => sum + session.elapsedSeconds, 0)
  const last30FocusedSeconds = last30DaySessions.reduce((sum, session) => sum + session.focusedSeconds, 0)

  return {
    todaySessions,
    recentWeekSessions,
    studyTodaySeconds,
    avgFocusToday: Math.round(average(todaySessions.map((session) => session.avgScore))),
    weeklyAverage: Math.round(average(recentWeekSessions.map((session) => session.avgScore))),
    weeklyStudySeconds,
    weeklyFocusedSeconds,
    goalPercent,
    focusRange: {
      mode: focusRangeMode,
      label: focusRangeOption.label,
      badge: focusRangeOption.badge,
      sessions: focusRangeSessions,
      average: Math.round(average(focusRangeSessions.map((session) => session.avgScore))),
      studySeconds: focusRangeStudySeconds,
      focusedSeconds: focusRangeFocusedSeconds,
      bars: focusRangeBars,
      calendarLabel: focusRangeDates.length
        ? `${formatCalendarDay(focusRangeDates[0])} - ${formatCalendarDay(focusRangeDates.at(-1)!)}`
        : '',
    },
    last30Days: {
      sessions: last30DaySessions,
      studySeconds: last30StudySeconds,
      focusedSeconds: last30FocusedSeconds,
      average: Math.round(average(last30DaySessions.map((session) => session.avgScore))),
      calendarLabel: `${formatCalendarDay(last30DayDates[0])} - ${formatCalendarDay(last30DayDates.at(-1)!)}`,
    },
    recentSessions: sessions.slice(0, 4),
    subjectStats,
    hourlyCells,
    hourlyStudyCells,
    maxHourlyStudySeconds,
    disturbanceTotals,
    comparison: {
      focus:
        Math.round(average(recentWeekSessions.map((session) => session.avgScore))) -
        Math.round(average(previousWeekSessions.map((session) => session.avgScore))),
      studyMinutes:
        Math.round(weeklyStudySeconds / 60) -
        Math.round(previousWeekSessions.reduce((sum, session) => sum + session.elapsedSeconds, 0) / 60),
      tabSwitches:
        disturbanceTotals.tabSwitches -
        previousWeekSessions.reduce((sum, session) => sum + session.tabSwitches, 0),
    },
  }
}

function buildFeedbackInsights(sessions: StoredSession[], settings: AppSettings) {
  if (!sessions.length) {
    return {
      strongestSubject: '아직 데이터 없음',
      weakestSubject: '아직 데이터 없음',
      bestBucket: '오전',
      weakestBucket: '오후',
      suggestedGoal: settings.dailyGoalHours,
      summary:
        '첫 세션을 실행하면 시간대별 집중 패턴과 방해 요인을 자동으로 분석해서 맞춤 피드백을 만들어 줍니다.',
      strength:
        '현재는 초기 상태입니다. 세션 3개 이상이 쌓이면 강점 시간대와 강한 과목을 자동으로 분리해 보여줍니다.',
      caution:
        '집중도 추적은 탭 전환, 입력 활동, 카메라 상태를 종합해서 계산합니다. 카메라 허용 시 더 안정적인 점수를 확인할 수 있습니다.',
      strategy:
        '세션 결과는 계정 기준으로 동기화되며, 주간 리포트와 과목별 비교는 데이터가 쌓일수록 더 정교해집니다.',
      patterns: [
        { label: '첫 세션 완료', tag: '필요', tone: 'mid' },
        { label: '주간 패턴 분석', tag: '대기', tone: 'low' },
        { label: '과목별 비교', tag: '대기', tone: 'low' },
      ],
    }
  }

  const subjectEntries = Object.entries(
    sessions.reduce<Record<string, number[]>>((accumulator, session) => {
      accumulator[session.subject] ??= []
      accumulator[session.subject].push(session.avgScore)
      return accumulator
    }, {}),
  )
    .map(([subject, values]) => ({ subject, score: Math.round(average(values)) }))
    .sort((a, b) => b.score - a.score)

  const bucketEntries = Object.entries(
    sessions.reduce<Record<string, number[]>>((accumulator, session) => {
      const bucket = getBucketLabel(new Date(session.createdAt).getHours())
      accumulator[bucket] ??= []
      accumulator[bucket].push(session.avgScore)
      return accumulator
    }, {}),
  )
    .map(([bucket, values]) => ({ bucket, score: Math.round(average(values)) }))
    .sort((a, b) => b.score - a.score)

  const averageFocusedHours = average(sessions.map((session) => session.focusedSeconds / 3600))
  const tabSwitches = sessions.reduce((sum, session) => sum + session.tabSwitches, 0)
  const disturbanceCount = sessions.reduce(
    (sum, session) => sum + session.tabSwitches + session.idleEvents + session.absenceEvents,
    0,
  )
  const strongestSubject = subjectEntries[0]?.subject ?? '알고리즘'
  const weakestSubject = subjectEntries.at(-1)?.subject ?? '운영체제'
  const bestBucket = bucketEntries[0]?.bucket ?? '오전'
  const weakestBucket = bucketEntries.at(-1)?.bucket ?? '오후'
  const suggestedGoal = clamp(Math.round(averageFocusedHours + 0.7), 2, 8)

  return {
    strongestSubject,
    weakestSubject,
    bestBucket,
    weakestBucket,
    suggestedGoal,
    summary: `${bestBucket} 시간대에 집중도가 가장 높고, ${weakestBucket} 시간대에 하락하는 패턴이 보입니다. ${strongestSubject}은 안정적으로 잘 풀리고 있으며, 방해 요인은 총 ${disturbanceCount}회 기록되었습니다.`,
    strength: `${bestBucket} 세션 평균 집중도가 가장 높습니다. 어려운 과목은 ${bestBucket}에 배치하는 전략이 잘 맞습니다.`,
    caution: `${weakestSubject} 과목에서 평균 점수가 가장 낮습니다. 특히 ${weakestBucket}에 배치할수록 탭 전환 방해와 입력 공백이 늘어나는 경향이 있습니다.`,
    strategy: `현재 실제 집중 시간 평균은 ${averageFocusedHours.toFixed(1)}시간입니다. 일일 목표를 ${suggestedGoal}시간으로 맞추고, ${weakestBucket}에는 45분 단위 짧은 세션을 추천합니다.`,
    patterns: [
      { label: `${bestBucket} 고집중 유지`, tag: '유지', tone: 'low' },
      { label: `${weakestBucket} 집중 저하`, tag: '관찰', tone: 'high' },
      { label: `탭 전환 방해 ${tabSwitches}회`, tag: '주의', tone: tabSwitches > 0 ? 'high' : 'low' },
      { label: `${weakestSubject} 재배치 필요`, tag: '개선', tone: 'mid' },
    ],
  }
}

function FocusRing({ score, label }: { score: number; label: string }) {
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (circumference * score) / 100

  return (
    <div className="focus-ring-wrap">
      <svg viewBox="0 0 120 120" className="focus-ring-svg" aria-hidden="true">
        <defs>
          <linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
        <circle className="focus-ring-bg" cx="60" cy="60" r={radius} />
        <circle
          className="focus-ring-progress"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="focus-ring-copy">
        <strong>{score}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const path = buildLinePath(values, 320, 120)

  return (
    <svg viewBox="0 0 320 120" className="sparkline" aria-hidden="true">
      <defs>
        <linearGradient id="sparkFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.28)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0)" />
        </linearGradient>
      </defs>
      <path d="M0,70 L320,70" className="sparkline-guide" />
      <path d={path} className="sparkline-line" />
      <path d={`${path} L320,120 L0,120 Z`} className="sparkline-fill" />
    </svg>
  )
}

function WeeklyBars({
  bars,
  compact = false,
}: {
  bars: Array<{ key: string; label: string; score: number; active: boolean }>
  compact?: boolean
}) {
  return (
    <div className={`weekly-bars${compact ? ' compact' : ''}`}>
      {bars.map((bar) => (
        <div key={bar.key} className="weekly-bar-col">
          <div className="weekly-bar-value">{bar.score ? `${bar.score}` : '-'}</div>
          <div className="weekly-bar-track">
            <div
              className={`weekly-bar-fill${bar.active ? ' active' : ''}`}
              style={{ height: `${Math.max(10, bar.score)}%` }}
            />
          </div>
          <div className="weekly-bar-label">{bar.label}</div>
        </div>
      ))}
    </div>
  )
}

function DisturbanceDonut({
  items,
}: {
  items: Array<{ label: string; value: number; color: string }>
}) {
  const safeItems = items.map((item) => ({
    ...item,
    value: Number.isFinite(item.value) && item.value > 0 ? item.value : 0,
  }))
  const total = safeItems.reduce((sum, item) => sum + item.value, 0)
  const hasDisturbanceData = total > 0
  const gradientStops = hasDisturbanceData
    ? safeItems
        .filter((item) => item.value > 0)
        .reduce(
          (accumulator, item) => {
            const from = (accumulator.totalSoFar / total) * 100
            const nextTotal = accumulator.totalSoFar + item.value
            const to = (nextTotal / total) * 100
            return {
              totalSoFar: nextTotal,
              stops: [...accumulator.stops, `${item.color} ${from}% ${to}%`],
            }
          },
          { totalSoFar: 0, stops: [] as string[] },
        )
        .stops.join(', ')
    : ''
  const donutBackground = hasDisturbanceData ? `conic-gradient(${gradientStops})` : '#e2e8f0'

  return (
    <div className="donut-wrap">
      <div className="donut-chart" style={{ background: donutBackground }}>
        <div className="donut-hole" />
      </div>
      <div className="legend-list">
        {safeItems.map((item) => (
          <div key={item.label} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const initialResetToken = readResetTokenFromUrl()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [screen, setScreen] = useState<Screen>('login')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'forgot' | 'reset'>(
    initialResetToken ? 'reset' : 'login',
  )
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  })
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [resetToken, setResetToken] = useState(initialResetToken)
  const [resetPasswordForm, setResetPasswordForm] =
    useState<ResetPasswordForm>(EMPTY_RESET_PASSWORD_FORM)
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConsents, setRegisterConsents] = useState<RegisterConsents>(EMPTY_REGISTER_CONSENTS)
  const [consentRefresh, setConsentRefresh] = useState<RegisterConsents>(EMPTY_REGISTER_CONSENTS)
  const [registerForm, setRegisterForm] = useState<UserProfile>(EMPTY_REGISTER_FORM)
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(EMPTY_PASSWORD_FORM)
  const [accountDeleteForm, setAccountDeleteForm] = useState<AccountDeleteForm>(EMPTY_DELETE_FORM)
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>(DEFAULT_SETTINGS_SECTION)
  const [setup, setSetup] = useState<SessionSetup>(DEFAULT_SETUP)
  const [session, setSession] = useState<LiveSession | null>(null)
  const [cameraPermission, setCameraPermission] = useState<'idle' | 'granted' | 'denied'>('idle')
  const [calibration, setCalibration] = useState({
    permission: false,
    framing: false,
    lighting: false,
  })
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState(() => loadPreferredCameraId())
  const [cameraDiagnostics, setCameraDiagnostics] = useState<CameraDiagnostics>(DEFAULT_CAMERA_DIAGNOSTICS)
  const [cameraErrorDetail, setCameraErrorDetail] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [resultSessionId, setResultSessionId] = useState<string | null>(null)
  const [liveActivityFresh, setLiveActivityFresh] = useState(true)
  const [cameraActive, setCameraActive] = useState(false)
  const [backendHealth, setBackendHealth] = useState<BackendHealth>({
    apiReachable: false,
    mariaEnabled: false,
    mariaReachable: false,
  })
  const [healthChecked, setHealthChecked] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const [appFeedback, setAppFeedback] = useState<AppFeedback | null>(null)
  const [sessionSavePending, setSessionSavePending] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [feedbackInsights, setFeedbackInsights] = useState<FeedbackInsights | null>(null)
  const [feedbackProvider, setFeedbackProvider] = useState<FeedbackProvider | null>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackApiError, setFeedbackApiError] = useState<string | null>(null)
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([])
  const [supportForm, setSupportForm] = useState<SupportTicketForm>(EMPTY_SUPPORT_TICKET_FORM)
  const [supportBusy, setSupportBusy] = useState(false)
  const [subjectDraft, setSubjectDraft] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null)
  const [adminSystem, setAdminSystem] = useState<AdminSystemStatus | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminSection, setAdminSection] = useState<AdminSection>('overview')
  const [adminAnnouncementForm, setAdminAnnouncementForm] =
    useState<AnnouncementForm>(EMPTY_ANNOUNCEMENT_FORM)
  const [adminAnnouncementEditId, setAdminAnnouncementEditId] = useState<string | null>(null)
  const [adminAnnouncementBusy, setAdminAnnouncementBusy] = useState(false)
  const [adminAnnouncementDeleteId, setAdminAnnouncementDeleteId] = useState<string | null>(null)
  const [adminRoleBusyUserId, setAdminRoleBusyUserId] = useState<string | null>(null)
  const [adminUserSearch, setAdminUserSearch] = useState('')
  const [adminUserRoleFilter, setAdminUserRoleFilter] = useState<'all' | 'admin' | 'member'>('all')
  const [adminUserActivityFilter, setAdminUserActivityFilter] = useState<'all' | '7d' | '30d' | 'none'>('all')
  const [adminSessionSearch, setAdminSessionSearch] = useState('')
  const [adminSessionSubjectFilter, setAdminSessionSubjectFilter] = useState('all')
  const [adminSessionWindow, setAdminSessionWindow] = useState<'7d' | '30d' | 'all'>('30d')
  const [adminSessionScoreFilter, setAdminSessionScoreFilter] =
    useState<'all' | 'high' | 'mid' | 'low'>('all')
  const [adminSupportSearch, setAdminSupportSearch] = useState('')
  const [adminSupportStatusFilter, setAdminSupportStatusFilter] =
    useState<'all' | SupportTicketStatus>('all')
  const [adminSupportBusyTicketId, setAdminSupportBusyTicketId] = useState<string | null>(null)
  const [adminSupportDrafts, setAdminSupportDrafts] = useState<
    Record<string, { status: SupportTicketStatus; adminReply: string }>
  >({})
  const [discordBotSettings, setDiscordBotSettings] = useState<DiscordBotSettings | null>(null)
  const [discordBotStatus, setDiscordBotStatus] = useState<DiscordBotStatus | null>(null)
  const [discordBotForm, setDiscordBotForm] = useState<DiscordBotSettingsForm>(EMPTY_DISCORD_BOT_FORM)
  const [discordBotBusy, setDiscordBotBusy] = useState(false)
  const [lostarkDiscordBotSettings, setLostarkDiscordBotSettings] = useState<DiscordBotSettings | null>(null)
  const [lostarkDiscordBotStatus, setLostarkDiscordBotStatus] = useState<DiscordBotStatus | null>(null)
  const [lostarkDiscordBotForm, setLostarkDiscordBotForm] =
    useState<DiscordBotSettingsForm>(EMPTY_DISCORD_BOT_FORM)
  const [lostarkDiscordBotBusy, setLostarkDiscordBotBusy] = useState(false)
  const [focusRangeMode, setFocusRangeMode] = useState<FocusRangeMode>('current-week')
  const [focusTrackingSummary, setFocusTrackingSummary] =
    useState<FocusTrackingSummary>(DEFAULT_FOCUS_TRACKING_SUMMARY)
  const [clockNow, setClockNow] = useState(() => Date.now())

  const calibrationVideoRef = useRef<HTMLVideoElement | null>(null)
  const learningVideoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sessionRef = useRef<LiveSession | null>(null)
  const lastActivityRef = useRef(0)
  const lastTickRef = useRef(0)
  const hiddenSinceRef = useRef<number | null>(null)
  const blurredSinceRef = useRef<number | null>(null)
  const idleTriggeredRef = useRef(false)
  const reminderBucketRef = useRef(0)
  const completeSessionRef = useRef<(reason: 'manual' | 'goal') => void>(() => undefined)
  const restoredDraftUserIdRef = useRef<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const wakeLockRef = useRef<{ released?: boolean; release?: () => Promise<void> } | null>(null)
  const reportExportRef = useRef<HTMLDivElement | null>(null)
  const diagnosticsCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previousFrameSamplesRef = useRef<number[] | null>(null)
  const stalledSampleCountRef = useRef(0)
  const cameraAbsenceSinceRef = useRef<number | null>(null)
  const cameraAbsenceLoggedRef = useRef(false)
  const historyNavigationRef = useRef(false)
  const lastHistoryScreenRef = useRef<Screen | null>(null)
  const lastSyncedProfilePayloadRef = useRef<string | null>(null)
  const focusTrackerRef = useRef<FocusTrackingState>(createFocusTracker())

  const dashboardMetrics = buildDashboardMetrics(sessions, settings, focusRangeMode)
  const localFeedbackInsights = buildFeedbackInsights(sessions, settings)
  const resolvedFeedbackInsights = feedbackInsights ?? localFeedbackInsights
  const resultSession = sessions.find((entry) => entry.id === resultSessionId) ?? sessions[0] ?? null
  const subjectOptions = user?.subjects.length ? user.subjects : [FALLBACK_SESSION_SUBJECT]
  const needsConsentRefresh = Boolean(user && user.consentVersion !== CONSENT_VERSION)
  const disturbanceItems = [
    { label: '탭 전환', value: dashboardMetrics.disturbanceTotals.tabSwitches, color: '#4f46e5' },
    { label: '입력 비활성', value: dashboardMetrics.disturbanceTotals.idleEvents, color: '#f59e0b' },
    { label: '자리 비움', value: dashboardMetrics.disturbanceTotals.absenceEvents, color: '#ef4444' },
  ]
  const cameraReady = cameraPermission === 'granted' && cameraActive
  const cameraAttentionStable =
    cameraDiagnostics.attention === 'focused' || cameraDiagnostics.attention === 'reading'
  const cameraFaceReliable = cameraAttentionStable
  const cameraSubjectMissing = cameraReady && cameraDiagnostics.attention === 'away'
  const cameraSubjectUnstable =
    cameraReady &&
    (cameraDiagnostics.attention === 'distracted' ||
      cameraDiagnostics.framing === 'adjust' ||
      cameraDiagnostics.framing === 'multi-face')
  const cameraPresenceLabel = cameraSubjectMissing
    ? '자리 비움'
    : cameraSubjectUnstable
      ? '위치 조정 필요'
      : cameraFaceReliable
        ? '정상 감지'
        : cameraReady
          ? '기본 감지'
          : '미연결'
  const cameraResolutionLabel =
    cameraDiagnostics.width && cameraDiagnostics.height
      ? `${cameraDiagnostics.width} x ${cameraDiagnostics.height}`
      : '측정 전'
  const cameraFrameRateLabel = cameraDiagnostics.frameRate ? `${cameraDiagnostics.frameRate.toFixed(1)} fps` : '측정 전'
  const backendReady = isBackendServiceReady(backendHealth)
  const runtimeMode = getRuntimeMode()
  const isLocalRuntime = runtimeMode.kind === 'local'
  const runtimeConnectionLabel = backendReady ? 'API 정상' : healthChecked ? 'API 점검' : 'API 확인 중'
  const discordBotTokenStorageReady = discordBotSettings?.tokenStorageReady ?? true
  const lostarkDiscordBotTokenStorageReady = lostarkDiscordBotSettings?.tokenStorageReady ?? true
  const wakeLockSupported =
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<unknown> } }).wakeLock
      ?.request === 'function'
  const feedbackRequestKey = [
    user?.id ?? 'guest',
    sessions.length,
    sessions[0]?.id ?? 'none',
    settings.dailyGoalHours,
    settings.idleThresholdSeconds,
    settings.focusAlert ? '1' : '0',
    settings.breakReminder ? '1' : '0',
    settings.saveRawVideo ? '1' : '0',
    settings.defaultSessionMinutes,
    settings.defaultSessionMode,
  ].join(':')
  const adminSubjectOptions = Array.from(
    new Set((adminOverview?.sessions ?? []).map((entry) => entry.subject)),
  ).sort((left, right) => left.localeCompare(right, 'ko-KR'))
  const filteredAdminUsers = (adminOverview?.users ?? []).filter((entry) => {
    const search = adminUserSearch.trim().toLowerCase()
    const lastSessionAge = entry.lastSessionAt ? clockNow - new Date(entry.lastSessionAt).getTime() : null
    const roleMatched =
      adminUserRoleFilter === 'all' ||
      (adminUserRoleFilter === 'admin' ? entry.isAdmin : !entry.isAdmin)
    const activityMatched =
      adminUserActivityFilter === 'all' ||
      (adminUserActivityFilter === 'none'
        ? !entry.lastSessionAt
        : lastSessionAge !== null &&
          lastSessionAge <= (adminUserActivityFilter === '7d' ? 7 : 30) * DAY_MS)
    const searchMatched =
      !search ||
      entry.name.toLowerCase().includes(search) ||
      entry.email.toLowerCase().includes(search) ||
      entry.subjects.some((subject) => subject.toLowerCase().includes(search))

    return roleMatched && activityMatched && searchMatched
  })
  const filteredAdminSessions = (adminOverview?.sessions ?? []).filter((entry) => {
    const search = adminSessionSearch.trim().toLowerCase()
    const subjectMatched = adminSessionSubjectFilter === 'all' || entry.subject === adminSessionSubjectFilter
    const scoreMatched =
      adminSessionScoreFilter === 'all' ||
      (adminSessionScoreFilter === 'high'
        ? entry.avgScore >= 85
        : adminSessionScoreFilter === 'mid'
          ? entry.avgScore >= 70 && entry.avgScore < 85
          : entry.avgScore < 70)
    const windowMatched =
      adminSessionWindow === 'all' ||
      clockNow - new Date(entry.createdAt).getTime() <=
        (adminSessionWindow === '7d' ? 7 : 30) * DAY_MS
    const searchMatched =
      !search ||
      entry.subject.toLowerCase().includes(search) ||
      entry.mode.toLowerCase().includes(search) ||
      entry.userName.toLowerCase().includes(search) ||
      entry.userEmail.toLowerCase().includes(search)

    return subjectMatched && scoreMatched && windowMatched && searchMatched
  })
  const filteredAdminSupportTickets = (adminOverview?.supportTickets ?? []).filter((entry) => {
    const search = adminSupportSearch.trim().toLowerCase()
    const statusMatched = adminSupportStatusFilter === 'all' || entry.status === adminSupportStatusFilter
    const searchMatched =
      !search ||
      entry.subject.toLowerCase().includes(search) ||
      entry.body.toLowerCase().includes(search) ||
      entry.userName.toLowerCase().includes(search) ||
      entry.userEmail.toLowerCase().includes(search)

    return statusMatched && searchMatched
  })

  const updateDailyGoalHours = useCallback((nextValue: number) => {
    const nextHours = clamp(nextValue || 1, 1, 8)
    setSettings((current) => ({ ...current, dailyGoalHours: nextHours }))
    setUser((current) => (current ? { ...current, dailyGoalHours: nextHours } : current))
  }, [])

  const updateDisplayName = useCallback((nextValue: string) => {
    const trimmed = nextValue.slice(0, 120)
    setUser((current) => (current ? { ...current, name: trimmed } : current))
  }, [])

  const updateSubjectsFromInput = useCallback((nextValue: string) => {
    const normalized = nextValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, 20)
    setUser((current) =>
      current
        ? {
            ...current,
            subjects: normalized,
          }
        : current,
    )
    setSetup((current) => ({
      ...current,
      subject: normalized.includes(current.subject) ? current.subject : (normalized[0] ?? FALLBACK_SESSION_SUBJECT),
    }))
  }, [])

  const addPreferredSubject = useCallback((subject: string) => {
    const trimmed = subject.trim()
    if (!trimmed) {
      return
    }

    setUser((current) => {
      if (!current) {
        return current
      }

      if (current.subjects.includes(trimmed) || current.subjects.length >= 20) {
        return current
      }

      return {
        ...current,
        subjects: [...current.subjects, trimmed],
      }
    })
  }, [])

  const removePreferredSubject = useCallback((subject: string) => {
    setUser((current) =>
      current
        ? {
            ...current,
            subjects: current.subjects.filter((item) => item !== subject),
          }
        : current,
    )
    setSetup((current) =>
      current.subject === subject
        ? {
            ...current,
            subject: user?.subjects.find((item) => item !== subject) ?? FALLBACK_SESSION_SUBJECT,
          }
        : current,
    )
  }, [user?.subjects])

  const playAlertTone = useCallback((tone: 'warn' | 'break' | 'goal') => {
    if (!settings.soundAlerts || typeof window === 'undefined') {
      return
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) {
      return
    }

    const context = audioContextRef.current ?? new AudioContextCtor()
    audioContextRef.current = context

    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }

    const oscillator = context.createOscillator()
    const gainNode = context.createGain()
    const profile = {
      warn: { frequency: 392, duration: 0.18, volume: 0.045 },
      break: { frequency: 523.25, duration: 0.2, volume: 0.05 },
      goal: { frequency: 659.25, duration: 0.26, volume: 0.06 },
    }[tone]

    oscillator.type = tone === 'warn' ? 'sawtooth' : 'sine'
    oscillator.frequency.value = profile.frequency
    gainNode.gain.setValueAtTime(0.0001, context.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(profile.volume, context.currentTime + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + profile.duration)
    oscillator.connect(gainNode)
    gainNode.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + profile.duration)
  }, [settings.soundAlerts])

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current
    wakeLockRef.current = null

    if (!wakeLock?.release) {
      return
    }

    await wakeLock.release().catch(() => undefined)
  }, [])

  function getServiceBlockingReason(health: BackendHealth) {
    if (!health.apiReachable) {
      return '서비스 서버에 연결할 수 없습니다.'
    }

    if (!health.mariaEnabled) {
      return '서버의 MariaDB 구성이 완료되지 않았습니다.'
    }

    if (!health.mariaReachable) {
      return 'MariaDB 연결 상태를 확인해 주세요.'
    }

    return null
  }

  const refreshBackendHealth = useCallback(async () => {
    const nextHealth = await getApiHealth()
    setBackendHealth(nextHealth)
    setHealthChecked(true)
    return nextHealth
  }, [])

  const applyBootstrap = useCallback((bootstrap: BackendBootstrap, navigationMode: BootstrapNavigationMode = 'restore') => {
    const status = bootstrap.status

    if (status) {
      setBackendHealth((current) => ({
        ...current,
        mariaEnabled: status.mariaEnabled,
      }))
    }

    if (!bootstrap.profile) {
      const pendingResetToken = readResetTokenFromUrl() || resetToken

      setUser(null)
      setSettings(DEFAULT_SETTINGS)
      setSetup(DEFAULT_SETUP)
      setSessions([])
      setResultSessionId(null)
      setSession(null)
      sessionRef.current = null
      setRegisterForm(EMPTY_REGISTER_FORM)
      setRegisterConsents(EMPTY_REGISTER_CONSENTS)
      setConsentRefresh(EMPTY_REGISTER_CONSENTS)
      setForgotPasswordEmail('')
      setResetToken(pendingResetToken)
      setResetPasswordForm(EMPTY_RESET_PASSWORD_FORM)
      setAuthTab(pendingResetToken ? 'reset' : 'login')
      setPasswordForm(EMPTY_PASSWORD_FORM)
      setAccountDeleteForm(EMPTY_DELETE_FORM)
      setActiveSettingsSection(DEFAULT_SETTINGS_SECTION)
      setFeedbackInsights(null)
      setFeedbackProvider(null)
      setFeedbackApiError(null)
      setSupportTickets([])
      setSupportForm(EMPTY_SUPPORT_TICKET_FORM)
      setSupportBusy(false)
      setAdminOverview(null)
      setAdminSystem(null)
      setAdminError(null)
      setAdminSection('overview')
      setAdminAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM)
      setAdminAnnouncementEditId(null)
      setAdminAnnouncementBusy(false)
      setAdminAnnouncementDeleteId(null)
      setAdminRoleBusyUserId(null)
      setAdminSupportSearch('')
      setAdminSupportStatusFilter('all')
      setAdminSupportBusyTicketId(null)
      setAdminSupportDrafts({})
      setDiscordBotSettings(null)
      setDiscordBotStatus(null)
      setDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
      setDiscordBotBusy(false)
      setLostarkDiscordBotSettings(null)
      setLostarkDiscordBotStatus(null)
      setLostarkDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
      setLostarkDiscordBotBusy(false)
      setAdminUserSearch('')
      setAdminUserRoleFilter('all')
      setAdminUserActivityFilter('all')
      setAdminSessionSearch('')
      setAdminSessionSubjectFilter('all')
      setAdminSessionWindow('30d')
      setAdminSessionScoreFilter('all')
      setAppError(null)
      lastHistoryScreenRef.current = null
      lastSyncedProfilePayloadRef.current = null
      clearLastScreen()
      if (!pendingResetToken && typeof window !== 'undefined') {
        window.history.replaceState({ screen: 'login' }, '', buildScreenUrl('login'))
      }
      setScreen('login')
      return
    }

    const profile = bootstrap.profile
    const nextSettings = bootstrap.settings ?? {
      ...DEFAULT_SETTINGS,
      dailyGoalHours: profile.dailyGoalHours,
    }
    lastSyncedProfilePayloadRef.current = buildProfileSyncPayloadKey(profile, nextSettings)

    setUser(profile)
    setRegisterForm(profile)
    setRegisterConsents(EMPTY_REGISTER_CONSENTS)
    setConsentRefresh(EMPTY_REGISTER_CONSENTS)
    setLoginForm({ email: profile.email, password: '' })
    setForgotPasswordEmail(profile.email)
    setResetToken('')
    setResetPasswordForm(EMPTY_RESET_PASSWORD_FORM)
    setAuthTab('login')
    setSettings(nextSettings)
    setSetup((current) => ({
      ...current,
      subject: profile.subjects[0] ?? FALLBACK_SESSION_SUBJECT,
      durationMinutes: nextSettings.defaultSessionMinutes,
      mode: nextSettings.defaultSessionMode,
    }))
    setSessions(bootstrap.sessions)
    setResultSessionId(bootstrap.sessions[0]?.id ?? null)
    setPasswordForm(EMPTY_PASSWORD_FORM)
    setAccountDeleteForm(EMPTY_DELETE_FORM)
    setFeedbackApiError(null)
    setFeedbackProvider(null)
    setSupportForm(EMPTY_SUPPORT_TICKET_FORM)
    setAdminOverview(null)
    setAdminSystem(null)
    setAdminError(null)
    setAdminAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM)
    setAdminAnnouncementEditId(null)
    setAdminAnnouncementBusy(false)
    setAdminSupportSearch('')
    setAdminSupportStatusFilter('all')
    setAdminSupportBusyTicketId(null)
    setAdminSupportDrafts({})
    setDiscordBotSettings(null)
    setDiscordBotStatus(null)
    setDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
    setDiscordBotBusy(false)
    setLostarkDiscordBotSettings(null)
    setLostarkDiscordBotStatus(null)
    setLostarkDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
    setLostarkDiscordBotBusy(false)
    setAppError(null)
    setScreen((current) => {
      if (current === 'admin' && !bootstrap.profile?.isAdmin) {
        return 'dashboard'
      }

      if (current !== 'login') {
        return current
      }

      if (navigationMode === 'camera') {
        return cameraReady ? 'dashboard' : 'camera'
      }

      return (
        screenFromPath(window.location.pathname, bootstrap.profile, {
          hasLiveSession: Boolean(sessionRef.current),
          hasResultSession: Boolean(bootstrap.sessions.length),
        }) ??
        loadLastScreen(bootstrap.profile) ??
        'dashboard'
      )
    })
  }, [cameraReady, resetToken])

  const hydrateFromServer = useCallback(async () => {
    const bootstrap = await fetchBootstrapFromApi()
    applyBootstrap(bootstrap)
    return bootstrap
  }, [applyBootstrap])

  const refreshActiveAnnouncement = useCallback(async () => {
    const response = await fetchActiveAnnouncementFromApi()
    setActiveAnnouncement(response.announcement)
    return response.announcement
  }, [])

  const refreshAnnouncements = useCallback(async () => {
    const response = await fetchAnnouncementsFromApi()
    setAnnouncements(response.announcements)
    return response.announcements
  }, [])

  const refreshSupportTickets = useCallback(async () => {
    if (!user) {
      setSupportTickets([])
      return []
    }

    const response = await fetchSupportTicketsFromApi()
    setSupportTickets(response.tickets)
    return response.tickets
  }, [user])

  const refreshAdminWorkspace = useCallback(async () => {
    return fetchAdminOverviewFromApi()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now())
    }, 60_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const nextScreen = screenFromPath(window.location.pathname, user, {
        hasLiveSession: Boolean(sessionRef.current),
        hasResultSession: Boolean(resultSession),
      })

      if (!user || !nextScreen) {
        return
      }

      historyNavigationRef.current = true
      setScreen(nextScreen)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [resultSession, user])

  useEffect(() => {
    if (!user || !SCREEN_PATHS[screen]) {
      return
    }

    if (isRestorableScreen(screen, user)) {
      saveLastScreen(screen)
    }

    const nextState = {
      ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
      screen,
    }
    const nextUrl = buildScreenUrl(screen)

    if (lastHistoryScreenRef.current === null) {
      window.history.replaceState(nextState, '', nextUrl)
    } else if (historyNavigationRef.current) {
      window.history.replaceState(nextState, '', nextUrl)
      historyNavigationRef.current = false
    } else if (lastHistoryScreenRef.current !== screen) {
      window.history.pushState(nextState, '', nextUrl)
    }

    lastHistoryScreenRef.current = screen
  }, [screen, user])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void (async () => {
        const nextHealth = await refreshBackendHealth()

        if (active && nextHealth.apiReachable) {
          try {
            await hydrateFromServer()
          } catch {
            if (active) {
              setAppError('계정 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
            }
          }
        }

        if (active) {
          setAuthReady(true)
        }
      })().catch(() => {
        if (active) {
          setAuthReady(true)
        }
      })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [hydrateFromServer, refreshBackendHealth])

  useEffect(() => {
    if (!healthChecked || backendReady) {
      return
    }

    let active = true
    const retryBackendHealth = async () => {
      const nextHealth = await refreshBackendHealth()

      if (!active || !isBackendServiceReady(nextHealth)) {
        return
      }

      try {
        await hydrateFromServer()
      } catch {
        if (active) {
          setAppError('계정 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
        }
      }
    }
    const backendHealthRetryTimer = window.setInterval(() => {
      void retryBackendHealth()
    }, BACKEND_HEALTH_RETRY_MS)

    void retryBackendHealth()

    return () => {
      active = false
      window.clearInterval(backendHealthRetryTimer)
    }
  }, [backendReady, healthChecked, hydrateFromServer, refreshBackendHealth])

  useEffect(() => {
    let active = true

    void fetchActiveAnnouncementFromApi()
      .then((response) => {
        if (active) {
          setActiveAnnouncement(response.announcement)
        }
      })
      .catch(() => {
        if (active) {
          setActiveAnnouncement(null)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    void fetchAnnouncementsFromApi()
      .then((response) => {
        if (active) {
          setAnnouncements(response.announcements)
        }
      })
      .catch(() => {
        if (active) {
          setAnnouncements([])
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!user || !backendReady) {
      return
    }

    let active = true

    void fetchSupportTicketsFromApi()
      .then((response) => {
        if (active) {
          setSupportTickets(response.tickets)
        }
      })
      .catch(() => {
        if (active) {
          setSupportTickets([])
        }
      })

    return () => {
      active = false
    }
  }, [backendReady, user])

  useEffect(() => {
    if (!user) {
      return
    }

    if (!user.name.trim()) {
      return
    }

    const syncPayloadKey = buildProfileSyncPayloadKey(user, settings)
    if (lastSyncedProfilePayloadRef.current === syncPayloadKey) {
      return
    }

    const timer = window.setTimeout(() => {
      if (backendReady) {
        void syncProfileToApi(user, settings)
          .then(() => {
            lastSyncedProfilePayloadRef.current = syncPayloadKey
          })
          .catch(() => {
            setAppError('프로필 저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
          })
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [backendReady, settings, user])

  useEffect(() => {
    if (!user || !backendReady || screen !== 'feedback') {
      return
    }

    let active = true
    const loadingTimer = window.setTimeout(() => {
      if (!active) {
        return
      }

      setFeedbackLoading(true)
      setFeedbackApiError(null)
    }, 0)

    void fetchAiFeedbackFromApi()
      .then((response) => {
        if (!active) {
          return
        }

        setFeedbackInsights(response.insights)
        setFeedbackProvider({
          source: response.source,
          model: response.model,
        })
      })
      .catch((error) => {
        if (!active) {
          return
        }

        setFeedbackApiError(
          error instanceof Error ? error.message : 'AI feedback is temporarily unavailable.',
        )
        setFeedbackInsights(null)
        setFeedbackProvider(null)
      })
      .finally(() => {
        if (active) {
          setFeedbackLoading(false)
        }
      })

    return () => {
      active = false
      window.clearTimeout(loadingTimer)
    }
  }, [backendReady, feedbackRequestKey, screen, user])

  useEffect(() => {
    if (!user?.isAdmin || !backendReady || screen !== 'admin') {
      return
    }

    let active = true
    const loadingTimer = window.setTimeout(() => {
      if (!active) {
        return
      }

      setAdminLoading(true)
      setAdminError(null)
    }, 0)

    void Promise.all([
      refreshAdminWorkspace(),
      fetchDiscordBotAdminStateFromApi(),
      fetchLostarkDiscordBotAdminStateFromApi(),
    ])
      .then(([response, discordResponse, lostarkDiscordResponse]) => {
        if (!active) {
          return
        }

        setAdminOverview(response.overview)
        setAdminSystem(response.system)
        setDiscordBotSettings(discordResponse.settings)
        setDiscordBotStatus(discordResponse.status)
        setDiscordBotForm(discordSettingsToForm(discordResponse.settings))
        setLostarkDiscordBotSettings(lostarkDiscordResponse.settings)
        setLostarkDiscordBotStatus(lostarkDiscordResponse.status)
        setLostarkDiscordBotForm(discordSettingsToForm(lostarkDiscordResponse.settings))
      })
      .catch((error) => {
        if (!active) {
          return
        }

        setAdminError(error instanceof Error ? error.message : 'Failed to load admin data.')
      })
      .finally(() => {
        if (active) {
          setAdminLoading(false)
        }
      })

    return () => {
      active = false
      window.clearTimeout(loadingTimer)
    }
  }, [backendReady, refreshAdminWorkspace, screen, user])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    if (!user) {
      return
    }

    if (!settings.autoResumeSession) {
      clearSessionDraft()
      return
    }

    if (!session) {
      if (restoredDraftUserIdRef.current !== user.id) {
        return
      }

      clearSessionDraft()
      return
    }

    saveSessionDraft({
      userId: user.id,
      session,
      setup,
      isPaused,
      savedAt: Date.now(),
    })
  }, [isPaused, session, settings.autoResumeSession, setup, user])

  useEffect(() => {
    if (!user) {
      restoredDraftUserIdRef.current = null
      return
    }

    if (!settings.autoResumeSession) {
      restoredDraftUserIdRef.current = user.id
      clearSessionDraft()
      return
    }

    if (session || restoredDraftUserIdRef.current === user.id) {
      return
    }

    restoredDraftUserIdRef.current = user.id

    const draft = loadSessionDraft()

    if (!draft || draft.userId !== user.id) {
      return
    }

    if (Date.now() - draft.savedAt > SESSION_DRAFT_MAX_AGE_MS) {
      clearSessionDraft()
      return
    }

    lastTickRef.current = Date.now()
    lastActivityRef.current = Date.now()
    hiddenSinceRef.current = null
    idleTriggeredRef.current = false
    reminderBucketRef.current = 0

    const timer = window.setTimeout(() => {
      setSetup(draft.setup)
      setSession(draft.session)
      setIsPaused(draft.isPaused)
      setShowEndModal(false)
      setScreen('learning')
      setAppError(null)
      setAppFeedback({
        tone: 'good',
        text: '브라우저에 임시 저장된 학습 세션을 복구했습니다.',
      })
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [session, settings.autoResumeSession, user])

  useEffect(() => {
    completeSessionRef.current = (reason: 'manual' | 'goal' = 'manual') => {
      const activeSession = sessionRef.current
      if (!activeSession) return

      const completed = toStoredSession(activeSession)
      setSession(null)
      sessionRef.current = null
      setIsPaused(false)
      setShowEndModal(false)
      setResultSessionId(completed.id)
      setSessions((current) => mergeRecentSession(current, completed))
      setScreen('result')

      if (!user || !backendReady) {
        setAppError(SESSION_SAVE_OFFLINE_MESSAGE)
        return
      }

      setSessionSavePending(true)

      void saveSessionToApi({
        profile: user,
        settings,
        session: completed,
        events: activeSession.events,
        })
        .then((response) => {
          setSessions((current) => mergeRecentSession(current, response.session))
          clearSessionDraft()
          setAppError(null)
        })
        .catch(() => {
          setAppError(SESSION_SAVE_FAILURE_MESSAGE)
        })
        .finally(() => {
          setSessionSavePending(false)
        })

      if (reason === 'goal') {
        playAlertTone('goal')
        window.setTimeout(() => {
          alert('목표 시간이 완료되어 세션이 자동 저장되었습니다.')
        }, 0)
      }
    }
  }, [backendReady, playAlertTone, settings, user])

  useEffect(() => {
    const stream = streamRef.current
    setCameraActive(Boolean(stream?.active))

    for (const video of [calibrationVideoRef.current, learningVideoRef.current]) {
      if (!video || !stream) continue
      if (video.srcObject !== stream) {
        video.srcObject = stream
        void video.play().catch(() => undefined)
      }
    }
  }, [cameraPermission, screen, session?.id])

  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `카메라 ${index + 1}`,
        }))

      setCameraDevices(videoDevices)
      setSelectedCameraId((current) => {
        if (current && videoDevices.some((device) => device.deviceId === current)) {
          return current
        }

        return videoDevices[0]?.deviceId ?? ''
      })
    } catch {
      setCameraDevices([])
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void refreshCameraDevices()
    }, 0)

    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.addEventListener) {
      return () => window.clearTimeout(timerId)
    }

    const handleDeviceChange = () => {
      void refreshCameraDevices()
    }

    mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      window.clearTimeout(timerId)
      mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [refreshCameraDevices])

  useEffect(() => {
    savePreferredCameraId(selectedCameraId)
  }, [selectedCameraId])

  useEffect(() => {
    const stream = streamRef.current
    const track = stream?.getVideoTracks()[0]

    if (!stream || !track) {
      previousFrameSamplesRef.current = null
      stalledSampleCountRef.current = 0
      cameraAbsenceSinceRef.current = null
      cameraAbsenceLoggedRef.current = false
      setCameraDiagnostics((current) => ({
        ...current,
        attention: 'unknown',
        faceCenterX: null,
        faceCenterY: null,
        faceRatio: null,
        headYawScore: 0,
        headPitchScore: 0,
        blinkScore: 0,
        connection: cameraPermission === 'denied' ? 'error' : 'idle',
        lastUpdatedAt: null,
        issue: cameraPermission === 'denied' ? '브라우저에서 카메라 권한이 필요합니다.' : '',
      }))
      return
    }

    let active = true
    let timerId = 0
    let reading = false
    let studyVisionLoaded = false
    let studyVisionRunner: Awaited<ReturnType<typeof loadStudyVision>> = null

    const getStudyVision = async () => {
      if (!studyVisionLoaded) {
        studyVisionRunner = await loadStudyVision()
        studyVisionLoaded = true
      }

      return studyVisionRunner
    }

    const measure = async () => {
      if (!active || reading) {
        return
      }

      const video =
        (screen === 'learning' ? learningVideoRef.current : calibrationVideoRef.current) ??
        calibrationVideoRef.current ??
        learningVideoRef.current

      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        timerId = window.setTimeout(() => {
          void measure()
        }, 700)
        return
      }

      reading = true

      try {
        const canvas = diagnosticsCanvasRef.current ?? document.createElement('canvas')
        diagnosticsCanvasRef.current = canvas
        const context = canvas.getContext('2d', { willReadFrequently: true })

        if (!context) {
          return
        }

        const sampleWidth = 64
        const sampleHeight = 48
        canvas.width = sampleWidth
        canvas.height = sampleHeight
        context.drawImage(video, 0, 0, sampleWidth, sampleHeight)

        const frame = context.getImageData(0, 0, sampleWidth, sampleHeight).data
        const currentSamples: number[] = []
        let brightnessAccumulator = 0

        for (let index = 0; index < frame.length; index += 16) {
          const red = frame[index]
          const green = frame[index + 1]
          const blue = frame[index + 2]
          const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
          currentSamples.push(luminance)
          brightnessAccumulator += luminance
        }

        const brightness = currentSamples.length
          ? Math.round((brightnessAccumulator / currentSamples.length / 255) * 100)
          : 0
        const previousSamples = previousFrameSamplesRef.current
        previousFrameSamplesRef.current = currentSamples

        let motion = 0
        if (previousSamples?.length === currentSamples.length) {
          let diffTotal = 0
          for (let index = 0; index < currentSamples.length; index += 1) {
            diffTotal += Math.abs(currentSamples[index] - previousSamples[index])
          }
          motion = Math.round((diffTotal / currentSamples.length / 255) * 100)
        }

        let lighting: CameraLightingState = 'good'
        if (brightness < 24) lighting = 'dim'
        if (brightness > 84) lighting = 'bright'

        const studyVision = await getStudyVision()
        const studyVisionResult = analyzeStudyVision(studyVision, video, Date.now())
        const framing = studyVisionResult.framing as CameraFramingState
        const faceCount = studyVisionResult.faceCount

        const connection =
          !stream.active || track.readyState !== 'live'
            ? 'error'
            : motion <= 1
              ? stalledSampleCountRef.current >= 2
                ? 'stalled'
                : 'active'
              : 'active'

        if (motion <= 1) {
          stalledSampleCountRef.current += 1
        } else {
          stalledSampleCountRef.current = 0
        }

        const settings = track.getSettings()
        const deviceId = settings.deviceId ?? selectedCameraId
        const linkedLabel =
          cameraDevices.find((device) => device.deviceId === deviceId)?.label || track.label || '연결된 카메라'

        const issueMessages: string[] = []
        if (!studyVision) issueMessages.push(VISION_MODEL_FALLBACK_MESSAGE)
        if (studyVisionResult.issue) issueMessages.push(studyVisionResult.issue)
        if (lighting === 'dim') issueMessages.push('조명이 어두워서 측정 정확도가 낮아질 수 있습니다.')
        if (lighting === 'bright') issueMessages.push('배경이나 조명이 너무 밝아 얼굴 윤곽이 날아갈 수 있습니다.')
        if (framing === 'adjust') issueMessages.push('얼굴을 화면 중앙에 조금 더 맞춰 주세요.')
        if (framing === 'not-found') issueMessages.push('얼굴이 화면에 잘 보이도록 카메라 각도를 조정해 주세요.')
        if (framing === 'multi-face') issueMessages.push('한 명만 화면에 보이도록 정리해 주세요.')
        if (connection === 'stalled') issueMessages.push('프레임 변화가 거의 없어 카메라가 멈춘 것처럼 보입니다.')

        setCameraDiagnostics({
          deviceId,
          deviceLabel: linkedLabel,
          width: Math.round(settings.width ?? video.videoWidth ?? 0),
          height: Math.round(settings.height ?? video.videoHeight ?? 0),
          frameRate: Number(settings.frameRate ?? 0),
          brightness,
          motion,
          lighting,
          framing,
          faceCount,
          faceSupported: studyVisionResult.faceSupported,
          attention: studyVisionResult.attention,
          faceCenterX: studyVisionResult.faceCenterX,
          faceCenterY: studyVisionResult.faceCenterY,
          faceRatio: studyVisionResult.faceRatio,
          headYawScore: studyVisionResult.headYawScore,
          headPitchScore: studyVisionResult.headPitchScore,
          blinkScore: studyVisionResult.blinkScore,
          connection,
          lastUpdatedAt: Date.now(),
          issue: issueMessages[0] ?? '',
        })

        setCalibration({
          permission: true,
          framing:
            studyVisionResult.faceSupported
              ? framing === 'good' &&
                (studyVisionResult.attention === 'focused' || studyVisionResult.attention === 'reading')
              : video.videoWidth > 0,
          lighting: lighting === 'good',
        })
        setCameraActive(connection !== 'error')
      } finally {
        reading = false
        if (active) {
          timerId = window.setTimeout(() => {
            void measure()
          }, 1200)
        }
      }
    }

    void measure()

    return () => {
      active = false
      window.clearTimeout(timerId)
    }
  }, [cameraDevices, cameraPermission, screen, selectedCameraId])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      setCameraActive(false)
    }
  }, [])

  useEffect(() => {
    if (!settings.keepScreenAwake || screen !== 'learning' || !session || !wakeLockSupported) {
      void releaseWakeLock()
      return
    }

    let active = true
    const wakeLockApi = (
      navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<{ released?: boolean; release?: () => Promise<void> }>
        }
      }
    ).wakeLock

    if (!wakeLockApi) {
      return
    }

    void wakeLockApi
      .request('screen')
      .then((wakeLock) => {
        if (!active) {
          return wakeLock.release?.()
        }

        wakeLockRef.current = wakeLock
        return undefined
      })
      .catch(() => undefined)

    return () => {
      active = false
      void releaseWakeLock()
    }
  }, [releaseWakeLock, screen, session, settings.keepScreenAwake, wakeLockSupported])

  useEffect(() => {
    return () => {
      void releaseWakeLock()
      const audioContext = audioContextRef.current
      audioContextRef.current = null
      void audioContext?.close().catch(() => undefined)
    }
  }, [releaseWakeLock])

  useEffect(() => {
    if (!appError && !appFeedback) {
      return
    }

    const timer = window.setTimeout(() => {
      setAppError(null)
      setAppFeedback(null)
    }, APP_MESSAGE_AUTO_DISMISS_MS)

    return () => window.clearTimeout(timer)
  }, [appError, appFeedback])

  useEffect(() => {
    if (screen !== 'learning' || !session || isPaused) return

    lastTickRef.current = Date.now()

    const markActivity = () => {
      const wasIdle = idleTriggeredRef.current
      lastActivityRef.current = Date.now()
      setLiveActivityFresh(true)

      if (wasIdle) {
        idleTriggeredRef.current = false
        setSession((current) =>
          current
            ? {
                ...current,
                events: prependEvent(current, {
                  id: uid(),
                  severity: 'good',
                  message: '입력 활동이 다시 감지되어 집중 흐름이 회복되었습니다.',
                  timestamp: Date.now(),
                }),
              }
            : current,
        )
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
        return
      }

      if (!hiddenSinceRef.current) return

      const awaySeconds = Math.max(1, Math.round((Date.now() - hiddenSinceRef.current) / 1000))
      hiddenSinceRef.current = null

      setSession((current) => {
        if (!current) return current

        const isAbsence = awaySeconds >= 10
        const visibilityEvent: SessionEvent = {
          id: uid(),
          severity: isAbsence ? 'warn' : 'info',
          message: isAbsence
            ? `자리 비움이 ${awaySeconds}초 감지되었습니다.`
            : `탭 이탈 후 ${awaySeconds}초 만에 복귀했습니다.`,
          timestamp: Date.now(),
        }

        return {
          ...current,
          hiddenSeconds: current.hiddenSeconds + awaySeconds,
          tabSwitches: current.tabSwitches + (isAbsence ? 0 : 1),
          absenceEvents: current.absenceEvents + (isAbsence ? 1 : 0),
          events: prependEvent(current, visibilityEvent),
        }
      })
    }

    const handleWindowBlur = () => {
      if (document.visibilityState === 'hidden') {
        return
      }

      blurredSinceRef.current = Date.now()
    }

    const handleWindowFocus = () => {
      if (!blurredSinceRef.current) return

      const awaySeconds = Math.max(1, Math.round((Date.now() - blurredSinceRef.current) / 1000))
      blurredSinceRef.current = null

      setSession((current) => {
        if (!current) return current

        return {
          ...current,
          hiddenSeconds: current.hiddenSeconds + awaySeconds,
          tabSwitches: current.tabSwitches + 1,
          events: prependEvent(current, {
            id: uid(),
            severity: awaySeconds >= 10 ? 'warn' : 'info',
            message: `화면 포커스 이탈 후 ${awaySeconds}초 만에 복귀했습니다.`,
            timestamp: Date.now(),
          }),
        }
      })
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'keydown',
      'touchstart',
      'scroll',
    ]

    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }))
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)

    const interval = window.setInterval(() => {
      const now = Date.now()
      const deltaSeconds = Math.max(1, Math.round((now - lastTickRef.current) / 1000))
      lastTickRef.current = now

      const idleSeconds = Math.floor((now - lastActivityRef.current) / 1000)
      const cameraAbsenceDetected = cameraSubjectMissing
      if (cameraAbsenceDetected) {
        cameraAbsenceSinceRef.current ??= now
      } else {
        cameraAbsenceSinceRef.current = null
        cameraAbsenceLoggedRef.current = false
      }

      const cameraAbsenceSeconds = cameraAbsenceSinceRef.current
        ? Math.max(0, Math.floor((now - cameraAbsenceSinceRef.current) / 1000))
        : 0
      const trackingResult = updateFocusTracker(focusTrackerRef.current, {
        timestampMs: now,
        cameraReady,
        faceVisible: cameraDiagnostics.faceCount === 1 && cameraDiagnostics.attention !== 'away',
        attention: cameraDiagnostics.attention,
        faceCenterX: cameraDiagnostics.faceCenterX,
        faceCenterY: cameraDiagnostics.faceCenterY,
        faceRatio: cameraDiagnostics.faceRatio,
        headYawScore: cameraDiagnostics.headYawScore,
        headPitchScore: cameraDiagnostics.headPitchScore,
        blinkScore: cameraDiagnostics.blinkScore,
        lightingGood: cameraDiagnostics.lighting === 'good',
        connectionStable: cameraDiagnostics.connection === 'active',
        documentFocused: document.hasFocus(),
        idleSeconds,
        idleThresholdSeconds: settings.idleThresholdSeconds,
      })
      focusTrackerRef.current = trackingResult.state
      setFocusTrackingSummary(trackingResult.summary)
      const trackingStableNow =
        trackingResult.summary.verdict === 'stable' ||
        (trackingResult.summary.verdict === 'calibrating' && trackingResult.summary.score >= 75)

      setLiveActivityFresh(idleSeconds < 10)
      if (idleSeconds >= settings.idleThresholdSeconds && !idleTriggeredRef.current) {
        idleTriggeredRef.current = true
        if (settings.focusAlert) {
          playAlertTone('warn')
        }
        setSession((current) =>
          current
            ? {
                ...current,
                idleEvents: current.idleEvents + 1,
                events: prependEvent(current, {
                  id: uid(),
                  severity: 'warn',
                  message: `입력 활동이 ${settings.idleThresholdSeconds}초 이상 없어 집중도가 하락했습니다.`,
                  timestamp: Date.now(),
                }),
              }
            : current,
        )
      }

      if (cameraAbsenceSeconds >= 4 && !cameraAbsenceLoggedRef.current) {
        cameraAbsenceLoggedRef.current = true
        if (settings.focusAlert) {
          playAlertTone('warn')
        }
        setSession((current) =>
          current
            ? {
                ...current,
                absenceEvents: current.absenceEvents + 1,
                events: prependEvent(current, {
                  id: uid(),
                  severity: 'warn',
                  message: `카메라에서 ${cameraAbsenceSeconds}초 이상 사용자가 감지되지 않았습니다.`,
                  timestamp: Date.now(),
                }),
              }
            : current,
        )
      }

      let score = trackingResult.summary.score

      if (
        (sessionRef.current?.mode ?? setup.mode) === REST_CYCLE_MODE_NAME &&
        idleSeconds < 8 &&
        document.hasFocus() &&
        !trackingResult.summary.confirmedAway
      ) {
        score += 2
      }
      score = clamp(score, trackingResult.summary.confirmedAway ? 8 : 14, 98)

      setSession((current) => {
        if (!current) return current

        const nextElapsed = current.elapsedSeconds + deltaSeconds
        const nextTimeline = [
          ...current.timeline,
          ...Array.from({ length: Math.max(1, Math.min(6, Math.ceil(deltaSeconds / 5))) }, () => score),
        ].slice(-72)

        if (settings.breakReminder) {
          const reminderBucket = Math.floor(nextElapsed / (45 * 60))
          if (reminderBucket > reminderBucketRef.current) {
            reminderBucketRef.current = reminderBucket
            playAlertTone('break')
            window.setTimeout(() => {
              setSession((active) =>
                active
                  ? {
                      ...active,
                      events: prependEvent(active, {
                        id: uid(),
                        severity: 'info',
                        message: '45분이 지나 휴식을 권장합니다. 짧은 스트레칭 후 다시 시작해 보세요.',
                        timestamp: Date.now(),
                      }),
                    }
                  : active,
              )
            }, 0)
          }
        }

        const shouldCountFocusedTime =
          score >= 75 &&
          idleSeconds < settings.idleThresholdSeconds &&
          trackingStableNow &&
          !trackingResult.summary.confirmedAway &&
          document.hasFocus()

        return {
          ...current,
          elapsedSeconds: nextElapsed,
          focusedSeconds: current.focusedSeconds + (shouldCountFocusedTime ? deltaSeconds : 0),
          score,
          timeline: nextTimeline,
          highestScore: Math.max(current.highestScore, score),
          lowestScore: Math.min(current.lowestScore, score),
        }
      })

      const activeSession = sessionRef.current
      if (activeSession && activeSession.elapsedSeconds >= activeSession.goalMinutes * 60) {
        completeSessionRef.current('goal')
      }
    }, 1000)

    return () => {
      clearInterval(interval)
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, markActivity as EventListener),
      )
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [
    cameraReady,
    cameraDiagnostics.faceCount,
    cameraDiagnostics.faceCenterX,
    cameraDiagnostics.faceCenterY,
    cameraDiagnostics.faceRatio,
    cameraDiagnostics.connection,
    cameraDiagnostics.lighting,
    cameraDiagnostics.attention,
    cameraDiagnostics.headYawScore,
    cameraDiagnostics.headPitchScore,
    cameraDiagnostics.blinkScore,
    cameraSubjectMissing,
    isPaused,
    playAlertTone,
    screen,
    session,
    settings.breakReminder,
    settings.focusAlert,
    settings.idleThresholdSeconds,
    setup.mode,
  ])

  function navigate(nextScreen: Screen) {
    if (screen === 'learning' && nextScreen !== 'learning' && session) {
      setShowEndModal(true)
      return
    }

    if (nextScreen === 'admin' && !user?.isAdmin) {
      setAppError('관리자 권한이 필요합니다.')
      return
    }

    setMobileSidebarOpen(false)
    setScreen(nextScreen)
  }

  const requestCamera = useCallback(async (deviceId = selectedCameraId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermission('denied')
      setCameraErrorDetail(UNSUPPORTED_CAMERA_MESSAGE)
      setCameraDiagnostics((current) => ({
        ...current,
        connection: 'error',
        issue: UNSUPPORTED_CAMERA_MESSAGE,
      }))
      return
    }

    try {
      setCameraErrorDetail('')
      streamRef.current?.getTracks().forEach((track) => track.stop())
      const preferredConstraints: MediaStreamConstraints = {
        audio: false,
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
      }

      const fallbackConstraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints)
      } catch {
        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
      }

      streamRef.current = stream
      setCameraActive(Boolean(stream.active))
      setCameraPermission('granted')
      setCalibration({ permission: true, framing: false, lighting: false })
      const currentTrack = stream.getVideoTracks()[0]
      const nextDeviceId = currentTrack?.getSettings().deviceId ?? deviceId
      if (nextDeviceId) {
        setSelectedCameraId(nextDeviceId)
      }
      await refreshCameraDevices()
    } catch (error) {
      const failureMessage = describeCameraAccessError(error)
      setCameraActive(false)
      setCameraPermission('denied')
      setCalibration({ permission: false, framing: false, lighting: false })
      setCameraDiagnostics((current) => ({
        ...current,
        connection: 'error',
        issue: failureMessage,
      }))
      setCameraErrorDetail(failureMessage)
    }
  }, [refreshCameraDevices, selectedCameraId])

  const reconnectSelectedCamera = useCallback(() => {
    resetStudyVision()
    void requestCamera(selectedCameraId)
  }, [requestCamera, selectedCameraId])

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextHealth = await refreshBackendHealth()
    const blockingReason = getServiceBlockingReason(nextHealth)

    if (blockingReason) {
      setAppError(blockingReason)
      return
    }

    if (!registerForm.name.trim() || !registerForm.email.trim()) {
      setAppError('이름과 이메일을 입력해 주세요.')
      return
    }

    if (!isStrongPassword(registerPassword)) {
      setAppError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (!registerConsents.privacyPolicyAccepted || !registerConsents.cameraPolicyAccepted) {
      setAppError('개인정보 처리와 카메라 측정 안내에 모두 동의해야 회원가입할 수 있습니다.')
      return
    }

    const draftProfile: UserProfile = {
      ...registerForm,
      id: registerForm.id || registerForm.email,
      dailyGoalHours: clamp(registerForm.dailyGoalHours || DEFAULT_SETTINGS.dailyGoalHours, 1, 8),
      subjects: registerForm.subjects,
      authSource: 'mariadb',
      isAdmin: false,
      consentVersion: CONSENT_VERSION,
      privacyConsentAt: null,
      cameraConsentAt: null,
    }

    setAuthBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      const nextSettings = {
        ...settings,
        dailyGoalHours: draftProfile.dailyGoalHours,
      }
      const bootstrap = await registerWithApi({
        name: draftProfile.name,
        email: draftProfile.email,
        password: registerPassword,
        dailyGoalHours: draftProfile.dailyGoalHours,
        subjects: draftProfile.subjects,
        privacyPolicyAccepted: true,
        cameraPolicyAccepted: true,
      })

      applyBootstrap(bootstrap, 'camera')
      setSettings(bootstrap.settings ?? nextSettings)
      setRegisterPassword('')
      setRegisterConsents(EMPTY_REGISTER_CONSENTS)
      setAppFeedback(null)
    } catch (error) {
      setAppError(
        formatAuthErrorMessage(error, '회원가입에 실패했습니다. 입력값을 다시 확인해 주세요.'),
      )
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextHealth = await refreshBackendHealth()
    const blockingReason = getServiceBlockingReason(nextHealth)

    if (blockingReason) {
      setAppError(blockingReason)
      return
    }

    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      setAppError('이메일과 비밀번호를 입력해 주세요.')
      return
    }

    setAuthBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      const bootstrap = await loginWithApi(loginForm.email, loginForm.password)
      applyBootstrap(bootstrap, 'camera')
      setLoginForm({ email: loginForm.email, password: '' })
      setRegisterPassword('')
      setAppFeedback(null)
    } catch (error) {
      setAppError(formatAuthErrorMessage(error, '로그인에 실패했습니다. 이메일과 비밀번호를 다시 확인해 주세요.'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const email = forgotPasswordEmail.trim()

    if (!email) {
      setAppError('비밀번호 재설정 링크를 받을 이메일을 입력해 주세요.')
      return
    }

    setAuthBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      await requestPasswordResetInApi(email)
      setAppFeedback({
        tone: 'good',
        text: '계정이 존재하면 비밀번호 재설정 링크를 이메일로 보냈습니다.',
      })
      setAuthTab('login')
      setLoginForm((current) => ({ ...current, email }))
    } catch (error) {
      setAppError(error instanceof Error ? error.message : '비밀번호 재설정 요청에 실패했습니다.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!resetToken.trim()) {
      setAppError('재설정 토큰이 없습니다. 이메일 링크로 다시 접속해 주세요.')
      return
    }

    if (!isStrongPassword(resetPasswordForm.nextPassword)) {
      setAppError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (resetPasswordForm.nextPassword !== resetPasswordForm.confirmPassword) {
      setAppError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setAuthBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      await resetPasswordWithTokenInApi(resetToken, resetPasswordForm.nextPassword)
      setResetToken('')
      setResetPasswordForm(EMPTY_RESET_PASSWORD_FORM)
      setAuthTab('login')

      clearResetTokenFromUrl()

      setAppFeedback({
        tone: 'good',
        text: '비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.',
      })
    } catch (error) {
      setAppError(error instanceof Error ? error.message : '비밀번호 재설정에 실패했습니다.')
    } finally {
      setAuthBusy(false)
    }
  }

  function startSession() {
    if (!user || !backendReady) {
      setAppError('세션을 시작하려면 서비스 연결과 로그인이 모두 필요합니다.')
      return
    }

    lastActivityRef.current = Date.now()
    lastTickRef.current = Date.now()
    hiddenSinceRef.current = null
    blurredSinceRef.current = null
    idleTriggeredRef.current = false
    reminderBucketRef.current = 0
    cameraAbsenceSinceRef.current = null
    cameraAbsenceLoggedRef.current = false
    focusTrackerRef.current = createFocusTracker(Date.now())
    setFocusTrackingSummary(DEFAULT_FOCUS_TRACKING_SUMMARY)
    setIsPaused(false)

    const initialScore = cameraReady && !cameraSubjectMissing ? 86 : 74
    const initialEvent: SessionEvent = {
      id: uid(),
      severity: cameraReady ? 'good' : 'warn',
      message: cameraReady
        ? '세션을 시작했습니다. 브라우저 활동과 카메라 상태를 함께 측정합니다.'
        : '카메라 없이 세션을 시작했습니다. 활동성 기반 집중도만 계산합니다.',
      timestamp: Date.now(),
    }
    const selectedSubject = subjectOptions.includes(setup.subject) ? setup.subject : subjectOptions[0]

    const nextSession: LiveSession = {
      id: uid(),
      createdAt: new Date().toISOString(),
      subject: selectedSubject,
      mode: setup.mode,
      goalMinutes: setup.durationMinutes,
      elapsedSeconds: 0,
      focusedSeconds: 0,
      score: initialScore,
      timeline: [initialScore],
      events: [initialEvent],
      tabSwitches: 0,
      idleEvents: 0,
      absenceEvents: 0,
      hiddenSeconds: 0,
      highestScore: initialScore,
      lowestScore: initialScore,
    }

    setSession(nextSession)
    setAppFeedback(null)
    setMobileSidebarOpen(false)
    setScreen('learning')
  }

  function pauseSession() {
    setIsPaused(true)
  }

  function resumeSession() {
    lastTickRef.current = Date.now()
    lastActivityRef.current = Date.now()
    cameraAbsenceSinceRef.current = null
    cameraAbsenceLoggedRef.current = false
    setIsPaused(false)
  }

  function endSession(reason: 'manual' | 'goal' = 'manual') {
    completeSessionRef.current(reason)
  }

  function updateResultNotes(field: keyof SessionNotes, value: string) {
    if (!resultSession) return

    const nextNotes = {
      ...resultSession.notes,
      [field]: value,
    }

    setSessions((current) =>
      current.map((entry) =>
        entry.id === resultSession.id
          ? {
              ...entry,
              notes: nextNotes,
            }
          : entry,
      ),
    )

    if (user && backendReady) {
      void updateSessionNotesInApi(resultSession.id, nextNotes).catch(() => {
        setAppError('세션 메모 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      })
    }
  }

  async function handleChangePassword() {
    if (!passwordForm.currentPassword || !passwordForm.nextPassword) {
      setAppError('현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.')
      return
    }

    if (!isStrongPassword(passwordForm.nextPassword)) {
      setAppError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setAppError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setAccountBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      await changePasswordInApi(passwordForm.currentPassword, passwordForm.nextPassword)
      setPasswordForm(EMPTY_PASSWORD_FORM)
      setAppFeedback({
        tone: 'good',
        text: '비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하면 됩니다.',
      })
    } catch {
      setAppError('비밀번호 변경에 실패했습니다. 현재 비밀번호를 다시 확인해 주세요.')
    } finally {
      setAccountBusy(false)
    }
  }

  async function handleAcceptUpdatedConsent() {
    if (!consentRefresh.privacyPolicyAccepted || !consentRefresh.cameraPolicyAccepted) {
      setAppError('변경된 개인정보 처리와 카메라 측정 안내에 모두 동의해 주세요.')
      return
    }

    setAccountBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      const bootstrap = await acceptCurrentConsentInApi()
      applyBootstrap(bootstrap, 'restore')
      setConsentRefresh(EMPTY_REGISTER_CONSENTS)
      setAppFeedback({
        tone: 'good',
        text: '최신 동의 버전을 저장했습니다.',
      })
    } catch {
      setAppError('동의 갱신에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setAccountBusy(false)
    }
  }

  async function handleDeleteAccount() {
    if (!accountDeleteForm.password.trim()) {
      setAppError('계정 삭제 전에 비밀번호를 입력해 주세요.')
      return
    }

    if (accountDeleteForm.confirmText !== ACCOUNT_DELETE_CONFIRM_TEXT) {
      setAppError(`계정 삭제 확인 문구로 ${ACCOUNT_DELETE_CONFIRM_TEXT} 를 입력해 주세요.`)
      return
    }

    setAccountBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      await deleteAccountInApi(accountDeleteForm.password)
      clearSessionDraft()
      restoredDraftUserIdRef.current = null
      setUser(null)
      setSettings(DEFAULT_SETTINGS)
      setSetup(DEFAULT_SETUP)
      setSessions([])
      setResultSessionId(null)
      setSession(null)
      sessionRef.current = null
      setRegisterForm(EMPTY_REGISTER_FORM)
      setRegisterConsents(EMPTY_REGISTER_CONSENTS)
      setConsentRefresh(EMPTY_REGISTER_CONSENTS)
      setLoginForm({ email: '', password: '' })
      setForgotPasswordEmail('')
      setResetToken('')
      setResetPasswordForm(EMPTY_RESET_PASSWORD_FORM)
      setAuthTab('login')
      setRegisterPassword('')
      setPasswordForm(EMPTY_PASSWORD_FORM)
      setAccountDeleteForm(EMPTY_DELETE_FORM)
      setActiveSettingsSection(DEFAULT_SETTINGS_SECTION)
      setFeedbackInsights(null)
      setFeedbackProvider(null)
      setFeedbackApiError(null)
      setSupportTickets([])
      setSupportForm(EMPTY_SUPPORT_TICKET_FORM)
      setSupportBusy(false)
      setAdminOverview(null)
      setAdminSystem(null)
      setAdminError(null)
      setAdminSection('overview')
      setAdminAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM)
      setAdminAnnouncementEditId(null)
      setAdminAnnouncementBusy(false)
      setAdminAnnouncementDeleteId(null)
      setAdminRoleBusyUserId(null)
      setAdminSupportSearch('')
      setAdminSupportStatusFilter('all')
      setAdminSupportBusyTicketId(null)
      setAdminSupportDrafts({})
      setDiscordBotSettings(null)
      setDiscordBotStatus(null)
      setDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
      setDiscordBotBusy(false)
      setLostarkDiscordBotSettings(null)
      setLostarkDiscordBotStatus(null)
      setLostarkDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
      setLostarkDiscordBotBusy(false)
      setAdminUserSearch('')
      setAdminUserRoleFilter('all')
      setAdminUserActivityFilter('all')
      setAdminSessionSearch('')
      setAdminSessionSubjectFilter('all')
      setAdminSessionWindow('30d')
      setAdminSessionScoreFilter('all')
      clearLastScreen()
      lastHistoryScreenRef.current = null
      window.history.replaceState({ screen: 'login' }, '', buildScreenUrl('login'))
      setScreen('login')
      setAppFeedback({
        tone: 'good',
        text: '계정과 학습 데이터가 삭제되었습니다.',
      })
    } catch {
      setAppError('계정 삭제에 실패했습니다. 비밀번호를 다시 확인해 주세요.')
    } finally {
      setAccountBusy(false)
    }
  }

  async function logout() {
    if (screen === 'learning' && session) {
      setAppError('학습 중에는 로그아웃할 수 없습니다. 먼저 세션을 종료하거나 저장해 주세요.')
      return
    }

    await logoutFromApi().catch(() => undefined)

    clearSessionDraft()
    restoredDraftUserIdRef.current = null
    setUser(null)
    setSettings(DEFAULT_SETTINGS)
    setSetup(DEFAULT_SETUP)
    setSessions([])
    setResultSessionId(null)
    setSession(null)
    sessionRef.current = null
    setRegisterForm(EMPTY_REGISTER_FORM)
    setRegisterConsents(EMPTY_REGISTER_CONSENTS)
    setLoginForm({ email: '', password: '' })
    setForgotPasswordEmail('')
    setResetToken('')
    setResetPasswordForm(EMPTY_RESET_PASSWORD_FORM)
    setAuthTab('login')
    setRegisterPassword('')
    setPasswordForm(EMPTY_PASSWORD_FORM)
    setAccountDeleteForm(EMPTY_DELETE_FORM)
    setActiveSettingsSection(DEFAULT_SETTINGS_SECTION)
    setFeedbackInsights(null)
    setFeedbackProvider(null)
    setFeedbackApiError(null)
    setSupportTickets([])
    setSupportForm(EMPTY_SUPPORT_TICKET_FORM)
    setSupportBusy(false)
    setAdminOverview(null)
    setAdminSystem(null)
    setAdminError(null)
    setAdminSection('overview')
    setAdminAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM)
    setAdminAnnouncementEditId(null)
    setAdminAnnouncementBusy(false)
    setAdminAnnouncementDeleteId(null)
    setAdminRoleBusyUserId(null)
    setAdminSupportSearch('')
    setAdminSupportStatusFilter('all')
    setAdminSupportBusyTicketId(null)
    setAdminSupportDrafts({})
    setDiscordBotSettings(null)
    setDiscordBotStatus(null)
    setDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
    setDiscordBotBusy(false)
    setLostarkDiscordBotSettings(null)
    setLostarkDiscordBotStatus(null)
    setLostarkDiscordBotForm(EMPTY_DISCORD_BOT_FORM)
    setLostarkDiscordBotBusy(false)
    setAdminUserSearch('')
    setAdminUserRoleFilter('all')
    setAdminUserActivityFilter('all')
    setAdminSessionSearch('')
    setAdminSessionSubjectFilter('all')
    setAdminSessionWindow('30d')
    setAdminSessionScoreFilter('all')
    setAppError(null)
    setAppFeedback({
      tone: 'good',
      text: '로그아웃되었습니다.',
    })
    clearLastScreen()
    lastHistoryScreenRef.current = null
    window.history.replaceState({ screen: 'login' }, '', buildScreenUrl('login'))
    setScreen('login')
  }

  async function handleToggleAdminRole(targetUserId: string, nextIsAdmin: boolean) {
    setAdminRoleBusyUserId(targetUserId)
    setAdminError(null)

    try {
      await updateAdminUserRoleInApi(targetUserId, nextIsAdmin)
      const response = await refreshAdminWorkspace()
      setAdminOverview(response.overview)
      setAdminSystem(response.system)
      setAppFeedback({
        tone: 'good',
        text: nextIsAdmin ? '관리자 권한을 부여했습니다.' : '관리자 권한을 해제했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : '관리자 권한 변경에 실패했습니다.')
    } finally {
      setAdminRoleBusyUserId(null)
    }
  }

  async function handleSubmitAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!adminAnnouncementForm.title.trim() || !adminAnnouncementForm.body.trim()) {
      setAdminError('공지 제목과 내용을 모두 입력해 주세요.')
      return
    }

    const payload = {
      title: adminAnnouncementForm.title.trim(),
      body: adminAnnouncementForm.body.trim(),
      tone: adminAnnouncementForm.tone,
      isActive: adminAnnouncementForm.isActive,
      isPinned: adminAnnouncementForm.isPinned,
      startsAt: toIsoFromDateTimeLocal(adminAnnouncementForm.startsAt),
      endsAt: toIsoFromDateTimeLocal(adminAnnouncementForm.endsAt),
    }

    if (payload.startsAt && payload.endsAt && new Date(payload.startsAt) > new Date(payload.endsAt)) {
      setAdminError('공지 종료 시각은 시작 시각보다 뒤여야 합니다.')
      return
    }

    setAdminAnnouncementBusy(true)
    setAdminError(null)

    try {
      if (adminAnnouncementEditId) {
        await updateAdminAnnouncementInApi(adminAnnouncementEditId, payload)
      } else {
        await createAdminAnnouncementInApi(payload)
      }

      const response = await refreshAdminWorkspace()
      setAdminOverview(response.overview)
      setAdminSystem(response.system)
      await refreshActiveAnnouncement()
      await refreshAnnouncements()
      setAdminAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM)
      setAdminAnnouncementEditId(null)
      setAppFeedback(null)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : '공지사항 저장에 실패했습니다.')
    } finally {
      setAdminAnnouncementBusy(false)
    }
  }

  function handleEditAnnouncement(entry: Announcement) {
    setAdminAnnouncementEditId(entry.id)
    setAdminAnnouncementForm({
      title: entry.title,
      body: entry.body,
      tone: entry.tone,
      isActive: entry.isActive,
      isPinned: entry.isPinned,
      startsAt: toDateTimeLocalValue(entry.startsAt),
      endsAt: toDateTimeLocalValue(entry.endsAt),
    })
    setAdminSection('announcements')
    setAdminError(null)
  }

  function resetAnnouncementComposer() {
    setAdminAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM)
    setAdminAnnouncementEditId(null)
  }

  async function handleDeleteAnnouncement(entry: Announcement) {
    const confirmed = window.confirm(`공지사항 "${entry.title}"을 삭제할까요?`)

    if (!confirmed) {
      return
    }

    setAdminAnnouncementDeleteId(entry.id)
    setAdminError(null)
    setAppFeedback(null)

    try {
      await deleteAdminAnnouncementInApi(entry.id)
      const response = await refreshAdminWorkspace()
      setAdminOverview(response.overview)
      setAdminSystem(response.system)
      await refreshActiveAnnouncement()
      await refreshAnnouncements()

      if (adminAnnouncementEditId === entry.id) {
        resetAnnouncementComposer()
      }

      setAppFeedback(null)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : '공지사항 삭제에 실패했습니다.')
    } finally {
      setAdminAnnouncementDeleteId(null)
    }
  }

  async function handleSubmitSupportTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supportForm.subject.trim() || !supportForm.body.trim()) {
      setAppError('문의 제목과 내용을 모두 입력해 주세요.')
      return
    }

    if (supportForm.subject.trim().length > SUPPORT_TICKET_SUBJECT_MAX_LENGTH) {
      setAppError(`문의 제목은 ${SUPPORT_TICKET_SUBJECT_MAX_LENGTH}자 이내로 입력해 주세요.`)
      return
    }

    if (supportForm.body.trim().length > SUPPORT_TICKET_BODY_MAX_LENGTH) {
      setAppError(`문의 내용은 ${SUPPORT_TICKET_BODY_MAX_LENGTH}자 이내로 입력해 주세요.`)
      return
    }

    setSupportBusy(true)
    setAppError(null)
    setAppFeedback(null)

    try {
      await createSupportTicketInApi({
        category: supportForm.category,
        subject: supportForm.subject.trim(),
        body: supportForm.body.trim(),
      })
      await refreshSupportTickets()
      setSupportForm(EMPTY_SUPPORT_TICKET_FORM)
      setAppFeedback({
        tone: 'good',
        text: '문의가 접수되었습니다. 관리자 답변이 등록되면 이 화면에서 확인할 수 있습니다.',
      })
    } catch (error) {
      setAppError(error instanceof Error ? error.message : '문의 접수에 실패했습니다.')
    } finally {
      setSupportBusy(false)
    }
  }

  async function handleAdminSupportSave(ticketId: string) {
    const target = filteredAdminSupportTickets.find((entry) => entry.id === ticketId)

    if (!target) {
      return
    }

    const draft = adminSupportDrafts[ticketId] ?? {
      status: target.status,
      adminReply: target.adminReply ?? '',
    }

    setAdminSupportBusyTicketId(ticketId)
    setAdminError(null)

    try {
      await updateAdminSupportTicketInApi(ticketId, {
        status: draft.status,
        adminReply: draft.adminReply,
      })
      const response = await refreshAdminWorkspace()
      setAdminOverview(response.overview)
      setAdminSystem(response.system)
      setAdminSupportDrafts((current) => {
        const next = { ...current }
        delete next[ticketId]
        return next
      })
      setAppFeedback({
        tone: 'good',
        text: '문의 처리 내용을 저장했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : '문의 처리 저장에 실패했습니다.')
    } finally {
      setAdminSupportBusyTicketId(null)
    }
  }

  async function handleSubmitDiscordBotSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const payload = discordFormToPayload(discordBotForm)

    if (!discordBotTokenStorageReady) {
      setAdminError(DISCORD_BOT_TOKEN_STORAGE_UNAVAILABLE_MESSAGE)
      return
    }

    if (!payload.clientId) {
      setAdminError('Discord 애플리케이션 ID를 입력해 주세요.')
      return
    }

    if (!discordBotSettings?.tokenConfigured && !payload.botToken && !payload.clearToken) {
      setAdminError('Discord 봇 토큰을 먼저 등록해 주세요.')
      return
    }

    setDiscordBotBusy(true)
    setAdminError(null)

    try {
      const response = await updateDiscordBotSettingsInApi(payload)
      setDiscordBotSettings(response.settings)
      setDiscordBotStatus(response.status)
      setDiscordBotForm(discordSettingsToForm(response.settings))
      setAppFeedback({
        tone: 'good',
        text: 'Discord 봇 설정을 저장했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Discord 봇 설정 저장에 실패했습니다.')
    } finally {
      setDiscordBotBusy(false)
    }
  }

  async function handleStartDiscordBot() {
    if (!discordBotTokenStorageReady) {
      setAdminError(DISCORD_BOT_TOKEN_STORAGE_UNAVAILABLE_MESSAGE)
      return
    }

    setDiscordBotBusy(true)
    setAdminError(null)

    try {
      const response = await startDiscordBotInApi()
      setDiscordBotSettings(response.settings)
      setDiscordBotStatus(response.status)
      setDiscordBotForm(discordSettingsToForm(response.settings))
      setAppFeedback({
        tone: 'good',
        text: 'Discord 봇을 활성화했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Discord 봇 활성화에 실패했습니다.')
    } finally {
      setDiscordBotBusy(false)
    }
  }

  async function handleStopDiscordBot() {
    setDiscordBotBusy(true)
    setAdminError(null)

    try {
      const response = await stopDiscordBotInApi()
      setDiscordBotSettings(response.settings)
      setDiscordBotStatus(response.status)
      setDiscordBotForm(discordSettingsToForm(response.settings))
      setAppFeedback({
        tone: 'good',
        text: 'Discord 봇을 비활성화했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Discord 봇 비활성화에 실패했습니다.')
    } finally {
      setDiscordBotBusy(false)
    }
  }

  async function handleSubmitLostarkDiscordBotSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const payload = discordFormToPayload(lostarkDiscordBotForm)

    if (!lostarkDiscordBotTokenStorageReady) {
      setAdminError(DISCORD_BOT_TOKEN_STORAGE_UNAVAILABLE_MESSAGE)
      return
    }

    if (!payload.clientId) {
      setAdminError('Lost Ark Discord 애플리케이션 ID를 입력해 주세요.')
      return
    }

    if (!lostarkDiscordBotSettings?.tokenConfigured && !payload.botToken && !payload.clearToken) {
      setAdminError('Lost Ark Discord 봇 토큰을 먼저 등록해 주세요.')
      return
    }

    setLostarkDiscordBotBusy(true)
    setAdminError(null)

    try {
      const response = await updateLostarkDiscordBotSettingsInApi(payload)
      setLostarkDiscordBotSettings(response.settings)
      setLostarkDiscordBotStatus(response.status)
      setLostarkDiscordBotForm(discordSettingsToForm(response.settings))
      setAppFeedback({
        tone: 'good',
        text: 'Lost Ark Discord 봇 설정을 저장했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Lost Ark Discord 봇 설정 저장에 실패했습니다.')
    } finally {
      setLostarkDiscordBotBusy(false)
    }
  }

  async function handleStartLostarkDiscordBot() {
    if (!lostarkDiscordBotTokenStorageReady) {
      setAdminError(DISCORD_BOT_TOKEN_STORAGE_UNAVAILABLE_MESSAGE)
      return
    }

    setLostarkDiscordBotBusy(true)
    setAdminError(null)

    try {
      const response = await startLostarkDiscordBotInApi()
      setLostarkDiscordBotSettings(response.settings)
      setLostarkDiscordBotStatus(response.status)
      setLostarkDiscordBotForm(discordSettingsToForm(response.settings))
      setAppFeedback({
        tone: 'good',
        text: 'Lost Ark Discord 봇을 활성화했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Lost Ark Discord 봇 활성화에 실패했습니다.')
    } finally {
      setLostarkDiscordBotBusy(false)
    }
  }

  async function handleStopLostarkDiscordBot() {
    setLostarkDiscordBotBusy(true)
    setAdminError(null)

    try {
      const response = await stopLostarkDiscordBotInApi()
      setLostarkDiscordBotSettings(response.settings)
      setLostarkDiscordBotStatus(response.status)
      setLostarkDiscordBotForm(discordSettingsToForm(response.settings))
      setAppFeedback({
        tone: 'good',
        text: 'Lost Ark Discord 봇을 비활성화했습니다.',
      })
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Lost Ark Discord 봇 비활성화에 실패했습니다.')
    } finally {
      setLostarkDiscordBotBusy(false)
    }
  }

  async function handleDownloadReportPdf() {
    if (!reportExportRef.current || pdfBusy) {
      return
    }

    setPdfBusy(true)
    setAppError(null)

    try {
      const result = await exportReportPdf(reportExportRef.current)
      if (result.savedWithNativeBridge) {
        setAppFeedback({
          tone: 'good',
          text: 'PDF가 기기의 다운로드 폴더에 저장되었습니다.',
        })
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'PDF 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setPdfBusy(false)
    }
  }

  function renderTopNav() {
    return (
      <TopNavigation
        backendReady={backendReady}
        isLocalRuntime={isLocalRuntime}
        mobileSidebarOpen={mobileSidebarOpen}
        onLogout={logout}
        onNavigate={navigate}
        onToggleSidebar={() => setMobileSidebarOpen((current) => !current)}
        runtimeConnectionLabel={runtimeConnectionLabel}
        runtimeDetail={runtimeMode.detail}
        runtimeLabel={runtimeMode.label}
        screen={screen}
        user={user}
      />
    )
  }

  function renderSidebar() {
    return (
      <Sidebar mobileSidebarOpen={mobileSidebarOpen} onNavigate={navigate} screen={screen} user={user} />
    )
  }

  function renderLoginScreen() {
    return (
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="auth-brand-lockup">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <span className="eyebrow">AI 집중 분석</span>
              <h1>FocusAI</h1>
            </div>
          </div>
          <p>
            학습 세션의 집중 흐름을 관찰하고 리포트와 AI 피드백까지 한 화면에서 관리합니다.
            로그인과 학습 기록은 서버 세션과 MariaDB에 보관합니다.
          </p>
          <div className="hero-panel">
            <div className="hero-stat">
              <strong>실시간 흐름</strong>
              <span>카메라, 대시보드, 리포트</span>
            </div>
            <div className="hero-stat">
              <strong>측정 신호</strong>
              <span>탭 전환, 입력 활동, 카메라 상태</span>
            </div>
            <div className="hero-stat">
              <strong>저장 구조</strong>
              <span>서버 세션과 MariaDB</span>
            </div>
          </div>
        </section>

        <section className="auth-panel">
          <div className="panel-badge">FocusAI 계정</div>
          <h2>
            {authTab === 'register'
              ? '회원가입'
              : authTab === 'forgot'
                ? '비밀번호 찾기'
                : authTab === 'reset'
                  ? '비밀번호 재설정'
                  : '로그인'}
          </h2>
          <p className="panel-copy">기존 학습 기록과 설정을 불러와 이어서 시작합니다.</p>
          <AuthRuntimePanel
            backendReady={backendReady}
            isLocalRuntime={isLocalRuntime}
            runtimeConnectionLabel={runtimeConnectionLabel}
            runtimeDetail={runtimeMode.detail}
            runtimeLabel={runtimeMode.label}
          />
          {appError && <div className="inline-alert warn">{appError}</div>}
          {appFeedback && <div className={`inline-alert ${appFeedback.tone}`}>{appFeedback.text}</div>}
          {healthChecked && getServiceBlockingReason(backendHealth) && (
            <div className="inline-alert warn">{getServiceBlockingReason(backendHealth)}</div>
          )}

          <div className="auth-tabs">
            <button
              type="button"
              className={authTab === 'login' ? 'active' : ''}
              onClick={() => setAuthTab('login')}
            >
              로그인
            </button>
            <button
              type="button"
              className={authTab === 'register' ? 'active' : ''}
              onClick={() => setAuthTab('register')}
            >
              회원가입
            </button>
          </div>

          {(authTab === 'forgot' || authTab === 'reset') && (
            <div className="inline-alert info">
              {authTab === 'forgot'
                ? '입력한 이메일로 비밀번호 재설정 링크를 보냅니다.'
                : '이메일 링크의 토큰으로 새 비밀번호를 설정합니다.'}
            </div>
          )}

          {authTab === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                이메일
                <input
                  name="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, email: event.target.value }))
                  }
                  type="email"
                  autoComplete="email"
                  placeholder="이메일을 입력하세요"
                />
              </label>
              <label>
                비밀번호
                <input
                  name="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                  type="password"
                  autoComplete="current-password"
                  placeholder="비밀번호를 입력하세요"
                />
              </label>
              <button type="submit" className="primary-button large" disabled={authBusy}>
                {authBusy ? '로그인 중...' : '로그인'}
              </button>
              <div className="auth-persistence-note">
                <strong>로그인 상태 유지</strong>
                <span>브라우저를 닫았다가 다시 열어도 서버 세션으로 자동 복원됩니다.</span>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setForgotPasswordEmail(loginForm.email)
                  setAuthTab('forgot')
                  setAppError(null)
                }}
              >
                비밀번호를 잊으셨나요?
              </button>
              <div className="caption">로그인 후 학습 기록은 MariaDB에 저장됩니다.</div>
            </form>
          ) : authTab === 'register' ? (
            <form className="auth-form" onSubmit={handleRegister}>
              <label>
                이름
                <input
                  name="name"
                  value={registerForm.name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, name: event.target.value }))
                  }
                  type="text"
                  autoComplete="name"
                  placeholder="이름을 입력하세요"
                />
              </label>
              <label>
                이메일
                <input
                  name="email"
                  value={registerForm.email}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, email: event.target.value }))
                  }
                  type="email"
                  autoComplete="email"
                  placeholder="이메일을 입력하세요"
                />
              </label>
              <label>
                비밀번호
                <input
                  name="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="10자 이상, 문자/숫자/기호 중 2종류 이상"
                />
              </label>
              <label>
                일일 목표 시간
                <input
                  name="dailyGoalHours"
                  value={registerForm.dailyGoalHours || ''}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      dailyGoalHours: event.target.value ? Number(event.target.value) : 0,
                    }))
                  }
                  type="number"
                  min={1}
                  max={8}
                  placeholder="일일 목표 시간을 입력하세요"
                />
              </label>
              <label>
                주요 과목(선택)
                <input
                  name="subjects"
                  value={registerForm.subjects.join(', ')}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      subjects: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }))
                  }
                  type="text"
                  placeholder="나중에 설정에서 추가해도 됩니다"
                />
              </label>
              <label className="consent-row">
                <input
                  name="privacyPolicyAccepted"
                  type="checkbox"
                  checked={registerConsents.privacyPolicyAccepted}
                  onChange={(event) =>
                    setRegisterConsents((current) => ({
                      ...current,
                      privacyPolicyAccepted: event.target.checked,
                    }))
                  }
                />
                <span>
                  개인정보 처리와 학습 데이터 저장에 동의합니다.
                  <small>집중도 점수, 메모, 설정 정보가 MariaDB에 저장됩니다.</small>
                </span>
              </label>
              <label className="consent-row">
                <input
                  name="cameraPolicyAccepted"
                  type="checkbox"
                  checked={registerConsents.cameraPolicyAccepted}
                  onChange={(event) =>
                    setRegisterConsents((current) => ({
                      ...current,
                      cameraPolicyAccepted: event.target.checked,
                    }))
                  }
                />
                <span>
                  카메라 측정 안내를 확인했고 동의합니다.
                  <small>원본 영상은 저장하지 않으며 브라우저의 카메라 상태만 사용합니다.</small>
                </span>
              </label>
              <button type="submit" className="primary-button large" disabled={authBusy}>
                {authBusy ? '계정 생성 중...' : '회원가입'}
              </button>
              <div className="caption">동의 버전: {CONSENT_VERSION}</div>
            </form>
          ) : authTab === 'forgot' ? (
            <form className="auth-form" onSubmit={handleForgotPassword}>
              <label>
                이메일
                <input
                  name="email"
                  value={forgotPasswordEmail}
                  onChange={(event) => setForgotPasswordEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="이메일을 입력하세요"
                />
              </label>
              <button type="submit" className="primary-button large" disabled={authBusy}>
                {authBusy ? '전송 중...' : '재설정 링크 보내기'}
              </button>
              <button type="button" className="ghost-button" onClick={() => setAuthTab('login')}>
                로그인으로 돌아가기
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleResetPassword}>
              <label>
                새 비밀번호
                <input
                  name="nextPassword"
                  value={resetPasswordForm.nextPassword}
                  onChange={(event) =>
                    setResetPasswordForm((current) => ({
                      ...current,
                      nextPassword: event.target.value,
                    }))
                  }
                  type="password"
                  autoComplete="new-password"
                  placeholder="10자 이상, 문자/숫자/기호 중 2종류 이상"
                />
              </label>
              <label>
                새 비밀번호 확인
                <input
                  name="confirmPassword"
                  value={resetPasswordForm.confirmPassword}
                  onChange={(event) =>
                    setResetPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  type="password"
                  autoComplete="new-password"
                  placeholder="새 비밀번호를 다시 입력하세요"
                />
              </label>
              <button type="submit" className="primary-button large" disabled={authBusy}>
                {authBusy ? '변경 중...' : '비밀번호 재설정'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setResetToken('')
                  setResetPasswordForm(EMPTY_RESET_PASSWORD_FORM)
                  setAuthTab('login')
                  clearResetTokenFromUrl()
                }}
              >
                취소
              </button>
            </form>
          )}
        </section>
      </div>
    )
  }
  function renderCameraScreen() {
    return (
      <div className="camera-shell">
        <div className="camera-card">
          <div className="camera-copy">
            <span className="eyebrow">Step 2</span>
            <h2>카메라 설정</h2>
            <p>
              집중도 측정은 브라우저 탭 상태와 입력 활동만으로도 동작하지만, 카메라를 허용하면 더 안정적인
              경험을 만들 수 있습니다. 영상 원본은 저장하지 않습니다.
            </p>
          </div>

          <div className="camera-toolbar">
            <label className="camera-device-field">
              <span>사용할 카메라</span>
              <select
                name="cameraDeviceId"
                value={selectedCameraId}
                onChange={(event) => setSelectedCameraId(event.target.value)}
                disabled={!cameraDevices.length}
              >
                {!cameraDevices.length && <option value="">카메라 목록을 불러오는 중입니다.</option>}
                {cameraDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="camera-toolbar-actions">
              <button type="button" className="ghost-button" onClick={() => void refreshCameraDevices()}>
                장치 새로고침
              </button>
              <button type="button" className="ghost-button" onClick={reconnectSelectedCamera}>
                선택 카메라 연결
              </button>
            </div>
          </div>

          <div className="camera-preview">
            <video ref={calibrationVideoRef} autoPlay muted playsInline />
            {!cameraReady && (
              <div className="camera-placeholder">
                <div className="placeholder-emoji">📷</div>
                <span>카메라 미연결</span>
              </div>
            )}
            <div className="camera-guide">
              <div className="guide-ring" />
            </div>
            <div className="camera-overlay-copy">
              <span>연결 상태: {formatCameraConnection(cameraDiagnostics.connection)}</span>
              <span>밝기: {formatCameraLighting(cameraDiagnostics.lighting)}</span>
              <span>프레이밍: {formatCameraFraming(cameraDiagnostics.framing, cameraDiagnostics.faceSupported)}</span>
            </div>
          </div>

          <div className="camera-diagnostics-grid">
            <div className="camera-diagnostic-card">
              <span>연결된 장치</span>
              <strong>{cameraDiagnostics.deviceLabel}</strong>
              <small>{cameraDevices.length ? `${cameraDevices.length}개 카메라 감지` : '감지된 장치 없음'}</small>
            </div>
            <div className="camera-diagnostic-card">
              <span>해상도 / 프레임</span>
              <strong>{cameraResolutionLabel}</strong>
              <small>{cameraFrameRateLabel}</small>
            </div>
            <div className="camera-diagnostic-card">
              <span>밝기</span>
              <strong>{cameraDiagnostics.lastUpdatedAt ? `${cameraDiagnostics.brightness}%` : '측정 전'}</strong>
              <small>{formatCameraLighting(cameraDiagnostics.lighting)}</small>
            </div>
            <div className="camera-diagnostic-card">
              <span>프레임 변화</span>
              <strong>{cameraDiagnostics.lastUpdatedAt ? `${cameraDiagnostics.motion}%` : '측정 전'}</strong>
              <small>움직임이 거의 없으면 멈춤 여부를 확인합니다.</small>
            </div>
            <div className="camera-diagnostic-card">
              <span>얼굴 / 프레이밍</span>
              <strong>{formatCameraFraming(cameraDiagnostics.framing, cameraDiagnostics.faceSupported)}</strong>
              <small>
                {cameraDiagnostics.faceSupported
                  ? `감지된 얼굴 ${cameraDiagnostics.faceCount}명`
                  : '브라우저 기본 진단만 사용 중'}
              </small>
            </div>
            <div className="camera-diagnostic-card">
              <span>마지막 측정</span>
              <strong>
                {cameraDiagnostics.lastUpdatedAt
                  ? formatDateTime(new Date(cameraDiagnostics.lastUpdatedAt).toISOString())
                  : '측정 전'}
              </strong>
              <small>{cameraDiagnostics.issue || '이상이 없으면 바로 학습 세션으로 진행할 수 있습니다.'}</small>
            </div>
          </div>

          <div className="checklist">
            <div className={`check-item${calibration.permission ? ' done' : ''}`}>
              <span>{calibration.permission ? '✓' : '1'}</span>
              <div>
                <strong>카메라 권한 허용</strong>
                <small>브라우저가 웹캠을 읽을 수 있어야 합니다.</small>
              </div>
            </div>
            <div className={`check-item${calibration.framing ? ' done' : ''}`}>
              <span>{calibration.framing ? '✓' : '2'}</span>
              <div>
                <strong>얼굴 위치 보정</strong>
                <small>프레임 중앙에 앉아 주세요.</small>
              </div>
            </div>
            <div className={`check-item${calibration.lighting ? ' done' : ''}`}>
              <span>{calibration.lighting ? '✓' : '3'}</span>
              <div>
                <strong>조명 상태 확인</strong>
                <small>얼굴이 너무 어둡지 않게 조정해 주세요.</small>
              </div>
            </div>
          </div>

          {cameraDiagnostics.issue && (
            <div className={`inline-alert ${cameraStatusTone(cameraDiagnostics.connection)}`}>
              {cameraDiagnostics.issue}
            </div>
          )}

          {cameraErrorDetail && (
            <div className="inline-alert warn camera-recovery-alert">
              <strong>{cameraErrorDetail}</strong>
              <ul>
                {CAMERA_ACCESS_RECOVERY_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="action-row">
            <button type="button" className="secondary-button" onClick={() => setScreen('dashboard')}>
              카메라 없이 계속
            </button>
            <button type="button" className="primary-button" onClick={reconnectSelectedCamera}>
              {cameraReady ? '다시 보정하기' : '카메라 연결'}
            </button>
          </div>

          {cameraPermission === 'denied' && (
            <div className="inline-alert warn">
              카메라 없이도 계속할 수 있지만, 허용하면 얼굴 트래킹 기준선과 집중도 안정성이 더 정확해집니다.
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderDashboard() {
    return (
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h2>안녕하세요, {user?.name ?? '학습자'}님</h2>
            <p>오늘도 집중의 질을 관리해 볼 시간입니다.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => navigate('session-setup')}>
            새 세션 시작
          </button>
        </div>

        <div className="stats-grid">
          <article className="stat-card metric-time">
            <span>오늘 공부 시간</span>
            <strong>{formatStudyDuration(dashboardMetrics.studyTodaySeconds)}</strong>
            <small>세션 {dashboardMetrics.todaySessions.length}개</small>
          </article>
          <article className="stat-card metric-focus">
            <span>오늘 평균 집중도</span>
            <strong>{dashboardMetrics.avgFocusToday || 0}</strong>
            <small>/ 100</small>
          </article>
          <article className="stat-card metric-range">
            <span>{dashboardMetrics.focusRange.label} 평균 집중도</span>
            <strong>{dashboardMetrics.focusRange.average || 0}</strong>
            <small>{dashboardMetrics.focusRange.badge} · {dashboardMetrics.focusRange.calendarLabel}</small>
          </article>
          <article className="stat-card metric-goal">
            <span>목표 달성률</span>
            <strong>{formatPercent(dashboardMetrics.goalPercent)}</strong>
            <small>일일 목표 {settings.dailyGoalHours}시간</small>
          </article>
        </div>

        <div className="two-column">
          <section className="card session-subject-card">
            <div className="card-header">
              <div>
                <h3>집중도 흐름</h3>
                <span className="badge subtle">{dashboardMetrics.focusRange.badge}</span>
              </div>
              <div className="focus-range-controls" role="group" aria-label="집중도 기간">
                {FOCUS_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={focusRangeMode === option.id ? 'active' : ''}
                    onClick={() => setFocusRangeMode(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <WeeklyBars bars={dashboardMetrics.focusRange.bars} compact={dashboardMetrics.focusRange.mode === 'month'} />
          </section>
          <section className="card session-goal-card">
            <div className="card-header">
              <h3>최근 세션</h3>
              <span className="badge subtle">실제 저장 데이터</span>
            </div>
            <div className="session-list">
              {dashboardMetrics.recentSessions.length ? (
                dashboardMetrics.recentSessions.map((entry) => (
                  <div key={entry.id} className="session-row">
                    <div>
                      <strong>{entry.subject}</strong>
                      <small>
                        {entry.mode} · {formatDuration(entry.elapsedSeconds)}
                      </small>
                    </div>
                    <span className="session-score">{entry.avgScore}</span>
                  </div>
                ))
              ) : (
                <div className="empty-card">아직 저장된 세션이 없습니다. 첫 세션을 시작해 보세요.</div>
              )}
            </div>
          </section>
        </div>

        <div className="two-column">
          <section className="card session-mode-card">
            <div className="card-header">
              <h3>과목별 평균 집중도</h3>
              <span className="badge subtle">누적</span>
            </div>
            <div className="bar-list">
              {(dashboardMetrics.subjectStats.length ? dashboardMetrics.subjectStats : SUBJECTS.slice(0, 4).map((subject) => ({ subject, score: 0 }))).map((entry) => (
                <div key={entry.subject} className="bar-row">
                  <span>{entry.subject}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.max(entry.score, 8)}%`,
                        backgroundColor: scoreColor(entry.score),
                      }}
                    />
                  </div>
                  <strong>{entry.score || '-'}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="card compact">
            <div className="card-header">
              <h3>빠른 상태</h3>
              <span className={`badge ${cameraReady ? 'good' : 'warn'}`}>
                {cameraReady ? '카메라 준비됨' : '카메라 미연결'}
              </span>
            </div>
            <div className="quick-grid">
              <div className="quick-item">
                <strong>{dashboardMetrics.weeklyStudySeconds ? formatStudyDuration(dashboardMetrics.weeklyStudySeconds) : '0분'}</strong>
                <span>주간 학습 시간</span>
              </div>
              <div className="quick-item">
                <strong>{dashboardMetrics.weeklyFocusedSeconds ? formatStudyDuration(dashboardMetrics.weeklyFocusedSeconds) : '0분'}</strong>
                <span>실제 집중 시간</span>
              </div>
              <div className="quick-item">
                <strong>{dashboardMetrics.disturbanceTotals.tabSwitches}</strong>
                <span>탭 전환</span>
              </div>
              <div className="quick-item">
                <strong>{dashboardMetrics.disturbanceTotals.idleEvents}</strong>
                <span>입력 비활성</span>
              </div>
              <div className="quick-item">
                <strong>{dashboardMetrics.disturbanceTotals.absenceEvents}</strong>
                <span>자리 비움</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderSessionSetup() {
    return (
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h2>세션 준비</h2>
            <p>공부할 과목과 목표 시간을 정하고 바로 측정을 시작합니다.</p>
          </div>
          <span className="badge subtle">실제 측정 준비</span>
        </div>

        <div className="setup-grid">
          <section className="card">
            <div className="card-header">
              <h3>과목 선택</h3>
            </div>
            <div className="chip-grid subject-row-grid">
              {subjectOptions.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  className={`subject-chip${setup.subject === subject ? ' selected' : ''}`}
                  onClick={() => setSetup((current) => ({ ...current, subject }))}
                >
                  {subject}
                </button>
              ))}
            </div>
            {!user?.subjects.length && (
              <p className="caption">설정에서 과목을 추가하면 이 목록에 바로 표시됩니다.</p>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <h3>목표 시간</h3>
            </div>
            <div className="time-picker centered-time-picker">
              <button
                type="button"
                className="icon-button"
                onClick={() =>
                  setSetup((current) => ({
                    ...current,
                    durationMinutes: clamp(current.durationMinutes - 15, 15, 180),
                  }))
                }
              >
                −
              </button>
              <div className="time-value">{setup.durationMinutes}분</div>
              <button
                type="button"
                className="icon-button"
                onClick={() =>
                  setSetup((current) => ({
                    ...current,
                    durationMinutes: clamp(current.durationMinutes + 15, 15, 180),
                  }))
                }
              >
                +
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3>학습 모드</h3>
            </div>
            <div className="mode-list">
              {SESSION_MODES.map((mode) => (
                <button
                  key={mode.name}
                  type="button"
                  className={`mode-card${setup.mode === mode.name ? ' selected' : ''}`}
                  onClick={() => setSetup((current) => ({ ...current, mode: mode.name }))}
                >
                  <strong>{mode.name}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card accent">
            <div className="card-header">
              <h3>현재 측정 조건</h3>
            </div>
            <div className="check-summary">
              <div>
                <strong>카메라</strong>
                <span>{cameraReady ? '연결됨' : '미연결'}</span>
              </div>
              <div>
                <strong>집중 경고</strong>
                <span>{settings.focusAlert ? '활성' : '비활성'}</span>
              </div>
              <div>
                <strong>입력 공백 기준</strong>
                <span>{settings.idleThresholdSeconds}초</span>
              </div>
            </div>
            <button type="button" className="primary-button large" onClick={startSession}>
              세션 시작
            </button>
          </section>
        </div>
      </div>
    )
  }

  function renderLearning() {
    return (
      <div className="learning-shell">
        <div className="learning-top">
          <div>
            <span className="badge subtle">{session?.mode}</span>
            <h2>{session?.subject}</h2>
          </div>
          <div className="learning-actions">
            <button type="button" className="secondary-button" onClick={pauseSession}>
              일시정지
            </button>
            <button type="button" className="danger-button" onClick={() => setShowEndModal(true)}>
              종료
            </button>
          </div>
        </div>

        <div className="learning-grid">
          <section className="card video-card learning-observation-pane">
            <div className="card-header">
              <h3>실시간 관찰 화면</h3>
              <span className={`badge ${cameraReady ? 'good' : 'warn'}`}>
                {cameraReady ? '카메라 활성' : '브라우저 신호만 사용'}
              </span>
            </div>
            <div className="live-video-frame">
              <video ref={learningVideoRef} autoPlay muted playsInline />
              {!cameraReady && (
                <div className="camera-placeholder dark">
                  <div className="placeholder-emoji">🧠</div>
                  <span>카메라 없이도 탭 전환과 입력 활동은 측정됩니다.</span>
                </div>
              )}
              <div className="camera-overlay-copy">
                <span>탭 집중: {document.hasFocus() ? 'ON' : 'OFF'}</span>
                <span>입력 활동: {liveActivityFresh ? '활발' : '낮음'}</span>
                {settings.showLiveScore && <span>점수 상태: {scoreTone(session?.score ?? 0)}</span>}
              </div>
            </div>

            {settings.focusAlert && (
              <div className={`inline-alert ${scoreTone(session?.score ?? 0)}`}>
                {session?.score && session.score >= 80
                  ? '집중 상태가 양호합니다. 지금 흐름을 유지해 보세요.'
                  : session?.score && session.score >= 65
                    ? '입력 활동이나 화면 주시가 줄어들고 있습니다. 한 번만 더 집중해 볼까요?'
                    : '집중 이탈이 감지되고 있습니다. 브라우저 탭과 입력 활동을 다시 맞춰 주세요.'}
              </div>
            )}
          </section>

          <section className="card side-panel learning-side-scroll">
            <div className="timer-block">
              <span>경과 시간</span>
              <strong>{formatClock(session?.elapsedSeconds ?? 0)}</strong>
              <small>목표 {formatClock((session?.goalMinutes ?? 0) * 60)}</small>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${clamp(
                      (((session?.elapsedSeconds ?? 0) / Math.max(1, (session?.goalMinutes ?? 1) * 60)) * 100),
                      0,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            {settings.showLiveScore ? (
              <FocusRing score={session?.score ?? 0} label="현재 집중도" />
            ) : (
              <div className="privacy-score-card">
                <span>실시간 점수</span>
                <strong>숨김</strong>
                <small>세션 종료 후 결과와 리포트에서 확인할 수 있습니다.</small>
              </div>
            )}

            <div className="tracking-card">
              <div className="card-header">
                <h3>트래킹 안정성</h3>
                <span
                  className={`badge ${
                    focusTrackingSummary.verdict === 'stable' || focusTrackingSummary.verdict === 'calibrating'
                      ? 'good'
                      : focusTrackingSummary.verdict === 'transient' || focusTrackingSummary.verdict === 'unreliable'
                        ? 'warn'
                        : 'danger'
                  }`}
                >
                  {focusTrackingSummary.label}
                </span>
              </div>
              <div className="tracking-meter">
                <div
                  className="tracking-meter-fill"
                  style={{ transform: `scaleX(${clamp(focusTrackingSummary.stability, 0, 100) / 100})` }}
                />
              </div>
              <div className="tracking-breakdown">
                <span>안정성 {focusTrackingSummary.stability}%</span>
                <span>{focusTrackingSummary.baselineReady ? '개인 기준선 적용' : '기준선 수집 중'}</span>
              </div>
              <small>{focusTrackingSummary.reason}</small>
            </div>

            <div className="mini-stats">
              <div>
                <strong>{formatDuration(session?.focusedSeconds ?? 0)}</strong>
                <span>집중 시간</span>
              </div>
              <div>
                <strong>{session?.tabSwitches ?? 0}</strong>
                <span>탭 전환</span>
              </div>
              <div>
                <strong>{session?.idleEvents ?? 0}</strong>
                <span>입력 비활성</span>
              </div>
              <div>
                <strong>{session?.absenceEvents ?? 0}</strong>
                <span>감지 상태 {cameraPresenceLabel}</span>
                <span>자리 비움</span>
              </div>
            </div>

            <div className="line-card">
              <div className="card-header">
                <h3>실시간 집중도 추이</h3>
              </div>
              <Sparkline values={session?.timeline ?? []} />
            </div>

            {settings.showEventLog && (
              <div className="event-log">
                <div className="card-header">
                  <h3>이벤트 로그</h3>
                  <span className="badge subtle">실시간</span>
                </div>
                {(session?.events ?? []).map((event) => (
                  <div key={event.id} className="event-row">
                    <span className={`event-dot ${event.severity}`} />
                    <div>
                      <strong>
                        {new Date(event.timestamp).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                      <span>{event.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {isPaused && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h3>일시정지 중</h3>
              <p>측정과 타이머가 멈춰 있습니다. 준비되면 세션을 재개하세요.</p>
              <div className="action-row end">
                <button type="button" className="secondary-button" onClick={() => endSession('manual')}>
                  종료
                </button>
                <button type="button" className="primary-button" onClick={resumeSession}>
                  재개
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderResult() {
    if (!resultSession) {
      return (
        <div className="page-shell">
          <div className="empty-card">세션 결과가 없습니다.</div>
        </div>
      )
    }

    return (
      <div className="page-shell result-shell">
        <section className="result-hero">
          <span>세션 저장 완료</span>
          <h2>수고하셨습니다.</h2>
          <p>
            {resultSession.subject} · {resultSession.mode} · {new Date(resultSession.createdAt).toLocaleString('ko-KR')}
          </p>
        </section>

        <div className="stats-grid result-stats">
          <article className="stat-card">
            <span>총 학습 시간</span>
            <strong>{formatDuration(resultSession.elapsedSeconds)}</strong>
          </article>
          <article className="stat-card">
            <span>실제 집중 시간</span>
            <strong>{formatDuration(resultSession.focusedSeconds)}</strong>
          </article>
          <article className="stat-card">
            <span>평균 집중도</span>
            <strong>{resultSession.avgScore}</strong>
          </article>
        </div>

        <div className="two-column">
          <section className="card">
            <div className="card-header">
              <h3>방해 요소 분석</h3>
            </div>
            <div className="session-list">
              <div className="session-row">
                <div>
                  <strong>탭 전환</strong>
                  <small>브라우저 이탈 감지</small>
                </div>
                <span className="session-score">{resultSession.tabSwitches}회</span>
              </div>
              <div className="session-row">
                <div>
                  <strong>입력 비활성</strong>
                  <small>키보드·마우스 활동 감소</small>
                </div>
                <span className="session-score">{resultSession.idleEvents}회</span>
              </div>
              <div className="session-row">
                <div>
                  <strong>자리 비움</strong>
                  <small>긴 시간 브라우저 이탈</small>
                </div>
                <span className="session-score">{resultSession.absenceEvents}회</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3>세션 메모</h3>
            </div>
            <label className="note-field">
              <span>공부한 내용</span>
              <textarea
                name="studied"
                value={resultSession.notes.studied}
                onChange={(event) => updateResultNotes('studied', event.target.value)}
                placeholder="오늘 해결한 문제나 공부한 내용을 적어 주세요."
              />
            </label>
            <label className="note-field">
              <span>집중이 흔들린 이유</span>
              <textarea
                name="distraction"
                value={resultSession.notes.distraction}
                onChange={(event) => updateResultNotes('distraction', event.target.value)}
                placeholder="예: 점심 직후 졸림, 메신저 확인"
              />
            </label>
            <label className="note-field">
              <span>다음 목표</span>
              <textarea
                name="nextGoal"
                value={resultSession.notes.nextGoal}
                onChange={(event) => updateResultNotes('nextGoal', event.target.value)}
                placeholder="다음 세션에서 달성하고 싶은 목표를 적어 주세요."
              />
            </label>
            <button type="button" className="primary-button" onClick={() => navigate('dashboard')}>
              대시보드로 돌아가기
            </button>
          </section>
        </div>
      </div>
    )
  }

  function renderReport() {
    return renderReportPage()
  }

  function renderReportPage() {
    const recentSessions = sessions.slice(0, 6)
    const hourlyStudyCells = dashboardMetrics.hourlyStudyCells
    const maxHourlyStudySeconds = dashboardMetrics.maxHourlyStudySeconds

    return (
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h2>학습 리포트</h2>
            <p>세션 기록을 바탕으로 집중도, 과목별 흐름, 방해 요인을 한 번에 확인합니다.</p>
          </div>
          <div className="page-actions">
            <button type="button" className="ghost-button" onClick={() => navigate('announcements')}>
              공지사항 보기
            </button>
            <button type="button" className="ghost-button" onClick={() => navigate('support')}>
              문의/신고
            </button>
            <button type="button" className="primary-button" onClick={() => void handleDownloadReportPdf()} disabled={pdfBusy}>
              {pdfBusy ? 'PDF 생성 중...' : 'PDF 다운로드'}
            </button>
          </div>
        </div>

        <div ref={reportExportRef} className="report-export-shell">
          <div className="stats-grid">
            <article className="stat-card metric-range">
              <span>최근 30일 평균 집중도</span>
              <strong>{dashboardMetrics.last30Days.average || 0}</strong>
              <small>/ 100</small>
            </article>
            <article className="stat-card metric-time">
              <span>최근 30일 학습 시간</span>
              <strong>{formatStudyDuration(dashboardMetrics.last30Days.studySeconds)}</strong>
              <small>캘린더 일자 기준 · {dashboardMetrics.last30Days.calendarLabel}</small>
            </article>
            <article className="stat-card metric-alert">
              <span>탭 전환 방해</span>
              <strong>{dashboardMetrics.disturbanceTotals.tabSwitches}</strong>
              <small>{dashboardMetrics.focusRange.label} 누적</small>
            </article>
            <article className="stat-card metric-goal">
              <span>목표 달성률</span>
              <strong>{formatPercent(dashboardMetrics.goalPercent)}</strong>
              <small>일일 목표 기준</small>
            </article>
          </div>

          <div className="two-column">
            <section className="card report-card">
              <div className="card-header">
                <h3>시간대별 학습 시간</h3>
                <span className="badge subtle">{dashboardMetrics.focusRange.label} · 방해 요인 포함</span>
              </div>
              <div className="hourly-study-chart" aria-label="시간대별 학습 시간 그래프">
                {hourlyStudyCells.map((cell) => {
                  const heightPercent = cell.studySeconds
                    ? clamp((cell.studySeconds / maxHourlyStudySeconds) * 100, 8, 100)
                    : 0

                  return (
                    <div key={cell.hour} className="hourly-study-column">
                      <span>{cell.studySeconds ? formatStudyDuration(cell.studySeconds) : '0분'}</span>
                      <div className="hourly-study-bar">
                        <div
                          className="hourly-study-bar-fill"
                          style={{
                            height: `${heightPercent}%`,
                            backgroundColor: cell.score ? scoreColor(cell.score) : undefined,
                          }}
                        />
                      </div>
                      <strong>{formatCompactHour(cell.hour)}</strong>
                      <small>방해 {cell.disturbanceCount}</small>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="card report-card">
              <div className="card-header">
                <h3>시간대별 집중 흐름</h3>
                <span className="badge subtle">{dashboardMetrics.focusRange.label} 점수</span>
              </div>
              <div className="heatmap-grid">
                {dashboardMetrics.hourlyCells.map((cell) => (
                  <div key={cell.hour} className="heatmap-cell-wrap">
                    <div
                      className="heatmap-cell"
                      style={{ backgroundColor: cell.score ? scoreColor(cell.score) : '#e2e8f0' }}
                    />
                    <span>{formatCompactHour(cell.hour)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card report-card">
              <div className="card-header">
                <h3>방해 요인 분포</h3>
                <span className="badge subtle">탭 전환 · 입력 비활성 · 자리 비움</span>
              </div>
              <DisturbanceDonut items={disturbanceItems} />
            </section>
          </div>

          <div className="two-column">
            <section className="card report-card">
              <div className="card-header">
                <h3>과목별 집중 비교</h3>
                <span className="badge subtle">{dashboardMetrics.subjectStats.length || 0}개 과목</span>
              </div>
              <div className="bar-list">
                {(
                  dashboardMetrics.subjectStats.length
                    ? dashboardMetrics.subjectStats
                    : SUBJECTS.slice(0, 4).map((subject) => ({ subject, score: 0 }))
                ).map((entry) => (
                  <div key={entry.subject} className="bar-row">
                    <span>{entry.subject}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.max(entry.score, 8)}%`,
                          backgroundColor: scoreColor(entry.score),
                        }}
                      />
                    </div>
                    <strong>{entry.score || '-'}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="card report-card">
              <div className="card-header">
                <h3>지난 주 대비 변화</h3>
                <span className="badge subtle">비교 요약</span>
              </div>
              <div className="comparison-list">
                <div>
                  <span>평균 집중도</span>
                  <strong>
                    {dashboardMetrics.comparison.focus >= 0 ? '+' : ''}
                    {dashboardMetrics.comparison.focus}점
                  </strong>
                </div>
                <div>
                  <span>학습 시간</span>
                  <strong>
                    {dashboardMetrics.comparison.studyMinutes >= 0 ? '+' : ''}
                    {dashboardMetrics.comparison.studyMinutes}분
                  </strong>
                </div>
                <div>
                  <span>탭 전환 방해</span>
                  <strong>
                    {dashboardMetrics.comparison.tabSwitches >= 0 ? '+' : ''}
                    {dashboardMetrics.comparison.tabSwitches}회
                  </strong>
                </div>
              </div>
            </section>
          </div>

          <div className="two-column">
            <section className="card report-card">
              <div className="card-header">
                <h3>최근 저장된 세션</h3>
                <span className="badge subtle">{recentSessions.length}</span>
              </div>
              <div className="session-list">
                {recentSessions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="session-row session-row-button"
                    onClick={() => {
                      setResultSessionId(entry.id)
                      navigate('result')
                    }}
                  >
                    <div>
                      <strong>
                        {entry.subject} · {entry.mode}
                      </strong>
                      <small>{formatDateTime(entry.createdAt)}</small>
                    </div>
                    <div>
                      <span>평균 {entry.avgScore}점</span>
                      <small>{formatDuration(entry.elapsedSeconds)}</small>
                    </div>
                  </button>
                ))}
                {!recentSessions.length && <div className="empty-card">아직 저장된 세션이 없습니다.</div>}
              </div>
            </section>

            <section className="card report-card">
              <div className="card-header">
                <h3>최근 메모 요약</h3>
                <span className="badge subtle">{resultSession ? '최신 세션' : '데이터 없음'}</span>
              </div>
              {resultSession ? (
                <div className="settings-section-stack">
                  <div className="settings-section-note">
                    <strong>오늘 공부한 내용</strong>
                    <p>{resultSession.notes.studied || '아직 작성된 메모가 없습니다.'}</p>
                  </div>
                  <div className="settings-section-note">
                    <strong>방해 요인 메모</strong>
                    <p>{resultSession.notes.distraction || '기록된 방해 요인이 없습니다.'}</p>
                  </div>
                  <div className="settings-section-note">
                    <strong>다음 목표</strong>
                    <p>{resultSession.notes.nextGoal || '다음 목표가 아직 정리되지 않았습니다.'}</p>
                  </div>
                </div>
              ) : (
                <div className="empty-card">세션을 하나 이상 저장하면 메모 요약이 표시됩니다.</div>
              )}
            </section>
          </div>
        </div>
      </div>
    )
  }

  function renderAnnouncementsPage() {
    return (
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h2>공지사항</h2>
            <p>서비스 점검, 기능 변경, 운영 안내를 한 곳에서 확인합니다.</p>
          </div>
          <span className="badge subtle">{announcements.length}건</span>
        </div>

        <section className="card announcement-hero">
          <div className="card-header">
            <h3>현재 노출 중인 공지</h3>
            <span className="badge subtle">상단 배너 기준</span>
          </div>
          {activeAnnouncement ? (
            <div className="announcement-active-detail">
              <div className="announcement-detail-block">
                <span>제목</span>
                <strong>{activeAnnouncement.title}</strong>
              </div>
              <div className="announcement-detail-block">
                <span>내용</span>
                <p>{activeAnnouncement.body}</p>
              </div>
              <div className="announcement-time-grid">
                <div>
                  <span>노출 시작</span>
                  <strong>{formatDateTime(activeAnnouncement.startsAt)}</strong>
                </div>
                <div>
                  <span>노출 종료</span>
                  <strong>{formatDateTime(activeAnnouncement.endsAt)}</strong>
                </div>
                <div>
                  <span>마지막 수정</span>
                  <strong>{formatDateTime(activeAnnouncement.updatedAt)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-card">현재 노출 중인 공지사항이 없습니다.</div>
          )}
        </section>

        <div className="announcement-list">
          {announcements.map((entry) => {
            const state = announcementState(entry)

            return (
              <article key={entry.id} className="announcement-card">
                <div className="announcement-header">
                  <div>
                    <h3>{entry.title}</h3>
                    <div className="announcement-badges">
                      {entry.isPinned && <span className="badge warn">고정</span>}
                      <span className={`badge ${entry.tone}`}>{entry.tone.toUpperCase()}</span>
                      <span className={`badge ${state.tone}`}>{state.label}</span>
                    </div>
                  </div>
                  <span className={`badge ${entry.isActive ? 'good' : 'subtle'}`}>
                    {entry.isActive ? '노출 중' : '비활성'}
                  </span>
                </div>
                <p>{entry.body}</p>
                <div className="announcement-meta">
                  <span>시작 {formatDateTime(entry.startsAt)}</span>
                  <span>종료 {formatDateTime(entry.endsAt)}</span>
                  <span>수정 {formatDateTime(entry.updatedAt)}</span>
                </div>
              </article>
            )
          })}
          {!announcements.length && <div className="empty-card">등록된 공지사항이 없습니다.</div>}
        </div>
      </div>
    )
  }

  function renderSupportPage() {
    const selectedSupportCategory =
      SUPPORT_CATEGORY_OPTIONS.find((option) => option.id === supportForm.category) ?? SUPPORT_CATEGORY_OPTIONS[0]

    return (
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h2>문의 / 신고</h2>
            <p>오류 제보, 계정 문제, 일반 문의를 남기면 관리자 페이지에서 바로 처리됩니다.</p>
          </div>
          <span className="badge subtle">{supportTickets.length}건</span>
        </div>

        <div className="support-layout">
          <section className="card support-compose-card">
            <div className="card-header">
              <div>
                <h3>새 문의 작성</h3>
                <p className="admin-section-copy">오류가 난 화면, 발생 시점, 원하는 처리를 함께 남겨 주세요.</p>
              </div>
              <span className="badge subtle">접수</span>
            </div>
            {appFeedback && <div className={`inline-alert ${appFeedback.tone} support-form-alert`}>{appFeedback.text}</div>}
            <form className="auth-form embedded-form" onSubmit={handleSubmitSupportTicket}>
              <fieldset className="support-category-field">
                <legend>문의 유형</legend>
                <div className="support-category-toggle" role="radiogroup" aria-label="문의 유형">
                  {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`support-category-button${supportForm.category === option.id ? ' selected' : ''}`}
                      role="radio"
                      aria-checked={supportForm.category === option.id}
                      onClick={() =>
                        setSupportForm((current) => ({
                          ...current,
                          category: option.id,
                        }))
                      }
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
                <div className="support-category-example">
                  <strong>{selectedSupportCategory.label} 작성 예시</strong>
                  <span>{selectedSupportCategory.example}</span>
                </div>
              </fieldset>
              <label>
                제목
                <input
                  name="supportSubject"
                  type="text"
                  value={supportForm.subject}
                  maxLength={SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
                  onChange={(event) =>
                    setSupportForm((current) => ({ ...current, subject: event.target.value }))
                  }
                  placeholder="어떤 문제가 있는지 한 줄로 적어 주세요."
                />
                <small className="field-counter">
                  {supportForm.subject.length}/{SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
                </small>
              </label>
              <label>
                내용
                <textarea
                  name="supportBody"
                  value={supportForm.body}
                  maxLength={SUPPORT_TICKET_BODY_MAX_LENGTH}
                  onChange={(event) => setSupportForm((current) => ({ ...current, body: event.target.value }))}
                  rows={7}
                  placeholder="발생 시점, 화면 위치, 기대한 동작을 함께 적어 주시면 더 빠르게 확인할 수 있습니다."
                />
                <small className="field-counter">
                  {supportForm.body.length}/{SUPPORT_TICKET_BODY_MAX_LENGTH}
                </small>
              </label>
              <div className="support-submit-row">
                <span>관리자 페이지에서 처리 상태와 답변을 확인합니다.</span>
                <button type="submit" className="primary-button" disabled={supportBusy}>
                  {supportBusy ? '접수 중...' : '문의 접수하기'}
                </button>
              </div>
            </form>
          </section>

          <section className="card support-history-card">
            <div className="card-header">
              <div>
                <h3>내 문의 내역</h3>
                <p className="admin-section-copy">최근 접수한 문의와 관리자 답변을 모아 봅니다.</p>
              </div>
              <span className="badge subtle">최근 순</span>
            </div>
            <div className="support-ticket-list">
              {supportTickets.map((ticket) => (
                <article key={ticket.id} className="support-ticket-card">
                  <div className="support-ticket-header">
                    <div>
                      <strong>{ticket.subject}</strong>
                      <div className="support-ticket-meta">
                        <span>{formatSupportCategory(ticket.category)}</span>
                        <span>{formatDateTime(ticket.createdAt)}</span>
                      </div>
                    </div>
                    <span className={`badge ${supportStatusTone(ticket.status)}`}>
                      {formatSupportStatus(ticket.status)}
                    </span>
                  </div>
                  <p className="support-ticket-body">{ticket.body}</p>
                  {ticket.adminReply && (
                    <div className="support-reply-box">
                      <strong>관리자 답변</strong>
                      <p>{ticket.adminReply}</p>
                      {ticket.answeredAt && <small>{formatDateTime(ticket.answeredAt)}</small>}
                    </div>
                  )}
                </article>
              ))}
              {!supportTickets.length && <div className="empty-card">아직 접수한 문의가 없습니다.</div>}
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderFeedback() {
    return (
      <div className="page-shell">
        {feedbackLoading && <div className="inline-alert good">AI 피드백을 서버에서 다시 계산하고 있습니다.</div>}
        {feedbackApiError && (
          <div className="inline-alert warn">
            {feedbackApiError} 로컬 집중도 분석 결과를 함께 표시합니다.
          </div>
        )}
        {feedbackProvider?.source === 'anthropic' && (
          <div className="inline-alert good">
            Claude 피드백 사용 중{feedbackProvider.model ? ` · ${feedbackProvider.model}` : ''}
          </div>
        )}
        {feedbackProvider?.source === 'local' && !feedbackApiError && (
          <div className="inline-alert warn">
            Claude API가 아직 설정되지 않았거나 일시적으로 응답하지 않아 로컬 분석 결과를 표시합니다.
          </div>
        )}
        <div className="feedback-banner">
          <div className="feedback-banner-icon">🤖</div>
          <div>
            <h2>AI 맞춤 피드백</h2>
            <p>{resolvedFeedbackInsights.summary}</p>
          </div>
        </div>

        <div className="two-column">
          <section className="card">
            <div className="feedback-block positive">
              <strong>강점 분석</strong>
              <p>{resolvedFeedbackInsights.strength}</p>
            </div>
            <div className="feedback-block warning">
              <strong>개선 포인트</strong>
              <p>{resolvedFeedbackInsights.caution}</p>
            </div>
            <div className="feedback-block tip">
              <strong>추천 전략</strong>
              <p>{resolvedFeedbackInsights.strategy}</p>
            </div>
          </section>

          <section className="card feedback-analytics-card">
            <div className="card-header">
              <h3>경험 분석</h3>
            </div>
            <div className="pattern-list">
              {resolvedFeedbackInsights.patterns.map((pattern) => (
                <div key={pattern.label} className="pattern-row">
                  <span>{pattern.label}</span>
                  <strong className={`pattern-tag ${pattern.tone}`}>{pattern.tag}</strong>
                </div>
              ))}
            </div>
            <div className="insight-summary">
              <div>
                <span>강한 과목</span>
                <strong>{resolvedFeedbackInsights.strongestSubject}</strong>
              </div>
              <div>
                <span>약한 과목</span>
                <strong>{resolvedFeedbackInsights.weakestSubject}</strong>
              </div>
              <div>
                <span>강한 시간대</span>
                <strong>{resolvedFeedbackInsights.bestBucket}</strong>
              </div>
              <div>
                <span>목표 추천</span>
                <strong>{resolvedFeedbackInsights.suggestedGoal}시간</strong>
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderAdmin() {
    if (!user?.isAdmin) {
      return (
        <div className="page-shell">
          <div className="inline-alert warn">관리자 권한이 필요합니다.</div>
        </div>
      )
    }

    return (
      <div className="page-shell admin-shell">
        <div className="page-header">
          <div>
            <h2>관리자 페이지</h2>
            <p>운영 지표, 사용자, 세션, 공지사항, 감사 로그, 시스템 상태를 관리합니다.</p>
          </div>
        </div>

        {adminLoading && <div className="inline-alert good">최신 관리자 데이터를 불러오는 중입니다.</div>}
        {adminError && <div className="inline-alert warn">{adminError}</div>}

        <div className="stats-grid">
          <section className="stat-card">
            <span>총 사용자</span>
            <strong>{adminOverview?.totals.totalUsers ?? 0}</strong>
            <small>관리자: {adminOverview?.totals.adminUsers ?? 0}</small>
          </section>
          <section className="stat-card">
            <span>총 세션</span>
            <strong>{adminOverview?.totals.totalSessions ?? 0}</strong>
            <small>누적 저장 세션</small>
          </section>
          <section className="stat-card">
            <span>오늘 세션</span>
            <strong>{adminOverview?.totals.sessionsToday ?? 0}</strong>
            <small>오늘 생성됨</small>
          </section>
          <section className="stat-card">
            <span>평균 집중도</span>
            <strong>{adminOverview?.totals.averageFocusScore ?? 0}</strong>
            <small>전체 세션 기준</small>
          </section>
          <section className="stat-card">
            <span>최근 7일 활성 사용자</span>
            <strong>{adminOverview?.totals.activeUsers7d ?? 0}</strong>
            <small>세션 활동 기준</small>
          </section>
          <section className="stat-card">
            <span>최근 7일 세션</span>
            <strong>{adminOverview?.totals.sessions7d ?? 0}</strong>
            <small>최근 추이</small>
          </section>
          <section className="stat-card">
            <span>활성 로그인 세션</span>
            <strong>{adminSystem?.activeAuthSessions ?? 0}</strong>
            <small>현재 유지 중</small>
          </section>
          <section className="stat-card">
            <span>공지사항</span>
            <strong>{adminOverview?.announcements.length ?? 0}</strong>
            <small>최근 등록 기록</small>
          </section>
        </div>

        <div className="admin-tabs">
          {[
            { id: 'overview', label: '개요' },
            { id: 'users', label: '사용자' },
            { id: 'sessions', label: '세션' },
            { id: 'announcements', label: '공지' },
            { id: 'discord', label: 'Discord' },
            { id: 'audit', label: '감사 로그' },
            { id: 'system', label: '시스템' },
            { id: 'support', label: '문의' },
          ].map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`admin-tab${adminSection === entry.id ? ' active' : ''}`}
              onClick={() => setAdminSection(entry.id as AdminSection)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {adminSection === 'overview' && (
          <>
            <div className="two-column">
              <section className="card">
                <div className="card-header">
                  <h3>최근 가입 사용자</h3>
                  <span className="badge subtle">{adminOverview?.recentUsers.length ?? 0}</span>
                </div>
                <div className="session-list">
                  {(adminOverview?.recentUsers ?? []).map((entry) => (
                    <div key={entry.id} className="session-row">
                      <div>
                        <strong>{entry.name}</strong>
                        <small>{entry.email}</small>
                      </div>
                      <div>
                        <span>{entry.isAdmin ? '관리자' : '일반 사용자'}</span>
                        <small>{formatDateTime(entry.createdAt)}</small>
                      </div>
                    </div>
                  ))}
                  {!adminOverview?.recentUsers.length && !adminLoading && (
                    <div className="empty-card">최근 가입 사용자 데이터가 아직 없습니다.</div>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h3>최근 세션</h3>
                  <span className="badge subtle">{adminOverview?.recentSessions.length ?? 0}</span>
                </div>
                <div className="session-list">
                  {(adminOverview?.recentSessions ?? []).map((entry) => (
                    <div key={entry.sessionId} className="session-row">
                      <div>
                        <strong>{entry.subject}</strong>
                        <small>{entry.userName} | {entry.userEmail}</small>
                      </div>
                      <div>
                        <span>평균 {entry.avgScore}</span>
                        <small>{formatDateTime(entry.createdAt)}</small>
                      </div>
                    </div>
                  ))}
                  {!adminOverview?.recentSessions.length && !adminLoading && (
                    <div className="empty-card">최근 세션 데이터가 아직 없습니다.</div>
                  )}
                </div>
              </section>
            </div>

            <div className="two-column">
              <section className="card">
                <div className="card-header">
                  <h3>주요 과목</h3>
                  <span className="badge subtle">{adminOverview?.topSubjects.length ?? 0}</span>
                </div>
                <div className="bar-list">
                  {(adminOverview?.topSubjects ?? []).map((entry) => (
                    <div key={entry.subject} className="bar-row">
                      <span>{entry.subject}</span>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${Math.max(entry.averageFocusScore, 8)}%`,
                            backgroundColor: scoreColor(entry.averageFocusScore),
                          }}
                        />
                      </div>
                      <strong>{entry.sessionCount}</strong>
                    </div>
                  ))}
                  {!adminOverview?.topSubjects.length && (
                    <div className="empty-card">과목 요약 데이터가 아직 없습니다.</div>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h3>최근 7일</h3>
                  <span className="badge subtle">일별</span>
                </div>
                <div className="session-list">
                  {(adminOverview?.dailyStats ?? []).map((entry) => (
                    <div key={entry.date} className="session-row">
                      <div>
                        <strong>{entry.date}</strong>
                        <small>신규 {entry.newUsers} | 세션 {entry.sessions}</small>
                      </div>
                      <div>
                        <span>평균 {entry.averageFocusScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="card">
              <div className="card-header">
                <h3>현재 노출 중인 공지 미리보기</h3>
                <span className="badge subtle">사용자 노출</span>
              </div>
              {activeAnnouncement ? (
                <div className={`inline-alert ${activeAnnouncement.tone}`}>
                  <strong>{activeAnnouncement.title}</strong> {activeAnnouncement.body}
                </div>
              ) : (
                <div className="empty-card">현재 활성화된 공지사항이 없습니다.</div>
              )}
            </section>
          </>
        )}

        {adminSection === 'users' && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>사용자 관리</h3>
                <p className="admin-section-copy">사용자를 검색하고 활동 이력을 필터링하며 관리자 권한을 변경합니다.</p>
              </div>
              <span className="badge subtle">{filteredAdminUsers.length}</span>
            </div>
            <div className="admin-filter-grid">
              <label className="admin-filter-field">
                <span>검색</span>
                <input
                  name="adminUserSearch"
                  type="text"
                  value={adminUserSearch}
                  onChange={(event) => setAdminUserSearch(event.target.value)}
                  placeholder="이름, 이메일, 과목"
                />
              </label>
              <label className="admin-filter-field">
                <span>권한</span>
                <select
                  name="adminUserRoleFilter"
                  value={adminUserRoleFilter}
                  onChange={(event) => setAdminUserRoleFilter(event.target.value as 'all' | 'admin' | 'member')}
                >
                  <option value="all">전체</option>
                  <option value="admin">관리자</option>
                  <option value="member">일반 사용자</option>
                </select>
              </label>
              <label className="admin-filter-field">
                <span>최근 활동</span>
                <select
                  name="adminUserActivityFilter"
                  value={adminUserActivityFilter}
                  onChange={(event) =>
                    setAdminUserActivityFilter(event.target.value as 'all' | '7d' | '30d' | 'none')
                  }
                >
                  <option value="all">전체</option>
                  <option value="7d">7일 이내</option>
                  <option value="30d">30일 이내</option>
                  <option value="none">세션 없음</option>
                </select>
              </label>
            </div>
            <div className="admin-list">
              {filteredAdminUsers.slice(0, 80).map((entry) => (
                <article key={entry.id} className="admin-user-card">
                  <div className="admin-user-main">
                    <div>
                      <div className="admin-user-title">
                        <strong>{entry.name}</strong>
                        <span className={`badge ${entry.isAdmin ? 'good' : 'subtle'}`}>
                          {entry.isAdmin ? '관리자' : '일반 사용자'}
                        </span>
                      </div>
                      <small>{entry.email}</small>
                    </div>
                    <div className="admin-user-metrics">
                      <span>세션 {entry.sessionCount}</span>
                      <span>평균 {entry.averageFocusScore}</span>
                      <span>학습 {formatDuration(entry.totalStudySeconds)}</span>
                    </div>
                  </div>
                  <div className="admin-user-footer">
                    <span className="admin-subject-copy">
                      {entry.subjects.length ? entry.subjects.join(', ') : '등록된 과목 없음'}
                    </span>
                    <span className="admin-subtle-copy">
                      최근 세션 {entry.lastSessionAt ? formatDateTime(entry.lastSessionAt) : '없음'}
                    </span>
                    <div className="admin-user-actions">
                      {entry.id === user.id ? (
                        <button type="button" className="ghost-button" disabled>
                          내 계정
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={entry.isAdmin ? 'secondary-button' : 'primary-button'}
                          onClick={() => handleToggleAdminRole(entry.id, !entry.isAdmin)}
                          disabled={adminRoleBusyUserId === entry.id}
                        >
                          {adminRoleBusyUserId === entry.id
                            ? '변경 중...'
                            : entry.isAdmin
                              ? '관리자 해제'
                              : '관리자 지정'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {!filteredAdminUsers.length && <div className="empty-card">조건에 맞는 사용자가 없습니다.</div>}
            </div>
          </div>
        )}

        {adminSection === 'sessions' && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>세션 관리</h3>
                <p className="admin-section-copy">검색어, 과목, 기간, 점수대 기준으로 세션을 필터링합니다.</p>
              </div>
              <span className="badge subtle">{filteredAdminSessions.length}</span>
            </div>
            <div className="admin-filter-grid">
              <label className="admin-filter-field">
                <span>검색</span>
                <input
                  name="adminSessionSearch"
                  type="text"
                  value={adminSessionSearch}
                  onChange={(event) => setAdminSessionSearch(event.target.value)}
                  placeholder="사용자, 이메일, 과목, 모드"
                />
              </label>
              <label className="admin-filter-field">
                <span>과목</span>
                <select
                  name="adminSessionSubjectFilter"
                  value={adminSessionSubjectFilter}
                  onChange={(event) => setAdminSessionSubjectFilter(event.target.value)}
                >
                  <option value="all">전체</option>
                  {adminSubjectOptions.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-filter-field">
                <span>기간</span>
                <select
                  name="adminSessionWindow"
                  value={adminSessionWindow}
                  onChange={(event) => setAdminSessionWindow(event.target.value as '7d' | '30d' | 'all')}
                >
                  <option value="7d">최근 7일</option>
                  <option value="30d">최근 30일</option>
                  <option value="all">전체</option>
                </select>
              </label>
              <label className="admin-filter-field">
                <span>점수대</span>
                <select
                  name="adminSessionScoreFilter"
                  value={adminSessionScoreFilter}
                  onChange={(event) =>
                    setAdminSessionScoreFilter(event.target.value as 'all' | 'high' | 'mid' | 'low')
                  }
                >
                  <option value="all">전체</option>
                  <option value="high">85+</option>
                  <option value="mid">70-84</option>
                  <option value="low">70 미만</option>
                </select>
              </label>
            </div>
            <div className="admin-list">
              {filteredAdminSessions.slice(0, 80).map((entry) => (
                <article key={entry.sessionId} className="admin-session-card">
                  <div className="admin-session-top">
                    <div>
                      <strong>{entry.subject} | {entry.mode}</strong>
                      <small>{entry.userName} | {entry.userEmail}</small>
                    </div>
                    <div className="admin-session-score">
                      <span>평균 {entry.avgScore}</span>
                      <small>{formatDateTime(entry.createdAt)}</small>
                    </div>
                  </div>
                  <div className="admin-session-metrics">
                    <span>목표 {entry.goalMinutes}분</span>
                    <span>총 학습 {formatDuration(entry.elapsedSeconds)}</span>
                    <span>집중 {formatDuration(entry.focusedSeconds)}</span>
                    <span>탭 전환 {entry.tabSwitches}</span>
                    <span>입력 비활성 {entry.idleEvents}</span>
                    <span>자리 비움 {entry.absenceEvents}</span>
                  </div>
                </article>
              ))}
              {!filteredAdminSessions.length && <div className="empty-card">조건에 맞는 세션이 없습니다.</div>}
            </div>
          </div>
        )}

        {adminSection === 'announcements' && (
          <div className="two-column">
            <section className="card">
              <div className="card-header">
                <div>
                  <h3>공지사항 편집기</h3>
                  <p className="admin-section-copy">로그인 화면과 앱 내부에 노출할 공지사항을 작성하고 수정합니다.</p>
                </div>
                <span className="badge subtle">{adminAnnouncementEditId ? '수정 중' : '새 공지'}</span>
              </div>
              <form className="auth-form embedded-form" onSubmit={handleSubmitAnnouncement}>
                <label>
                  제목
                  <input
                    name="announcementTitle"
                    value={adminAnnouncementForm.title}
                    onChange={(event) =>
                      setAdminAnnouncementForm((current) => ({ ...current, title: event.target.value }))
                    }
                    type="text"
                    placeholder="예: 오늘 22시에 서버 점검이 예정되어 있습니다."
                  />
                </label>
                <label>
                  내용
                  <textarea
                    name="announcementBody"
                    value={adminAnnouncementForm.body}
                    onChange={(event) =>
                      setAdminAnnouncementForm((current) => ({ ...current, body: event.target.value }))
                    }
                    placeholder="사용자에게 보여줄 공지 내용을 입력하세요."
                  />
                </label>
                <label>
                  공지 유형
                  <select
                    name="announcementTone"
                    value={adminAnnouncementForm.tone}
                    onChange={(event) =>
                      setAdminAnnouncementForm((current) => ({
                        ...current,
                        tone: event.target.value as Announcement['tone'],
                      }))
                    }
                  >
                    <option value="info">안내</option>
                    <option value="good">정상</option>
                    <option value="warn">주의</option>
                    <option value="danger">위험</option>
                  </select>
                </label>
                <label>
                  시작 시각
                  <input
                    name="announcementStartsAt"
                    value={adminAnnouncementForm.startsAt}
                    onChange={(event) =>
                      setAdminAnnouncementForm((current) => ({ ...current, startsAt: event.target.value }))
                    }
                    type="datetime-local"
                  />
                </label>
                <label>
                  종료 시각
                  <input
                    name="announcementEndsAt"
                    value={adminAnnouncementForm.endsAt}
                    onChange={(event) =>
                      setAdminAnnouncementForm((current) => ({ ...current, endsAt: event.target.value }))
                    }
                    type="datetime-local"
                  />
                </label>
                <button
                  type="button"
                  className={`toggle-row${adminAnnouncementForm.isActive ? ' on' : ''}`}
                  onClick={() =>
                    setAdminAnnouncementForm((current) => ({ ...current, isActive: !current.isActive }))
                  }
                >
                  <span>즉시 활성화</span>
                  <strong>{adminAnnouncementForm.isActive ? 'ON' : 'OFF'}</strong>
                </button>
                <button
                  type="button"
                  className={`toggle-row${adminAnnouncementForm.isPinned ? ' on' : ''}`}
                  onClick={() =>
                    setAdminAnnouncementForm((current) => ({ ...current, isPinned: !current.isPinned }))
                  }
                >
                  <span>상단 고정 공지</span>
                  <strong>{adminAnnouncementForm.isPinned ? 'ON' : 'OFF'}</strong>
                </button>
                <div className="action-row start">
                  <button type="button" className="secondary-button" onClick={resetAnnouncementComposer}>
                    초기화
                  </button>
                  <button type="submit" className="primary-button" disabled={adminAnnouncementBusy}>
                    {adminAnnouncementBusy ? '저장 중...' : adminAnnouncementEditId ? '공지 수정하기' : '공지 등록하기'}
                  </button>
                </div>
              </form>
            </section>

            <section className="card">
              <div className="card-header">
                <h3>최근 공지사항</h3>
                <span className="badge subtle">{adminOverview?.announcements.length ?? 0}</span>
              </div>
              <div className="admin-list">
                {(adminOverview?.announcements ?? []).map((entry) => (
                  <article key={entry.id} className="admin-user-card">
                    <div className="admin-user-main">
                      <div>
                        <div className="admin-user-title">
                          <strong>{entry.title}</strong>
                          <span className={`badge ${entry.isActive ? 'good' : 'subtle'}`}>
                            {entry.isActive ? '활성' : '비활성'}
                          </span>
                        </div>
                        {entry.isPinned && <div className="announcement-badges"><span className="badge warn">고정</span></div>}
                        <small>{entry.body}</small>
                      </div>
                      <div className="admin-user-metrics">
                        <span>{entry.tone}</span>
                        <span>시작 {formatDateTime(entry.startsAt)}</span>
                        <span>종료 {formatDateTime(entry.endsAt)}</span>
                      </div>
                    </div>
                    <div className="admin-user-footer">
                      <span className="admin-subtle-copy">수정됨 {formatDateTime(entry.updatedAt)}</span>
                      <div className="admin-user-actions">
                        <button type="button" className="primary-button" onClick={() => handleEditAnnouncement(entry)}>
                          수정
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={adminAnnouncementDeleteId === entry.id}
                          onClick={() => void handleDeleteAnnouncement(entry)}
                        >
                          {adminAnnouncementDeleteId === entry.id ? '삭제 중...' : '삭제'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!adminOverview?.announcements.length && (
                  <div className="empty-card">아직 등록된 공지사항이 없습니다.</div>
                )}
              </div>
            </section>
          </div>
        )}

        {adminSection === 'support' && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>문의 / 신고 관리</h3>
                <p className="admin-section-copy">
                  접수된 문의를 검색하고 상태를 바꾸거나 관리자 답변을 남길 수 있습니다.
                </p>
              </div>
              <span className="badge subtle">{filteredAdminSupportTickets.length}</span>
            </div>
            <div className="admin-filter-grid">
              <label className="admin-filter-field">
                <span>검색</span>
                <input
                  name="adminSupportSearch"
                  type="text"
                  value={adminSupportSearch}
                  onChange={(event) => setAdminSupportSearch(event.target.value)}
                  placeholder="이름, 이메일, 제목, 내용"
                />
              </label>
              <label className="admin-filter-field">
                <span>처리 상태</span>
                <select
                  name="adminSupportStatusFilter"
                  value={adminSupportStatusFilter}
                  onChange={(event) =>
                    setAdminSupportStatusFilter(event.target.value as 'all' | SupportTicketStatus)
                  }
                >
                  <option value="all">전체</option>
                  <option value="open">접수됨</option>
                  <option value="reviewing">검토 중</option>
                  <option value="resolved">해결됨</option>
                  <option value="closed">종료됨</option>
                </select>
              </label>
            </div>
            <div className="admin-list">
              {filteredAdminSupportTickets.map((entry) => {
                const draft = adminSupportDrafts[entry.id] ?? {
                  status: entry.status,
                  adminReply: entry.adminReply ?? '',
                }

                return (
                  <article key={entry.id} className="admin-user-card support-admin-card">
                    <div className="admin-user-main">
                      <div>
                        <div className="admin-user-title">
                          <strong>{entry.subject}</strong>
                          <span className={`badge ${supportStatusTone(entry.status)}`}>
                            {formatSupportStatus(entry.status)}
                          </span>
                          <span className="badge subtle">{formatSupportCategory(entry.category)}</span>
                        </div>
                        <small>
                          {entry.userName} | {entry.userEmail} | {formatDateTime(entry.createdAt)}
                        </small>
                      </div>
                    </div>
                    <p className="support-ticket-body">{entry.body}</p>
                    <div className="admin-filter-grid support-admin-grid">
                      <label className="admin-filter-field">
                        <span>처리 상태</span>
                        <select
                          name={`supportStatus-${entry.id}`}
                          value={draft.status}
                          onChange={(event) =>
                            setAdminSupportDrafts((current) => ({
                              ...current,
                              [entry.id]: {
                                status: event.target.value as SupportTicketStatus,
                                adminReply: draft.adminReply,
                              },
                            }))
                          }
                        >
                          <option value="open">접수됨</option>
                          <option value="reviewing">검토 중</option>
                          <option value="resolved">해결됨</option>
                          <option value="closed">종료됨</option>
                        </select>
                      </label>
                      <label className="admin-filter-field support-reply-field">
                        <span>관리자 답변</span>
                        <textarea
                          name={`supportReply-${entry.id}`}
                          value={draft.adminReply}
                          rows={5}
                          onChange={(event) =>
                            setAdminSupportDrafts((current) => ({
                              ...current,
                              [entry.id]: {
                                status: draft.status,
                                adminReply: event.target.value,
                              },
                            }))
                          }
                          placeholder="사용자에게 전달할 처리 내용이나 답변을 남겨 주세요."
                        />
                      </label>
                    </div>
                    <div className="admin-user-footer">
                      <span className="admin-subtle-copy">
                        최근 답변 {entry.answeredAt ? formatDateTime(entry.answeredAt) : '아직 없음'}
                      </span>
                      <span className="admin-subtle-copy">업데이트 {formatDateTime(entry.updatedAt)}</span>
                      <div className="admin-user-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void handleAdminSupportSave(entry.id)}
                          disabled={adminSupportBusyTicketId === entry.id}
                        >
                          {adminSupportBusyTicketId === entry.id ? '저장 중...' : '처리 내용 저장'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
              {!filteredAdminSupportTickets.length && (
                <div className="empty-card">조건에 맞는 문의 내역이 없습니다.</div>
              )}
            </div>
          </div>
        )}

        {adminSection === 'discord' && (
          <div className="two-column">
            <section className="card">
              <div className="card-header">
                <div>
                  <h3>Discord 봇 설정</h3>
                  <p className="admin-section-copy">
                    웹 서버 내부에서 실행되는 Discord 관리자 봇의 접속 정보를 관리합니다.
                  </p>
                </div>
                <span className={`badge ${discordBotStatusTone(discordBotStatus)}`}>
                  {discordBotStatusLabel(discordBotStatus)}
                </span>
              </div>

              <form className="auth-form embedded-form" onSubmit={handleSubmitDiscordBotSettings}>
                {!discordBotTokenStorageReady && (
                  <div className="inline-alert warn">{DISCORD_BOT_TOKEN_STORAGE_UNAVAILABLE_MESSAGE}</div>
                )}

                <label>
                  봇 토큰
                  <input
                    name="discordBotToken"
                    type="password"
                    value={discordBotForm.botToken}
                    onChange={(event) =>
                      setDiscordBotForm((current) => ({
                        ...current,
                        botToken: event.target.value,
                        clearToken: false,
                      }))
                    }
                    placeholder={
                      discordBotSettings?.tokenConfigured
                        ? `등록됨 ${discordBotSettings.tokenPreview ?? ''}`
                        : 'Discord bot token'
                    }
                  />
                </label>

                {discordBotSettings?.tokenConfigured && (
                  <button
                    type="button"
                    className={`toggle-row${discordBotForm.clearToken ? ' on' : ''}`}
                    onClick={() =>
                      setDiscordBotForm((current) => ({
                        ...current,
                        clearToken: !current.clearToken,
                        botToken: '',
                      }))
                    }
                  >
                    <span>저장된 토큰 삭제</span>
                    <strong>{discordBotForm.clearToken ? 'ON' : 'OFF'}</strong>
                  </button>
                )}

                <label>
                  애플리케이션 ID
                  <input
                    name="discordClientId"
                    type="text"
                    value={discordBotForm.clientId}
                    onChange={(event) =>
                      setDiscordBotForm((current) => ({ ...current, clientId: event.target.value }))
                    }
                    placeholder="Discord application ID"
                  />
                </label>

                <label>
                  서버 ID
                  <input
                    name="discordGuildIds"
                    type="text"
                    value={discordBotForm.guildIds}
                    onChange={(event) =>
                      setDiscordBotForm((current) => ({ ...current, guildIds: event.target.value }))
                    }
                    placeholder="여러 개면 쉼표로 구분"
                  />
                </label>

                <label>
                  관리자 채널 ID
                  <input
                    name="discordAdminChannelId"
                    type="text"
                    value={discordBotForm.adminChannelId}
                    onChange={(event) =>
                      setDiscordBotForm((current) => ({ ...current, adminChannelId: event.target.value }))
                    }
                    placeholder="봇 명령과 알림을 허용할 채널"
                  />
                </label>

                <label>
                  관리자 역할 ID
                  <input
                    name="discordAdminRoleIds"
                    type="text"
                    value={discordBotForm.adminRoleIds}
                    onChange={(event) =>
                      setDiscordBotForm((current) => ({ ...current, adminRoleIds: event.target.value }))
                    }
                    placeholder="여러 개면 쉼표로 구분"
                  />
                </label>

                <label>
                  봇 액터 사용자 ID
                  <input
                    name="discordBotActorUserId"
                    type="text"
                    value={discordBotForm.botActorUserId}
                    onChange={(event) =>
                      setDiscordBotForm((current) => ({ ...current, botActorUserId: event.target.value }))
                    }
                    placeholder="비워두면 첫 관리자 계정"
                  />
                </label>

                <label>
                  관리자 URL
                  <input
                    name="discordAdminUrl"
                    type="url"
                    value={discordBotForm.adminUrl}
                    onChange={(event) =>
                      setDiscordBotForm((current) => ({ ...current, adminUrl: event.target.value }))
                    }
                    placeholder="https://focusai.example/admin"
                  />
                </label>

                <div className="admin-filter-grid">
                  <label className="admin-filter-field">
                    <span>문의 확인 주기(ms)</span>
                    <input
                      name="discordSupportPollMs"
                      type="number"
                      min={5000}
                      max={3600000}
                      value={discordBotForm.supportPollMs}
                      onChange={(event) =>
                        setDiscordBotForm((current) => ({
                          ...current,
                          supportPollMs: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="admin-filter-field">
                    <span>상태 확인 주기(ms)</span>
                    <input
                      name="discordHealthPollMs"
                      type="number"
                      min={5000}
                      max={3600000}
                      value={discordBotForm.healthPollMs}
                      onChange={(event) =>
                        setDiscordBotForm((current) => ({
                          ...current,
                          healthPollMs: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="admin-filter-field">
                    <span>일일 요약 시각</span>
                    <input
                      name="discordDailySummaryHour"
                      type="number"
                      min={0}
                      max={23}
                      value={discordBotForm.dailySummaryHour}
                      onChange={(event) =>
                        setDiscordBotForm((current) => ({
                          ...current,
                          dailySummaryHour: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className={`toggle-row${discordBotForm.registerCommands ? ' on' : ''}`}
                  onClick={() =>
                    setDiscordBotForm((current) => ({
                      ...current,
                      registerCommands: !current.registerCommands,
                    }))
                  }
                >
                  <span>Slash command 등록</span>
                  <strong>{discordBotForm.registerCommands ? 'ON' : 'OFF'}</strong>
                </button>

                <div className="action-row start">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={discordBotBusy || !discordBotTokenStorageReady}
                  >
                    {discordBotBusy ? '저장 중...' : '설정 저장'}
                  </button>
                  {discordBotSettings?.enabled ? (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void handleStopDiscordBot()}
                      disabled={discordBotBusy}
                    >
                      비활성화
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void handleStartDiscordBot()}
                      disabled={discordBotBusy || !discordBotTokenStorageReady}
                    >
                      활성화
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card">
              <div className="card-header">
                <h3>Discord 봇 상태</h3>
                <span className={`badge ${discordBotStatusTone(discordBotStatus)}`}>
                  {discordBotStatusLabel(discordBotStatus)}
                </span>
              </div>
              <div className="comparison-list">
                <div>
                  <span>활성 설정</span>
                  <strong>{discordBotSettings?.enabled ? 'ON' : 'OFF'}</strong>
                </div>
                <div>
                  <span>토큰</span>
                  <strong>{discordBotSettings?.tokenConfigured ? '등록됨' : '미등록'}</strong>
                </div>
                <div>
                  <span>봇 계정</span>
                  <strong>{discordBotStatus?.botUserTag ?? '-'}</strong>
                </div>
                <div>
                  <span>마지막 시작</span>
                  <strong>{formatDiscordBotDateTime(discordBotStatus?.lastStartedAt, formatDateTime)}</strong>
                </div>
                <div>
                  <span>마지막 중지</span>
                  <strong>{formatDiscordBotDateTime(discordBotStatus?.lastStoppedAt, formatDateTime)}</strong>
                </div>
                <div>
                  <span>마지막 수정</span>
                  <strong>{formatDiscordBotDateTime(discordBotSettings?.updatedAt, formatDateTime)}</strong>
                </div>
              </div>
              {discordBotStatus?.lastError && (
                <div className="inline-alert warn">{discordBotStatus.lastError}</div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h3>Lost Ark Discord 봇</h3>
                  <p className="admin-section-copy">
                    프로젝트 폴더의 별도 Lost Ark 관리자 봇을 웹 관리자 화면에서 실행하고 중지합니다.
                  </p>
                </div>
                <span className={`badge ${discordBotStatusTone(lostarkDiscordBotStatus)}`}>
                  {discordBotStatusLabel(lostarkDiscordBotStatus)}
                </span>
              </div>

              <form className="auth-form embedded-form" onSubmit={handleSubmitLostarkDiscordBotSettings}>
                {!lostarkDiscordBotTokenStorageReady && (
                  <div className="inline-alert warn">{DISCORD_BOT_TOKEN_STORAGE_UNAVAILABLE_MESSAGE}</div>
                )}

                <label>
                  봇 토큰
                  <input
                    name="lostarkDiscordBotToken"
                    type="password"
                    value={lostarkDiscordBotForm.botToken}
                    onChange={(event) =>
                      setLostarkDiscordBotForm((current) => ({
                        ...current,
                        botToken: event.target.value,
                        clearToken: false,
                      }))
                    }
                    placeholder={
                      lostarkDiscordBotSettings?.tokenConfigured
                        ? `등록됨 ${lostarkDiscordBotSettings.tokenPreview ?? ''}`
                        : 'Discord bot token'
                    }
                  />
                </label>

                {lostarkDiscordBotSettings?.tokenConfigured && (
                  <button
                    type="button"
                    className={`toggle-row${lostarkDiscordBotForm.clearToken ? ' on' : ''}`}
                    onClick={() =>
                      setLostarkDiscordBotForm((current) => ({
                        ...current,
                        clearToken: !current.clearToken,
                        botToken: '',
                      }))
                    }
                  >
                    <span>저장된 토큰 삭제</span>
                    <strong>{lostarkDiscordBotForm.clearToken ? 'ON' : 'OFF'}</strong>
                  </button>
                )}

                <label>
                  애플리케이션 ID
                  <input
                    name="lostarkDiscordClientId"
                    type="text"
                    value={lostarkDiscordBotForm.clientId}
                    onChange={(event) =>
                      setLostarkDiscordBotForm((current) => ({ ...current, clientId: event.target.value }))
                    }
                    placeholder="Discord application ID"
                  />
                </label>

                <label>
                  서버 ID
                  <input
                    name="lostarkDiscordGuildIds"
                    type="text"
                    value={lostarkDiscordBotForm.guildIds}
                    onChange={(event) =>
                      setLostarkDiscordBotForm((current) => ({ ...current, guildIds: event.target.value }))
                    }
                    placeholder="개발 서버 ID 또는 운영 서버 ID"
                  />
                </label>

                <button
                  type="button"
                  className={`toggle-row${lostarkDiscordBotForm.registerCommands ? ' on' : ''}`}
                  onClick={() =>
                    setLostarkDiscordBotForm((current) => ({
                      ...current,
                      registerCommands: !current.registerCommands,
                    }))
                  }
                >
                  <span>Slash command 등록</span>
                  <strong>{lostarkDiscordBotForm.registerCommands ? 'ON' : 'OFF'}</strong>
                </button>

                <div className="comparison-list">
                  <div>
                    <span>활성 설정</span>
                    <strong>{lostarkDiscordBotSettings?.enabled ? 'ON' : 'OFF'}</strong>
                  </div>
                  <div>
                    <span>토큰</span>
                    <strong>{lostarkDiscordBotSettings?.tokenConfigured ? '등록됨' : '미등록'}</strong>
                  </div>
                  <div>
                    <span>마지막 시작</span>
                    <strong>
                      {formatDiscordBotDateTime(lostarkDiscordBotStatus?.lastStartedAt, formatDateTime)}
                    </strong>
                  </div>
                  <div>
                    <span>마지막 중지</span>
                    <strong>
                      {formatDiscordBotDateTime(lostarkDiscordBotStatus?.lastStoppedAt, formatDateTime)}
                    </strong>
                  </div>
                </div>

                {lostarkDiscordBotStatus?.lastError && (
                  <div className="inline-alert warn">{lostarkDiscordBotStatus.lastError}</div>
                )}

                <div className="action-row start">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={lostarkDiscordBotBusy || !lostarkDiscordBotTokenStorageReady}
                  >
                    {lostarkDiscordBotBusy ? '저장 중...' : '설정 저장'}
                  </button>
                  {lostarkDiscordBotSettings?.enabled ? (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void handleStopLostarkDiscordBot()}
                      disabled={lostarkDiscordBotBusy}
                    >
                      비활성화
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void handleStartLostarkDiscordBot()}
                      disabled={lostarkDiscordBotBusy || !lostarkDiscordBotTokenStorageReady}
                    >
                      활성화
                    </button>
                  )}
                </div>
              </form>
            </section>
          </div>
        )}

        {adminSection === 'audit' && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>관리자 감사 로그</h3>
                <p className="admin-section-copy">권한 변경, 공지 수정, 기타 관리자 작업 이력을 확인합니다.</p>
              </div>
              <span className="badge subtle">{adminOverview?.auditLogs.length ?? 0}</span>
            </div>
            <div className="session-list">
              {(adminOverview?.auditLogs ?? []).map((entry) => (
                <div key={entry.id} className="session-row">
                  <div>
                    <strong>{entry.summary}</strong>
                    <small>{entry.actorName} | {entry.actorEmail} | {entry.actionType}</small>
                    {entry.details && <small>{entry.details}</small>}
                  </div>
                  <div>
                    <span>{entry.targetType}{entry.targetId ? ` #${entry.targetId}` : ''}</span>
                    <small>{formatDateTime(entry.createdAt)}</small>
                  </div>
                </div>
              ))}
              {!adminOverview?.auditLogs.length && (
                <div className="empty-card">아직 관리자 감사 로그가 없습니다.</div>
              )}
            </div>
          </div>
        )}

        {adminSection === 'system' && (
          <>
            <div className="stats-grid">
              <section className="stat-card">
                <span>MariaDB</span>
                <strong>{adminSystem?.mariaReachable ? '정상' : '점검 필요'}</strong>
                <small>{adminSystem?.mariaEnabled ? '설정됨' : '미설정'}</small>
              </section>
              <section className="stat-card">
                <span>Claude API</span>
                <strong>{adminSystem?.anthropicEnabled ? '활성' : '비활성'}</strong>
                <small>AI 피드백 엔진</small>
              </section>
              <section className="stat-card">
                <span>만료 예정 세션</span>
                <strong>{adminSystem?.authSessionsExpiringSoon ?? 0}</strong>
                <small>24시간 이내</small>
              </section>
              <section className="stat-card">
                <span>세션 없는 사용자</span>
                <strong>{adminSystem?.usersWithoutSessions ?? 0}</strong>
                <small>온보딩 점검</small>
              </section>
            </div>

            <div className="two-column">
              <section className="card">
                <div className="card-header">
                  <h3>시스템 요약</h3>
                </div>
                <div className="comparison-list">
                  <div>
                    <span>환경</span>
                    <strong>{adminSystem?.nodeEnv ?? '-'}</strong>
                  </div>
                  <div>
                    <span>자동 마이그레이션</span>
                    <strong>{adminSystem?.autoMigrateSchema ? 'ON' : 'OFF'}</strong>
                  </div>
                  <div>
                    <span>최근 가입</span>
                    <strong>{formatDateTime(adminSystem?.lastUserCreatedAt ?? null)}</strong>
                  </div>
                  <div>
                    <span>최근 세션 저장</span>
                    <strong>{formatDateTime(adminSystem?.lastSessionCreatedAt ?? null)}</strong>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h3>Rate limit 상태</h3>
                  <span className="badge subtle">{adminSystem?.rateLimits.totalActiveBuckets ?? 0}개 버킷</span>
                </div>
                <div className="session-list">
                  {(adminSystem?.rateLimits.buckets ?? []).map((entry) => (
                    <div key={entry.bucket} className="session-row">
                      <div>
                        <strong>{entry.bucket}</strong>
                        <small>활성 키 수</small>
                      </div>
                      <span className="session-score">{entry.activeKeys}</span>
                    </div>
                  ))}
                  {!adminSystem?.rateLimits.buckets.length && (
                    <div className="empty-card">현재 활성화된 rate limit 버킷이 없습니다.</div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    )
  }
  function renderSettingsDetailed() {
    const settingsSections: Array<{
      id: SettingsSection
      label: string
      summary: string
      description: string
    }> = [
      {
        id: 'profile',
        label: '마이페이지',
        summary: user?.name ?? '프로필',
        description: '이름과 계정에 연결된 공부 과목을 관리합니다.',
      },
      {
        id: 'measurement',
        label: '서비스 설정',
        summary: `목표 ${settings.dailyGoalHours}시간`,
        description: '집중도 계산에 직접 반영되는 핵심 기준을 조정합니다.',
      },
      {
        id: 'session',
        label: '세션 기본값',
        summary: `${settings.defaultSessionMinutes}분 · ${settings.defaultSessionMode}`,
        description: '새 세션을 열 때 기본으로 채워질 시간과 모드를 정합니다.',
      },
      {
        id: 'alerts',
        label: '알림',
        summary: settings.focusAlert ? '집중 경고 ON' : '집중 경고 OFF',
        description: '경고, 휴식 리마인더, 소리 알림 방식을 관리합니다.',
      },
      {
        id: 'interface',
        label: '화면 표시',
        summary: settings.showLiveScore ? '실시간 점수 표시' : '실시간 점수 숨김',
        description: '학습 중 화면에 어떤 정보를 보여줄지 선택합니다.',
      },
      {
        id: 'privacy',
        label: '개인정보',
        summary: settings.saveRawVideo ? '원본 저장 ON' : '원본 저장 OFF',
        description: '카메라 저장 여부와 동의 이력을 확인합니다.',
      },
      {
        id: 'account',
        label: '계정 정보',
        summary: user?.email ?? '-',
        description: '현재 로그인 계정과 동기화 상태를 확인합니다.',
      },
      {
        id: 'security',
        label: '보안',
        summary: '비밀번호 관리',
        description: '계정 보안과 비밀번호 변경을 진행합니다.',
      },
      {
        id: 'danger',
        label: '계정 삭제',
        summary: '복구 불가',
        description: '모든 학습 기록과 계정을 영구 삭제합니다.',
      },
    ]

    const activeSection =
      settingsSections.find((section) => section.id === activeSettingsSection) ?? settingsSections[0]

    function renderSettingsSectionContent() {
      if (activeSettingsSection === 'profile') {
        return (
          <div className="settings-section-stack">
            <div className="settings-section-note">
              이 구역에서 바꾸는 프로필 정보는 별도 저장 버튼 없이 자동으로 반영됩니다.
            </div>
            <label className="settings-row settings-profile-name-row">
              <span>표시 이름</span>
              <input
                name="displayName"
                type="text"
                maxLength={120}
                value={user?.name ?? ''}
                onChange={(event) => updateDisplayName(event.target.value)}
                placeholder="이름을 입력해 주세요"
              />
            </label>
            <div className="settings-subject-block">
              <div className="settings-field-stack">
                <strong>자주 공부하는 과목</strong>
                <small>세션 시작 화면에 보여줄 과목을 직접 추가하고 삭제합니다.</small>
              </div>
              <label className="settings-row settings-subject-add-row">
                <span>과목 추가</span>
                <div className="subject-add-row">
                  <input
                    name="subjectDraft"
                    type="text"
                    value={subjectDraft}
                    onChange={(event) => setSubjectDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addPreferredSubject(subjectDraft)
                        setSubjectDraft('')
                      }
                    }}
                    placeholder="예: 수학, 영어, 정보처리기사"
                  />
                  <button
                    type="button"
                    className="icon-button compact-icon"
                    aria-label="과목 추가"
                    onClick={() => {
                      addPreferredSubject(subjectDraft)
                      setSubjectDraft('')
                    }}
                  >
                    +
                  </button>
                </div>
              </label>
              <div className="subject-edit-list">
                {user?.subjects.map((subject) => (
                  <span key={subject} className="subject-edit-chip">
                    {subject}
                    <button
                      type="button"
                      aria-label={`${subject} 삭제`}
                      onClick={() => removePreferredSubject(subject)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!user?.subjects.length && (
                  <div className="empty-card">아직 추가한 과목이 없습니다. 세션은 자율 학습으로 시작할 수 있습니다.</div>
                )}
              </div>
              <label className="settings-row compact-manual-subjects">
                <span>쉼표로 한 번에 편집</span>
                <input
                  name="manualSubjects"
                  type="text"
                  value={user?.subjects.join(', ') ?? ''}
                  onChange={(event) => updateSubjectsFromInput(event.target.value)}
                  placeholder="수학, 영어, 알고리즘"
                />
              </label>
            </div>
            <div className="settings-status-grid">
              <div className="settings-status-card">
                <span>프로필 이름</span>
                <strong>{user?.name ?? '-'}</strong>
                <small>상단 사용자 카드와 관리자 화면에도 동일하게 반영됩니다.</small>
              </div>
              <div className="settings-status-card">
                <span>선호 과목 수</span>
                <strong>{user?.subjects.length ?? 0}개</strong>
                <small>리포트와 AI 피드백의 과목 비교 기준으로 함께 사용됩니다.</small>
              </div>
            </div>
          </div>
        )
      }

      if (activeSettingsSection === 'measurement') {
        return (
          <div className="settings-section-stack">
            <div className="settings-section-note">
              목표 시간과 입력 비활성 기준은 집중도 점수와 리포트 분석 결과에 바로 반영됩니다.
            </div>
            <label className="settings-row">
              <span>일일 목표 시간</span>
              <input
                name="dailyGoalHours"
                type="number"
                min={1}
                max={8}
                value={settings.dailyGoalHours}
                onChange={(event) => updateDailyGoalHours(Number(event.target.value) || 1)}
              />
            </label>
            <label className="settings-row">
              <span>입력 비활성 기준(초)</span>
              <input
                name="idleThresholdSeconds"
                type="number"
                min={10}
                max={120}
                value={settings.idleThresholdSeconds}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    idleThresholdSeconds: clamp(Number(event.target.value) || 10, 10, 120),
                  }))
                }
              />
            </label>
            <div className="settings-status-grid">
              <div className="settings-status-card">
                <span>오늘 목표</span>
                <strong>{settings.dailyGoalHours}시간</strong>
                <small>대시보드 진행률과 AI 목표 추천의 기준으로 쓰입니다.</small>
              </div>
              <div className="settings-status-card">
                <span>집중 이탈 감지</span>
                <strong>{settings.idleThresholdSeconds}초</strong>
                <small>이 시간을 넘기면 입력 비활성 이벤트가 기록됩니다.</small>
              </div>
            </div>
          </div>
        )
      }

      if (activeSettingsSection === 'session') {
        return (
          <div className="settings-section-stack">
            <div className="settings-section-note">
              세션 설정 페이지를 열었을 때 기본으로 채워질 값들입니다. 자주 쓰는 패턴을 미리 저장해 둘 수 있습니다.
            </div>
            <label className="settings-row">
              <span>기본 세션 길이(분)</span>
              <input
                name="defaultSessionMinutes"
                type="number"
                min={15}
                max={180}
                step={15}
                value={settings.defaultSessionMinutes}
                onChange={(event) => {
                  const nextMinutes = clamp(Number(event.target.value) || 15, 15, 180)
                  setSettings((current) => ({
                    ...current,
                    defaultSessionMinutes: nextMinutes,
                  }))
                  if (!session) {
                    setSetup((current) => ({ ...current, durationMinutes: nextMinutes }))
                  }
                }}
              />
            </label>
            <div className="settings-subject-block">
              <div className="settings-field-stack">
                <strong>기본 세션 모드</strong>
                <small>세션 시작 화면에서 가장 먼저 선택되는 모드입니다.</small>
              </div>
              <div className="settings-mode-list">
                {SESSION_MODES.map((mode) => (
                  <button
                    key={mode.name}
                    type="button"
                    className={`mode-card${settings.defaultSessionMode === mode.name ? ' selected' : ''}`}
                    onClick={() => {
                      setSettings((current) => ({
                        ...current,
                        defaultSessionMode: mode.name,
                      }))
                      if (!session) {
                        setSetup((current) => ({ ...current, mode: mode.name }))
                      }
                    }}
                  >
                    <strong>{mode.name}</strong>
                    <span>{mode.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className={`toggle-row${settings.autoResumeSession ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  autoResumeSession: !current.autoResumeSession,
                }))
              }
            >
              <span>세션 자동 복구</span>
              <strong>{settings.autoResumeSession ? 'ON' : 'OFF'}</strong>
            </button>
            <button
              type="button"
              className={`toggle-row${settings.keepScreenAwake ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  keepScreenAwake: !current.keepScreenAwake,
                }))
              }
            >
              <span>학습 중 화면 꺼짐 방지</span>
              <strong>{settings.keepScreenAwake ? 'ON' : 'OFF'}</strong>
            </button>
            <div className="settings-status-grid">
              <div className="settings-status-card">
                <span>기본 세션</span>
                <strong>{settings.defaultSessionMinutes}분</strong>
                <small>{settings.defaultSessionMode}</small>
              </div>
              <div className="settings-status-card">
                <span>화면 꺼짐 방지</span>
                <strong>{wakeLockSupported ? '지원됨' : '브라우저 미지원'}</strong>
                <small>지원 브라우저에서만 실제로 동작하며, 세션 종료 시 자동 해제됩니다.</small>
              </div>
            </div>
          </div>
        )
      }

      if (activeSettingsSection === 'alerts') {
        return (
          <div className="settings-section-stack">
            <div className="settings-section-note">
              학습 흐름을 너무 방해하지 않으면서 꼭 필요한 순간에만 개입하도록 알림 방식을 조절합니다.
            </div>
            <button
              type="button"
              className={`toggle-row${settings.focusAlert ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({ ...current, focusAlert: !current.focusAlert }))
              }
            >
              <span>집중 이탈 경고</span>
              <strong>{settings.focusAlert ? 'ON' : 'OFF'}</strong>
            </button>
            <button
              type="button"
              className={`toggle-row${settings.breakReminder ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({ ...current, breakReminder: !current.breakReminder }))
              }
            >
              <span>45분 휴식 리마인더</span>
              <strong>{settings.breakReminder ? 'ON' : 'OFF'}</strong>
            </button>
            <button
              type="button"
              className={`toggle-row${settings.soundAlerts ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({ ...current, soundAlerts: !current.soundAlerts }))
              }
            >
              <span>소리 알림</span>
              <strong>{settings.soundAlerts ? 'ON' : 'OFF'}</strong>
            </button>
            <div className="settings-status-grid">
              <div className="settings-status-card">
                <span>경고 카드</span>
                <strong>{settings.focusAlert ? '노출됨' : '숨김'}</strong>
                <small>학습 화면 상단의 집중 경고 문구와 경고음을 함께 제어합니다.</small>
              </div>
              <div className="settings-status-card">
                <span>휴식 유도</span>
                <strong>{settings.breakReminder ? '활성화' : '비활성화'}</strong>
                <small>45분 이상 이어질 때 이벤트 로그와 안내 문구를 표시합니다.</small>
              </div>
            </div>
          </div>
        )
      }

      if (activeSettingsSection === 'interface') {
        return (
          <div className="settings-section-stack">
            <div className="settings-section-note">
              실시간 학습 화면에 어떤 정보를 보여줄지 정할 수 있습니다. 점수를 숨기면 현재 흐름에만 집중하기 쉬워집니다.
            </div>
            <button
              type="button"
              className={`toggle-row${settings.showLiveScore ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({ ...current, showLiveScore: !current.showLiveScore }))
              }
            >
              <span>실시간 집중도 표시</span>
              <strong>{settings.showLiveScore ? 'ON' : 'OFF'}</strong>
            </button>
            <button
              type="button"
              className={`toggle-row${settings.showEventLog ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({ ...current, showEventLog: !current.showEventLog }))
              }
            >
              <span>실시간 이벤트 로그 표시</span>
              <strong>{settings.showEventLog ? 'ON' : 'OFF'}</strong>
            </button>
            <button
              type="button"
              className={`toggle-row${settings.reduceMotion ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({ ...current, reduceMotion: !current.reduceMotion }))
              }
            >
              <span>모션 줄이기</span>
              <strong>{settings.reduceMotion ? 'ON' : 'OFF'}</strong>
            </button>
            <div className="settings-status-grid">
              <div className="settings-status-card">
                <span>실시간 점수 카드</span>
                <strong>{settings.showLiveScore ? '표시' : '숨김'}</strong>
                <small>숨김으로 바꾸면 결과 페이지와 리포트에서만 숫자를 확인합니다.</small>
              </div>
              <div className="settings-status-card">
                <span>움직임 효과</span>
                <strong>{settings.reduceMotion ? '최소화' : '기본'}</strong>
                <small>전환과 hover 움직임을 줄여 더 안정적인 화면으로 볼 수 있습니다.</small>
              </div>
            </div>
          </div>
        )
      }

      if (activeSettingsSection === 'privacy') {
        return (
          <div className="settings-section-stack">
            <button
              type="button"
              className={`toggle-row${settings.saveRawVideo ? ' on' : ''}`}
              onClick={() =>
                setSettings((current) => ({ ...current, saveRawVideo: !current.saveRawVideo }))
              }
            >
              <span>원본 영상 저장</span>
              <strong>{settings.saveRawVideo ? 'ON' : 'OFF'}</strong>
            </button>
            <div className="inline-alert warn">
              현재 MVP는 원본 영상을 서버에 저장하지 않고 브라우저 안에서만 사용합니다.
            </div>
            <div className="settings-status-grid">
              <div className="settings-status-card">
                <span>개인정보 동의 시각</span>
                <strong>{formatDateTime(user?.privacyConsentAt ?? null)}</strong>
                <small>회원가입 시 기록된 개인정보 처리 동의 이력입니다.</small>
              </div>
              <div className="settings-status-card">
                <span>카메라 안내 동의 시각</span>
                <strong>{formatDateTime(user?.cameraConsentAt ?? null)}</strong>
                <small>카메라 측정 안내를 확인한 시각입니다.</small>
              </div>
            </div>
          </div>
        )
      }

      if (activeSettingsSection === 'account') {
        return (
          <div className="settings-section-stack">
            <div className="settings-status-grid">
              <div className="settings-status-card">
                <span>로그인 이메일</span>
                <strong>{user?.email ?? '-'}</strong>
                <small>현재 세션과 동기화에 사용되는 기본 계정입니다.</small>
              </div>
              <div className="settings-status-card">
                <span>동의 버전</span>
                <strong>{user?.consentVersion ?? CONSENT_VERSION}</strong>
                <small>현재 계정에 저장된 동의 버전 정보입니다.</small>
              </div>
              <div className="settings-status-card">
                <span>저장 상태</span>
                <strong>{sessionSavePending ? '세션 저장 중' : '정상'}</strong>
                <small>세션 종료 후 MariaDB 반영 여부를 여기서 확인할 수 있습니다.</small>
              </div>
              <div className="settings-status-card">
                <span>카메라 상태</span>
                <strong>{cameraReady ? '준비됨' : '미연결'}</strong>
                <small>실시간 측정에 사용되는 전면 카메라 연결 상태입니다.</small>
              </div>
              <div className="settings-status-card">
                <span>인증 방식</span>
                <strong>{user?.authSource ?? 'mariadb'}</strong>
                <small>웹 배포 버전은 MariaDB 기반 계정으로 동작합니다.</small>
              </div>
              <div className="settings-status-card">
                <span>관리자 권한</span>
                <strong>{user?.isAdmin ? '관리자' : '일반 사용자'}</strong>
                <small>관리자 대시보드 접근 가능 여부를 표시합니다.</small>
              </div>
            </div>
            <div className="action-row start">
              <button type="button" className="secondary-button" onClick={reconnectSelectedCamera}>
                카메라 다시 연결
              </button>
            </div>
          </div>
        )
      }

      if (activeSettingsSection === 'security') {
        return (
          <div className="settings-section-stack">
            <div className="settings-section-note">
              비밀번호는 현재 값 확인 후 즉시 변경됩니다. 변경 뒤에는 새 비밀번호로 다시 로그인하게 됩니다.
            </div>
            <div className="auth-form embedded-form">
              <label>
                현재 비밀번호
                <input
                  name="currentPassword"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                  }
                  autoComplete="current-password"
                  placeholder="현재 비밀번호"
                />
              </label>
              <label>
                새 비밀번호
                <input
                  name="nextPassword"
                  type="password"
                  value={passwordForm.nextPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, nextPassword: event.target.value }))
                  }
                  autoComplete="new-password"
                  placeholder="10자 이상, 문자/숫자/기호 중 2종류 이상"
                />
              </label>
              <label>
                새 비밀번호 확인
                <input
                  name="confirmPassword"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  autoComplete="new-password"
                  placeholder="새 비밀번호를 다시 입력"
                />
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={handleChangePassword}
                disabled={accountBusy}
              >
                {accountBusy ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
          </div>
        )
      }

      return (
        <div className="settings-section-stack danger-group">
          <p className="caption">
            계정을 삭제하면 학습 세션, 메모, 설정, 로그인 정보가 모두 영구 삭제되며 복구할 수 없습니다.
          </p>
          <div className="auth-form embedded-form">
            <label>
              비밀번호 확인
              <input
                name="deletePassword"
                type="password"
                value={accountDeleteForm.password}
                onChange={(event) =>
                  setAccountDeleteForm((current) => ({ ...current, password: event.target.value }))
                }
                autoComplete="current-password"
                placeholder="계정 비밀번호"
              />
            </label>
            <label>
              삭제 확인 문구
              <input
                name="deleteConfirmText"
                type="text"
                value={accountDeleteForm.confirmText}
                onChange={(event) =>
                  setAccountDeleteForm((current) => ({ ...current, confirmText: event.target.value }))
                }
                placeholder={ACCOUNT_DELETE_CONFIRM_TEXT}
              />
            </label>
            <button
              type="button"
              className="danger-button"
              onClick={handleDeleteAccount}
              disabled={accountBusy}
            >
              {accountBusy ? '삭제 중...' : '계정 삭제'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="page-shell settings-shell">
        <div className="page-header">
          <div>
            <h2>설정</h2>
            <p>마이페이지 관리는 계정 정보로, 서비스 설정은 측정과 화면 동작으로 나눠서 관리합니다.</p>
          </div>
        </div>

        <div className="settings-layout">
          <section className="settings-card settings-nav-card" aria-label="설정 상세 목록">
            <div className="settings-nav-list">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`settings-nav-button${activeSettingsSection === section.id ? ' active' : ''}`}
                  onClick={() => setActiveSettingsSection(section.id)}
                >
                  <span className="settings-nav-label">{section.label}</span>
                  <span className="settings-nav-summary">{section.summary}</span>
                  <span className="settings-nav-copy">{section.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-card settings-detail-card">
            <div className="settings-detail-header">
              <div>
                <h3>{activeSection.label}</h3>
                <p>{activeSection.description}</p>
              </div>
              <span className="badge subtle">{activeSection.summary}</span>
            </div>
            {renderSettingsSectionContent()}
          </section>
        </div>
      </div>
    )
  }

  if (!authReady) {
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="panel-badge">서비스 준비 중</div>
          <h2>로그인 상태 확인 중</h2>
          <p className="panel-copy">웹 로그인 세션과 서버 상태를 확인하고 있습니다.</p>
        </section>
      </div>
    )
  }

  if (screen === 'login') {
    return renderLoginScreen()
  }

  if (screen === 'camera') {
    return renderCameraScreen()
  }

  const appShellClassName = [
    'app-shell',
    Capacitor.isNativePlatform() ? 'native-runtime' : '',
    settings.reduceMotion ? 'reduce-motion' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={appShellClassName}>
      {(appError || (appFeedback && screen !== 'support')) && (
        <div className="app-toast-region" aria-live="polite">
          {appError && <div className="app-toast app-toast-warn">{appError}</div>}
          {appFeedback && screen !== 'support' && (
            <div className={`app-toast app-toast-${appFeedback.tone}`}>{appFeedback.text}</div>
          )}
        </div>
      )}
      {renderTopNav()}
      <div className={`app-body${screen === 'learning' ? ' no-sidebar' : ''}`}>
        {screen !== 'learning' && renderSidebar()}
        {screen !== 'learning' && (
          <button
            type="button"
            className={`sidebar-backdrop${mobileSidebarOpen ? ' is-open' : ''}`}
            aria-label="메뉴 닫기"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <main className={`app-main${screen === 'learning' ? ' learning-main' : ''}`}>
          {screen === 'dashboard' && renderDashboard()}
          {screen === 'session-setup' && renderSessionSetup()}
          {screen === 'learning' && renderLearning()}
          {screen === 'result' && renderResult()}
          {screen === 'announcements' && renderAnnouncementsPage()}
          {screen === 'support' && renderSupportPage()}
          {screen === 'report' && renderReport()}
          {screen === 'feedback' && renderFeedback()}
          {screen === 'admin' && renderAdmin()}
          {screen === 'settings' && renderSettingsDetailed()}
        </main>
      </div>

      {needsConsentRefresh && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-refresh-title">
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault()
              void handleAcceptUpdatedConsent()
            }}
          >
            <h3 id="consent-refresh-title">서비스 동의 갱신</h3>
            <p>
              FocusAI의 개인정보 처리 및 카메라 측정 안내 버전이 변경되었습니다. 최신 버전에 동의해야 서비스를 계속 사용할 수 있습니다.
            </p>
            <label className="consent-row">
              <input
                name="privacyPolicyRefreshAccepted"
                type="checkbox"
                checked={consentRefresh.privacyPolicyAccepted}
                onChange={(event) =>
                  setConsentRefresh((current) => ({
                    ...current,
                    privacyPolicyAccepted: event.target.checked,
                  }))
                }
              />
              <span>
                개인정보 처리방침 동의
                <small>학습 세션, 설정, 문의 처리에 필요한 계정 및 학습 기록 저장에 동의합니다.</small>
              </span>
            </label>
            <label className="consent-row">
              <input
                name="cameraPolicyRefreshAccepted"
                type="checkbox"
                checked={consentRefresh.cameraPolicyAccepted}
                onChange={(event) =>
                  setConsentRefresh((current) => ({
                    ...current,
                    cameraPolicyAccepted: event.target.checked,
                  }))
                }
              />
              <span>
                카메라 측정 안내 동의
                <small>집중도 측정을 위한 카메라 신호는 브라우저 안에서 분석되며 원본 영상은 서버에 저장하지 않습니다.</small>
              </span>
            </label>
            <button
              type="submit"
              className="primary-button large"
              disabled={
                accountBusy ||
                !consentRefresh.privacyPolicyAccepted ||
                !consentRefresh.cameraPolicyAccepted
              }
            >
              {accountBusy ? '저장 중' : '동의하고 계속'}
            </button>
          </form>
        </div>
      )}

      {showEndModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>세션을 종료할까요?</h3>
            <p>현재까지의 학습 데이터가 저장됩니다. 종료 후 결과 화면으로 이동합니다.</p>
            <div className="action-row end">
              <button type="button" className="secondary-button" onClick={() => setShowEndModal(false)}>
                계속 학습
              </button>
              <button type="button" className="danger-button" onClick={() => endSession('manual')}>
                종료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
