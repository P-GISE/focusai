import { z } from 'zod'
import { PASSWORD_POLICY_MESSAGE, validatePasswordStrength } from './password-policy.js'

export type Severity = 'good' | 'warn' | 'info'

const authSourceSchema = z.literal('mariadb')
const consentVersionSchema = z.string().min(1).max(40)
const announcementToneSchema = z.enum(['info', 'good', 'warn', 'danger'])
const supportTicketCategorySchema = z.enum(['inquiry', 'bug', 'report', 'account', 'other'])
const supportTicketStatusSchema = z.enum(['open', 'reviewing', 'resolved', 'closed'])
const supportTicketSubjectSchema = z.string().trim().min(1).max(80)
const supportTicketBodySchema = z.string().trim().min(1).max(800)
const discordBotStatusStateSchema = z.enum(['disabled', 'starting', 'running', 'stopping', 'error'])
const strongPasswordSchema = z
  .string()
  .min(10, PASSWORD_POLICY_MESSAGE)
  .max(72, PASSWORD_POLICY_MESSAGE)
  .refine((password) => validatePasswordStrength(password).valid, PASSWORD_POLICY_MESSAGE)

export const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  dailyGoalHours: z.number().int().min(1).max(8),
  subjects: z.array(z.string().min(1).max(120)).max(20),
  authSource: authSourceSchema,
  isAdmin: z.boolean(),
  consentVersion: consentVersionSchema,
  privacyConsentAt: z.string().nullable(),
  cameraConsentAt: z.string().nullable(),
})

export const settingsSchema = z.object({
  dailyGoalHours: z.number().int().min(1).max(8),
  idleThresholdSeconds: z.number().int().min(10).max(120),
  focusAlert: z.boolean(),
  breakReminder: z.boolean(),
  saveRawVideo: z.boolean(),
  defaultSessionMinutes: z.number().int().min(15).max(180),
  defaultSessionMode: z.string().min(1).max(120),
  autoResumeSession: z.boolean(),
  soundAlerts: z.boolean(),
  showLiveScore: z.boolean(),
  showEventLog: z.boolean(),
  reduceMotion: z.boolean(),
  keepScreenAwake: z.boolean(),
})

export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: strongPasswordSchema,
  dailyGoalHours: z.number().int().min(1).max(8),
  subjects: z.array(z.string().min(1).max(120)).max(20),
  privacyPolicyAccepted: z.literal(true),
  cameraPolicyAccepted: z.literal(true),
})

export const consentRefreshSchema = z.object({
  privacyPolicyAccepted: z.literal(true),
  cameraPolicyAccepted: z.literal(true),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(256),
  nextPassword: strongPasswordSchema,
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  nextPassword: strongPasswordSchema,
})

export const accountDeleteSchema = z.object({
  password: z.string().min(1).max(72),
})

export const sessionNotesSchema = z.object({
  studied: z.string(),
  distraction: z.string(),
  nextGoal: z.string(),
})

export const sessionEventSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(['good', 'warn', 'info']),
  message: z.string().min(1).max(255),
  timestamp: z.number().int(),
})

export const storedSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  subject: z.string().min(1).max(120),
  mode: z.string().min(1).max(120),
  goalMinutes: z.number().int().min(1).max(720),
  elapsedSeconds: z.number().int().min(0),
  focusedSeconds: z.number().int().min(0),
  avgScore: z.number().int().min(0).max(100),
  finalScore: z.number().int().min(0).max(100),
  timeline: z.array(z.number().int().min(0).max(100)),
  tabSwitches: z.number().int().min(0),
  idleEvents: z.number().int().min(0),
  absenceEvents: z.number().int().min(0),
  hiddenSeconds: z.number().int().min(0),
  highestScore: z.number().int().min(0).max(100),
  lowestScore: z.number().int().min(0).max(100),
  notes: sessionNotesSchema,
})

export const sessionSaveSchema = z.object({
  profile: profileSchema,
  settings: settingsSchema,
  session: storedSessionSchema,
  events: z.array(sessionEventSchema).max(2000).default([]),
})

export const notesUpdateSchema = sessionNotesSchema

export const feedbackPatternSchema = z.object({
  label: z.string().min(1).max(160),
  tag: z.string().min(1).max(40),
  tone: z.enum(['low', 'mid', 'high']),
})

export const aiFeedbackSchema = z.object({
  strongestSubject: z.string().min(1).max(120),
  weakestSubject: z.string().min(1).max(120),
  bestBucket: z.string().min(1).max(60),
  weakestBucket: z.string().min(1).max(60),
  suggestedGoal: z.number().int().min(1).max(8),
  summary: z.string().min(1),
  strength: z.string().min(1),
  caution: z.string().min(1),
  strategy: z.string().min(1),
  patterns: z.array(feedbackPatternSchema).min(1).max(6),
})

export const aiFeedbackResultSchema = z.object({
  insights: aiFeedbackSchema,
  source: z.enum(['anthropic', 'local']),
  model: z.string().nullable(),
})

export const adminUserSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  isAdmin: z.boolean(),
  createdAt: z.string().min(1),
  lastSessionAt: z.string().nullable(),
})

export const adminSessionSummarySchema = z.object({
  sessionId: z.string().min(1),
  userName: z.string().min(1).max(120),
  userEmail: z.string().email(),
  subject: z.string().min(1).max(120),
  avgScore: z.number().int().min(0).max(100),
  createdAt: z.string().min(1),
})

export const adminUserRecordSchema = adminUserSummarySchema.extend({
  sessionCount: z.number().int().min(0),
  averageFocusScore: z.number().int().min(0).max(100),
  totalStudySeconds: z.number().int().min(0),
  subjects: z.array(z.string().min(1).max(120)).max(20),
})

export const adminSessionRecordSchema = adminSessionSummarySchema.extend({
  userId: z.string().min(1),
  mode: z.string().min(1).max(120),
  finalScore: z.number().int().min(0).max(100),
  goalMinutes: z.number().int().min(1).max(720),
  elapsedSeconds: z.number().int().min(0),
  focusedSeconds: z.number().int().min(0),
  tabSwitches: z.number().int().min(0),
  idleEvents: z.number().int().min(0),
  absenceEvents: z.number().int().min(0),
})

export const adminSubjectSummarySchema = z.object({
  subject: z.string().min(1).max(120),
  sessionCount: z.number().int().min(0),
  averageFocusScore: z.number().int().min(0).max(100),
})

export const adminDailyStatSchema = z.object({
  date: z.string().min(1),
  newUsers: z.number().int().min(0),
  sessions: z.number().int().min(0),
  averageFocusScore: z.number().int().min(0).max(100),
})

export const adminRateLimitSnapshotSchema = z.object({
  totalActiveBuckets: z.number().int().min(0),
  buckets: z.array(
    z.object({
      bucket: z.string().min(1),
      activeKeys: z.number().int().min(0),
    }),
  ),
})

export const adminSystemStatusSchema = z.object({
  nodeEnv: z.string().min(1),
  mariaEnabled: z.boolean(),
  mariaReachable: z.boolean(),
  anthropicEnabled: z.boolean(),
  autoMigrateSchema: z.boolean(),
  activeAuthSessions: z.number().int().min(0),
  authSessionsExpiringSoon: z.number().int().min(0),
  usersWithoutSessions: z.number().int().min(0),
  lastUserCreatedAt: z.string().nullable(),
  lastSessionCreatedAt: z.string().nullable(),
  rateLimits: adminRateLimitSnapshotSchema,
})

export const adminRoleUpdateSchema = z.object({
  isAdmin: z.boolean(),
})

export const discordBotSettingsUpdateSchema = z.object({
  botToken: z.string().max(512).optional(),
  clearToken: z.boolean().optional().default(false),
  clientId: z.string().trim().max(120),
  guildIds: z.array(z.string().trim().min(1).max(120)).max(20),
  adminChannelId: z.string().trim().max(120).nullable(),
  adminRoleIds: z.array(z.string().trim().min(1).max(120)).max(20),
  botActorUserId: z.string().trim().max(120).nullable(),
  registerCommands: z.boolean(),
  adminUrl: z.string().trim().url().max(255).nullable(),
  supportPollMs: z.number().int().min(5_000).max(3_600_000),
  healthPollMs: z.number().int().min(5_000).max(3_600_000),
  dailySummaryHour: z.number().int().min(0).max(23),
})

export const discordBotSettingsSchema = z.object({
  enabled: z.boolean(),
  tokenConfigured: z.boolean(),
  tokenStorageReady: z.boolean(),
  tokenPreview: z.string().nullable(),
  clientId: z.string(),
  guildIds: z.array(z.string()),
  adminChannelId: z.string().nullable(),
  adminRoleIds: z.array(z.string()),
  botActorUserId: z.string().nullable(),
  registerCommands: z.boolean(),
  adminUrl: z.string().nullable(),
  supportPollMs: z.number().int(),
  healthPollMs: z.number().int(),
  dailySummaryHour: z.number().int(),
  updatedAt: z.string().nullable(),
})

export const discordBotStatusSchema = z.object({
  state: discordBotStatusStateSchema,
  botUserTag: z.string().nullable(),
  lastStartedAt: z.string().nullable(),
  lastStoppedAt: z.string().nullable(),
  lastError: z.string().nullable(),
})

export const announcementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(2000),
  tone: announcementToneSchema,
  isActive: z.boolean(),
  isPinned: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const announcementUpsertSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(2000),
  tone: announcementToneSchema,
  isActive: z.boolean(),
  isPinned: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
})

export const supportTicketCreateSchema = z.object({
  category: supportTicketCategorySchema,
  subject: supportTicketSubjectSchema,
  body: supportTicketBodySchema,
})

export const supportTicketAdminUpdateSchema = z.object({
  status: supportTicketStatusSchema,
  adminReply: z.string().max(4000),
})

export const supportTicketSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1).max(120),
  userEmail: z.string().email(),
  category: supportTicketCategorySchema,
  status: supportTicketStatusSchema,
  subject: z.string().min(1).max(160),
  body: z.string().min(1).max(4000),
  adminReply: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  answeredAt: z.string().nullable(),
})

export const adminAuditLogSchema = z.object({
  id: z.string().min(1),
  actorUserId: z.string().min(1),
  actorName: z.string().min(1).max(120),
  actorEmail: z.string().email(),
  actionType: z.string().min(1).max(80),
  targetType: z.string().min(1).max(80),
  targetId: z.string().nullable(),
  summary: z.string().min(1).max(255),
  details: z.string().nullable(),
  createdAt: z.string().min(1),
})

export const adminOverviewSchema = z.object({
  totals: z.object({
    totalUsers: z.number().int().min(0),
    totalSessions: z.number().int().min(0),
    sessionsToday: z.number().int().min(0),
    averageFocusScore: z.number().int().min(0).max(100),
    adminUsers: z.number().int().min(0),
    activeUsers7d: z.number().int().min(0),
    sessions7d: z.number().int().min(0),
    averageFocusScore7d: z.number().int().min(0).max(100),
  }),
  recentUsers: z.array(adminUserSummarySchema).max(12),
  recentSessions: z.array(adminSessionSummarySchema).max(12),
  users: z.array(adminUserRecordSchema).max(200),
  sessions: z.array(adminSessionRecordSchema).max(200),
  topSubjects: z.array(adminSubjectSummarySchema).max(12),
  dailyStats: z.array(adminDailyStatSchema).max(14),
  announcements: z.array(announcementSchema).max(20),
  supportTickets: z.array(supportTicketSchema).max(120),
  auditLogs: z.array(adminAuditLogSchema).max(40),
})

export type UserProfilePayload = z.infer<typeof profileSchema>
export type AppSettingsPayload = z.infer<typeof settingsSchema>
export type RegisterPayload = z.infer<typeof registerSchema>
export type ConsentRefreshPayload = z.infer<typeof consentRefreshSchema>
export type LoginPayload = z.infer<typeof loginSchema>
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordSchema>
export type PasswordResetConfirmPayload = z.infer<typeof passwordResetConfirmSchema>
export type PasswordChangePayload = z.infer<typeof passwordChangeSchema>
export type AccountDeletePayload = z.infer<typeof accountDeleteSchema>
export type SessionNotesPayload = z.infer<typeof sessionNotesSchema>
export type SessionEventPayload = z.infer<typeof sessionEventSchema>
export type StoredSessionPayload = z.infer<typeof storedSessionSchema>
export type SessionSavePayload = z.infer<typeof sessionSaveSchema>
export type FeedbackPatternPayload = z.infer<typeof feedbackPatternSchema>
export type AiFeedbackPayload = z.infer<typeof aiFeedbackSchema>
export type AiFeedbackResultPayload = z.infer<typeof aiFeedbackResultSchema>
export type AdminUserSummaryPayload = z.infer<typeof adminUserSummarySchema>
export type AdminSessionSummaryPayload = z.infer<typeof adminSessionSummarySchema>
export type AdminUserRecordPayload = z.infer<typeof adminUserRecordSchema>
export type AdminSessionRecordPayload = z.infer<typeof adminSessionRecordSchema>
export type AdminSubjectSummaryPayload = z.infer<typeof adminSubjectSummarySchema>
export type AdminDailyStatPayload = z.infer<typeof adminDailyStatSchema>
export type AdminRateLimitSnapshotPayload = z.infer<typeof adminRateLimitSnapshotSchema>
export type AdminSystemStatusPayload = z.infer<typeof adminSystemStatusSchema>
export type AdminRoleUpdatePayload = z.infer<typeof adminRoleUpdateSchema>
export type DiscordBotSettingsUpdatePayload = z.infer<typeof discordBotSettingsUpdateSchema>
export type DiscordBotSettingsPayload = z.infer<typeof discordBotSettingsSchema>
export type DiscordBotStatusPayload = z.infer<typeof discordBotStatusSchema>
export type AnnouncementPayload = z.infer<typeof announcementSchema>
export type AnnouncementUpsertPayload = z.infer<typeof announcementUpsertSchema>
export type SupportTicketCreatePayload = z.infer<typeof supportTicketCreateSchema>
export type SupportTicketAdminUpdatePayload = z.infer<typeof supportTicketAdminUpdateSchema>
export type SupportTicketPayload = z.infer<typeof supportTicketSchema>
export type AdminAuditLogPayload = z.infer<typeof adminAuditLogSchema>
export type AdminOverviewPayload = z.infer<typeof adminOverviewSchema>

export type BootstrapPayload = {
  profile: UserProfilePayload | null
  settings: AppSettingsPayload | null
  sessions: StoredSessionPayload[]
  authToken?: string
}
