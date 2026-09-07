export type Severity = 'good' | 'warn' | 'info'

export type UserProfile = {
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

export type AppSettings = {
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

export type SessionEvent = {
  id: string
  severity: Severity
  message: string
  timestamp: number
}

export type LiveSession = {
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

export type SessionNotes = {
  studied: string
  distraction: string
  nextGoal: string
}

export type StoredSession = {
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

export type ApiHealth = {
  apiReachable: boolean
  mariaEnabled: boolean
  mariaReachable: boolean
  anthropicEnabled?: boolean
}

export type AnnouncementTone = 'info' | 'good' | 'warn' | 'danger'

export type Announcement = {
  id: string
  title: string
  body: string
  tone: AnnouncementTone
  isActive: boolean
  isPinned: boolean
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
}

export type SupportTicketCategory = 'inquiry' | 'bug' | 'report' | 'account' | 'other'

export type SupportTicketStatus = 'open' | 'reviewing' | 'resolved' | 'closed'

export type SupportTicket = {
  id: string
  userId: string
  userName: string
  userEmail: string
  category: SupportTicketCategory
  status: SupportTicketStatus
  subject: string
  body: string
  adminReply: string | null
  createdAt: string
  updatedAt: string
  answeredAt: string | null
}

export type ApiBootstrap = {
  profile: UserProfile | null
  settings: AppSettings | null
  sessions: StoredSession[]
  authToken?: string
  status: {
    mariaEnabled: boolean
    authenticated: boolean
  } | null
}

export type FeedbackPattern = {
  label: string
  tag: string
  tone: 'low' | 'mid' | 'high'
}

export type AiFeedback = {
  strongestSubject: string
  weakestSubject: string
  bestBucket: string
  weakestBucket: string
  suggestedGoal: number
  summary: string
  strength: string
  caution: string
  strategy: string
  patterns: FeedbackPattern[]
}

export type AiFeedbackResult = {
  insights: AiFeedback
  source: 'anthropic' | 'local'
  model: string | null
}

export type AdminUserSummary = {
  id: string
  name: string
  email: string
  isAdmin: boolean
  createdAt: string
  lastSessionAt: string | null
}

export type AdminSessionSummary = {
  sessionId: string
  userName: string
  userEmail: string
  subject: string
  avgScore: number
  createdAt: string
}

export type AdminUserRecord = AdminUserSummary & {
  sessionCount: number
  averageFocusScore: number
  totalStudySeconds: number
  subjects: string[]
}

export type AdminSessionRecord = AdminSessionSummary & {
  userId: string
  mode: string
  finalScore: number
  goalMinutes: number
  elapsedSeconds: number
  focusedSeconds: number
  tabSwitches: number
  idleEvents: number
  absenceEvents: number
}

export type AdminSubjectSummary = {
  subject: string
  sessionCount: number
  averageFocusScore: number
}

export type AdminDailyStat = {
  date: string
  newUsers: number
  sessions: number
  averageFocusScore: number
}

export type AdminRateLimitSnapshot = {
  totalActiveBuckets: number
  buckets: Array<{
    bucket: string
    activeKeys: number
  }>
}

export type DiscordBotSettings = {
  enabled: boolean
  tokenConfigured: boolean
  tokenStorageReady: boolean
  tokenPreview: string | null
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
  updatedAt: string | null
}

export type DiscordBotStatus = {
  state: 'disabled' | 'starting' | 'running' | 'stopping' | 'error'
  botUserTag: string | null
  lastStartedAt: string | null
  lastStoppedAt: string | null
  lastError: string | null
}

export type DiscordBotSettingsUpdate = {
  botToken?: string
  clearToken?: boolean
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

export type AdminSystemStatus = {
  nodeEnv: string
  mariaEnabled: boolean
  mariaReachable: boolean
  anthropicEnabled: boolean
  autoMigrateSchema: boolean
  activeAuthSessions: number
  authSessionsExpiringSoon: number
  usersWithoutSessions: number
  lastUserCreatedAt: string | null
  lastSessionCreatedAt: string | null
  rateLimits: AdminRateLimitSnapshot
}

export type AdminAuditLog = {
  id: string
  actorUserId: string
  actorName: string
  actorEmail: string
  actionType: string
  targetType: string
  targetId: string | null
  summary: string
  details: string | null
  createdAt: string
}

export type AdminOverview = {
  totals: {
    totalUsers: number
    totalSessions: number
    sessionsToday: number
    averageFocusScore: number
    adminUsers: number
    activeUsers7d: number
    sessions7d: number
    averageFocusScore7d: number
  }
  recentUsers: AdminUserSummary[]
  recentSessions: AdminSessionSummary[]
  users: AdminUserRecord[]
  sessions: AdminSessionRecord[]
  topSubjects: AdminSubjectSummary[]
  dailyStats: AdminDailyStat[]
  announcements: Announcement[]
  supportTickets: SupportTicket[]
  auditLogs: AdminAuditLog[]
}
