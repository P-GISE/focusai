import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { PoolConnection } from 'mariadb'
import { adminEmailAllowlist, env } from './env.js'
import { withConnection } from './mariadb.js'
import { resolveSessionCreatedAt } from './session-time.js'
import type {
  AdminAuditLogPayload,
  AdminDailyStatPayload,
  AdminOverviewPayload,
  AdminSessionRecordPayload,
  AdminSessionSummaryPayload,
  AdminSubjectSummaryPayload,
  AdminSystemStatusPayload,
  AdminUserRecordPayload,
  AdminUserSummaryPayload,
  AnnouncementPayload,
  AnnouncementUpsertPayload,
  AppSettingsPayload,
  BootstrapPayload,
  DiscordBotSettingsPayload,
  DiscordBotSettingsUpdatePayload,
  DiscordBotStatusPayload,
  ForgotPasswordPayload,
  RegisterPayload,
  SupportTicketAdminUpdatePayload,
  SupportTicketCreatePayload,
  SupportTicketPayload,
  SessionNotesPayload,
  SessionSavePayload,
  StoredSessionPayload,
  UserProfilePayload,
} from './contracts.js'

type DbRow = Record<string, unknown>

type InsertResult = {
  insertId: number
}

export type DiscordBotSettingsRecord = {
  settings: DiscordBotSettingsPayload
  status: DiscordBotStatusPayload
  tokenCiphertext: string | null
}

export type AuthenticatedUser = {
  userId: number
  email: string
  name: string
  isAdmin: boolean
  source: 'mariadb'
}

const PASSWORD_KEY_LENGTH = 64
const SESSION_TOKEN_BYTES = 32
const PASSWORD_RESET_TOKEN_BYTES = 32
const CONSENT_VERSION = '2026-05-web-v1'
const DEFAULT_SESSION_MODE = '능동 학습'

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeSubjectList(subjects: string[]) {
  return subjects
    .map((subject) => subject.trim())
    .filter(Boolean)
    .filter((subject, index, array) => array.indexOf(subject) === index)
}

function parseDateValue(value: unknown) {
  const parsed = new Date(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : Date.now(),
  )

  if (Number.isNaN(parsed.valueOf())) {
    return new Date()
  }

  return parsed
}

function mapSession(row: DbRow, timeline?: number[]): StoredSessionPayload {
  const resolvedTimeline = timeline ?? safeJsonParse<number[]>(row.timeline_json, [])

  return {
    id: String(row.session_id),
    createdAt: parseDateValue(row.created_at).toISOString(),
    subject: String(row.subject_name),
    mode: String(row.mode_name),
    goalMinutes: Number(row.goal_minutes),
    elapsedSeconds: Number(row.elapsed_seconds),
    focusedSeconds: Number(row.focused_seconds),
    avgScore: Number(row.avg_score),
    finalScore: Number(row.final_score),
    timeline: resolvedTimeline,
    tabSwitches: Number(row.tab_switches),
    idleEvents: Number(row.idle_events),
    absenceEvents: Number(row.absence_events),
    hiddenSeconds: Number(row.hidden_seconds),
    highestScore: Number(row.highest_score),
    lowestScore: Number(row.lowest_score),
    notes: {
      studied: String(row.studied_note ?? ''),
      distraction: String(row.distraction_note ?? ''),
      nextGoal: String(row.next_goal_note ?? ''),
    },
  }
}

function defaultSettings(dailyGoalHours: number): AppSettingsPayload {
  return {
    dailyGoalHours,
    idleThresholdSeconds: 25,
    focusAlert: true,
    breakReminder: true,
    saveRawVideo: false,
    defaultSessionMinutes: 90,
    defaultSessionMode: DEFAULT_SESSION_MODE,
    autoResumeSession: true,
    soundAlerts: true,
    showLiveScore: true,
    showEventLog: true,
    reduceMotion: false,
    keepScreenAwake: false,
  }
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHex] = storedHash.split(':')

  if (!salt || !expectedHex) {
    return false
  }

  const expected = Buffer.from(expectedHex, 'hex')
  const actual = scryptSync(password, salt, expected.length).subarray(0, expected.length)

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(`focusai-reset:${token}`).digest('hex')
}

function buildSessionExpiryDate() {
  return new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

function buildPasswordResetExpiryDate() {
  return new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000)
}

function sanitizeUserAgent(userAgent: string) {
  return userAgent.trim().slice(0, 255)
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isAdminEmail(email: string) {
  return adminEmailAllowlist.has(normalizeEmail(email))
}

function resolveAdminFlag(rawValue: unknown, email: string) {
  return Number(rawValue ?? 0) === 1 || isAdminEmail(email)
}

function mapAuthUser(row: DbRow): AuthenticatedUser {
  const email = String(row.email)
  return {
    userId: Number(row.id),
    email,
    name: String(row.display_name),
    isAdmin: resolveAdminFlag(row.is_admin, email),
    source: 'mariadb',
  }
}

function mapAnnouncement(row: DbRow): AnnouncementPayload {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    tone: String(row.tone) as AnnouncementPayload['tone'],
    isActive: Number(row.is_active ?? 0) === 1,
    isPinned: Number(row.is_pinned ?? 0) === 1,
    startsAt: toIsoOrNull(row.starts_at),
    endsAt: toIsoOrNull(row.ends_at),
    createdAt: parseDateValue(row.created_at).toISOString(),
    updatedAt: parseDateValue(row.updated_at).toISOString(),
  }
}

function mapSupportTicket(row: DbRow): SupportTicketPayload {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: String(row.display_name),
    userEmail: String(row.email),
    category: String(row.category) as SupportTicketPayload['category'],
    status: String(row.status) as SupportTicketPayload['status'],
    subject: String(row.subject),
    body: String(row.body),
    adminReply: row.admin_reply ? String(row.admin_reply) : null,
    createdAt: parseDateValue(row.created_at).toISOString(),
    updatedAt: parseDateValue(row.updated_at).toISOString(),
    answeredAt: toIsoOrNull(row.answered_at),
  }
}

function mapAdminAuditLog(row: DbRow): AdminAuditLogPayload {
  return {
    id: String(row.id),
    actorUserId: String(row.actor_user_id),
    actorName: String(row.actor_name),
    actorEmail: String(row.actor_email),
    actionType: String(row.action_type),
    targetType: String(row.target_type),
    targetId: row.target_id ? String(row.target_id) : null,
    summary: String(row.summary),
    details: row.details ? String(row.details) : null,
    createdAt: parseDateValue(row.created_at).toISOString(),
  }
}

function parseJsonStringArray(value: unknown) {
  const parsed = safeJsonParse<unknown>(value, [])

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function defaultDiscordBotSettingsRecord(): DiscordBotSettingsRecord {
  return {
    settings: {
      enabled: false,
      tokenConfigured: false,
      tokenStorageReady: false,
      tokenPreview: null,
      clientId: '',
      guildIds: [],
      adminChannelId: null,
      adminRoleIds: [],
      botActorUserId: null,
      registerCommands: true,
      adminUrl: null,
      supportPollMs: 30_000,
      healthPollMs: 60_000,
      dailySummaryHour: 9,
      updatedAt: null,
    },
    status: {
      state: 'disabled',
      botUserTag: null,
      lastStartedAt: null,
      lastStoppedAt: null,
      lastError: null,
    },
    tokenCiphertext: null,
  }
}

function mapDiscordBotSettings(row: DbRow | undefined): DiscordBotSettingsRecord {
  if (!row) {
    return defaultDiscordBotSettingsRecord()
  }

  const tokenCiphertext = row.token_ciphertext ? String(row.token_ciphertext) : null

  return {
    settings: {
      enabled: Number(row.enabled ?? 0) === 1,
      tokenConfigured: Boolean(tokenCiphertext),
      tokenStorageReady: false,
      tokenPreview: row.token_preview ? String(row.token_preview) : null,
      clientId: String(row.client_id ?? ''),
      guildIds: parseJsonStringArray(row.guild_ids),
      adminChannelId: row.admin_channel_id ? String(row.admin_channel_id) : null,
      adminRoleIds: parseJsonStringArray(row.admin_role_ids),
      botActorUserId: row.bot_actor_user_id ? String(row.bot_actor_user_id) : null,
      registerCommands: Number(row.register_commands ?? 1) === 1,
      adminUrl: row.admin_url ? String(row.admin_url) : null,
      supportPollMs: Number(row.support_poll_ms ?? 30_000),
      healthPollMs: Number(row.health_poll_ms ?? 60_000),
      dailySummaryHour: Number(row.daily_summary_hour ?? 9),
      updatedAt: toIsoOrNull(row.updated_at),
    },
    status: {
      state: String(row.status_state ?? 'disabled') as DiscordBotStatusPayload['state'],
      botUserTag: row.bot_user_tag ? String(row.bot_user_tag) : null,
      lastStartedAt: toIsoOrNull(row.last_started_at),
      lastStoppedAt: toIsoOrNull(row.last_stopped_at),
      lastError: row.last_error ? String(row.last_error) : null,
    },
    tokenCiphertext,
  }
}

async function cleanupExpiredSessions(connection: PoolConnection) {
  await connection.query('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP')
}

async function cleanupPasswordResetTokens(connection: PoolConnection) {
  await connection.query(
    `
      DELETE FROM password_reset_tokens
      WHERE expires_at <= CURRENT_TIMESTAMP OR used_at IS NOT NULL
    `,
  )
}

async function destroyAuthSessionsForUser(connection: PoolConnection, userId: number) {
  await connection.query('DELETE FROM auth_sessions WHERE user_id = ?', [userId])
}

async function loadActorIdentity(connection: PoolConnection, userId: number) {
  const rows = await connection.query<DbRow[]>(
    `
      SELECT id, display_name, email
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  )

  const actor = rows[0]

  if (!actor) {
    throw new Error('ADMIN_ACTOR_NOT_FOUND')
  }

  return {
    userId: Number(actor.id),
    name: String(actor.display_name),
    email: String(actor.email),
  }
}

async function insertAdminAuditLog(
  connection: PoolConnection,
  payload: {
    actorUserId: number
    actionType: string
    targetType: string
    targetId?: string | number | null
    summary: string
    details?: string | null
  },
) {
  const actor = await loadActorIdentity(connection, payload.actorUserId)

  await connection.query(
    `
      INSERT INTO admin_audit_logs (
        actor_user_id, actor_name, actor_email, action_type, target_type, target_id, summary, details
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      actor.userId,
      actor.name,
      actor.email,
      payload.actionType,
      payload.targetType,
      payload.targetId == null ? null : String(payload.targetId),
      payload.summary,
      payload.details ?? null,
    ],
  )
}

async function ensureSubjectRecord(connection: PoolConnection, subjectName: string) {
  await connection.query(
    `
      INSERT INTO subjects (display_name)
      VALUES (?)
      ON DUPLICATE KEY UPDATE
        updated_at = CURRENT_TIMESTAMP
    `,
    [subjectName],
  )

  const rows = await connection.query<DbRow[]>(
    `
      SELECT id
      FROM subjects
      WHERE display_name = ?
      LIMIT 1
    `,
    [subjectName],
  )

  return Number(rows[0]?.id)
}

async function syncUserSubjects(connection: PoolConnection, userId: number, subjects: string[]) {
  const normalizedSubjects = normalizeSubjectList(subjects)

  await connection.query('DELETE FROM user_subjects WHERE user_id = ?', [userId])

  for (const subject of normalizedSubjects) {
    const subjectId = await ensureSubjectRecord(connection, subject)
    await connection.query(
      `
        INSERT INTO user_subjects (user_id, subject_id)
        VALUES (?, ?)
      `,
      [userId, subjectId],
    )
  }
}

async function loadUserSubjects(connection: PoolConnection, userId: number) {
  const rows = await connection.query<DbRow[]>(
    `
      SELECT s.display_name
      FROM user_subjects us
      INNER JOIN subjects s ON s.id = us.subject_id
      WHERE us.user_id = ?
      ORDER BY us.created_at ASC, s.display_name ASC
    `,
    [userId],
  )

  return normalizeSubjectList(rows.map((row) => String(row.display_name)))
}

async function replaceSessionTimeline(connection: PoolConnection, sessionId: string, timeline: number[]) {
  await connection.query('DELETE FROM session_score_samples WHERE session_id = ?', [sessionId])

  for (const [sampleIndex, score] of timeline.entries()) {
    await connection.query(
      `
        INSERT INTO session_score_samples (session_id, sample_index, score)
        VALUES (?, ?, ?)
      `,
      [sessionId, sampleIndex, score],
    )
  }
}

async function loadSessionTimelines(connection: PoolConnection, sessionIds: string[]) {
  if (!sessionIds.length) {
    return new Map<string, number[]>()
  }

  const placeholders = sessionIds.map(() => '?').join(', ')
  const rows = await connection.query<DbRow[]>(
    `
      SELECT session_id, sample_index, score
      FROM session_score_samples
      WHERE session_id IN (${placeholders})
      ORDER BY session_id ASC, sample_index ASC
    `,
    sessionIds,
  )

  const timelineMap = new Map<string, number[]>()

  for (const row of rows) {
    const sessionId = String(row.session_id)
    const current = timelineMap.get(sessionId) ?? []
    current.push(Number(row.score))
    timelineMap.set(sessionId, current)
  }

  return timelineMap
}

async function upsertUserRecord(
  connection: PoolConnection,
  userId: number,
  emailFromAccount: string,
  profile: UserProfilePayload,
) {
  await connection.query(
    `
      UPDATE users
      SET
        email = ?,
        display_name = ?,
        daily_goal_hours = ?,
        auth_source = 'mariadb',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      normalizeEmail(emailFromAccount),
      profile.name,
      profile.dailyGoalHours,
      userId,
    ],
  )
}

async function loadPasswordHash(connection: PoolConnection, userId: number) {
  const rows = await connection.query<DbRow[]>(
    `
      SELECT password_hash
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  )

  return String(rows[0]?.password_hash ?? '')
}

async function elevateAdminFlagIfNeeded(connection: PoolConnection, userId: number, email: string) {
  if (!isAdminEmail(email)) {
    return
  }

  await connection.query(
    `
      UPDATE users
      SET is_admin = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_admin <> 1
    `,
    [userId],
  )
}

async function assertSessionOwnership(
  connection: PoolConnection,
  userId: number,
  sessionId: string,
) {
  const rows = await connection.query<DbRow[]>(
    `
      SELECT user_id
      FROM study_sessions
      WHERE session_id = ?
      LIMIT 1
    `,
    [sessionId],
  )

  if (rows[0] && Number(rows[0].user_id) !== userId) {
    throw new Error('SESSION_ACCESS_DENIED')
  }
}

async function upsertSettingsRecord(
  connection: PoolConnection,
  userId: number,
  settings: AppSettingsPayload,
) {
  await connection.query(
    `
      INSERT INTO user_settings (
        user_id, daily_goal_hours, idle_threshold_seconds, focus_alert, break_reminder, save_raw_video,
        default_session_minutes, default_session_mode, auto_resume_session, sound_alerts,
        show_live_score, show_event_log, reduce_motion, keep_screen_awake
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        daily_goal_hours = VALUES(daily_goal_hours),
        idle_threshold_seconds = VALUES(idle_threshold_seconds),
        focus_alert = VALUES(focus_alert),
        break_reminder = VALUES(break_reminder),
        save_raw_video = VALUES(save_raw_video),
        default_session_minutes = VALUES(default_session_minutes),
        default_session_mode = VALUES(default_session_mode),
        auto_resume_session = VALUES(auto_resume_session),
        sound_alerts = VALUES(sound_alerts),
        show_live_score = VALUES(show_live_score),
        show_event_log = VALUES(show_event_log),
        reduce_motion = VALUES(reduce_motion),
        keep_screen_awake = VALUES(keep_screen_awake),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      userId,
      settings.dailyGoalHours,
      settings.idleThresholdSeconds,
      settings.focusAlert ? 1 : 0,
      settings.breakReminder ? 1 : 0,
      settings.saveRawVideo ? 1 : 0,
      settings.defaultSessionMinutes,
      settings.defaultSessionMode,
      settings.autoResumeSession ? 1 : 0,
      settings.soundAlerts ? 1 : 0,
      settings.showLiveScore ? 1 : 0,
      settings.showEventLog ? 1 : 0,
      settings.reduceMotion ? 1 : 0,
      settings.keepScreenAwake ? 1 : 0,
    ],
  )
}

export async function registerAccount(payload: RegisterPayload): Promise<AuthenticatedUser> {
  return withConnection(async (connection) => {
    const normalizedEmail = normalizeEmail(payload.email)
    await connection.beginTransaction()

    try {
      const existingRows = await connection.query<DbRow[]>(
        `
          SELECT id
          FROM users
          WHERE email = ?
          LIMIT 1
        `,
        [normalizedEmail],
      )

      if (existingRows[0]) {
        throw new Error('EMAIL_ALREADY_EXISTS')
      }

      const insertResult = await connection.query(
        `
          INSERT INTO users (
            email, password_hash, display_name, daily_goal_hours, auth_source, is_admin,
            consent_version, privacy_consent_at, camera_consent_at
          )
          VALUES (?, ?, ?, ?, 'mariadb', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [
          normalizedEmail,
          hashPassword(payload.password),
          payload.name,
          payload.dailyGoalHours,
          isAdminEmail(normalizedEmail) ? 1 : 0,
          CONSENT_VERSION,
        ],
      ) as InsertResult

      const userId = Number(insertResult.insertId)

      await upsertSettingsRecord(connection, userId, defaultSettings(payload.dailyGoalHours))
      await syncUserSubjects(connection, userId, payload.subjects)

      await connection.commit()

      return {
        userId,
        email: normalizedEmail,
        name: payload.name,
        isAdmin: isAdminEmail(normalizedEmail),
        source: 'mariadb',
      }
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function authenticateAccount(email: string, password: string): Promise<AuthenticatedUser | null> {
  return withConnection(async (connection) => {
    const normalizedEmail = normalizeEmail(email)
    const rows = await connection.query<DbRow[]>(
      `
        SELECT id, email, display_name, password_hash, is_admin
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [normalizedEmail],
    )

    const candidate = rows[0]

    if (!candidate || !verifyPassword(password, String(candidate.password_hash ?? ''))) {
      return null
    }

    await elevateAdminFlagIfNeeded(connection, Number(candidate.id), String(candidate.email))
    return mapAuthUser(candidate)
  })
}

export async function createAuthSession(userId: number, userAgent: string) {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('hex')
  const tokenHash = hashSessionToken(token)
  const expiresAt = buildSessionExpiryDate()

  await withConnection(async (connection) => {
    await cleanupExpiredSessions(connection)
    await connection.query(
      `
        INSERT INTO auth_sessions (session_token_hash, user_id, expires_at, user_agent)
        VALUES (?, ?, ?, ?)
      `,
      [tokenHash, userId, expiresAt, sanitizeUserAgent(userAgent)],
    )
  })

  return token
}

export async function resolveAuthSession(token: string): Promise<AuthenticatedUser | null> {
  if (!token.trim()) {
    return null
  }

  return withConnection(async (connection) => {
    await cleanupExpiredSessions(connection)

    const rows = await connection.query<DbRow[]>(
      `
        SELECT u.id, u.email, u.display_name, u.is_admin
        FROM auth_sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.session_token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `,
      [hashSessionToken(token)],
    )

    const sessionUser = rows[0]

    if (!sessionUser) {
      return null
    }

    await elevateAdminFlagIfNeeded(connection, Number(sessionUser.id), String(sessionUser.email))
    await connection.query(
      `
        UPDATE auth_sessions
        SET last_seen_at = CURRENT_TIMESTAMP
        WHERE session_token_hash = ?
      `,
      [hashSessionToken(token)],
    )

    return mapAuthUser(sessionUser)
  })
}

export async function destroyAuthSession(token: string) {
  if (!token.trim()) {
    return
  }

  await withConnection(async (connection) => {
    await connection.query(
      `
        DELETE FROM auth_sessions
        WHERE session_token_hash = ?
      `,
      [hashSessionToken(token)],
    )
  })
}

export async function upsertProfileAndSettings(
  userId: number,
  emailFromAccount: string,
  profile: UserProfilePayload,
  settings: AppSettingsPayload,
) {
  await withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      await upsertUserRecord(connection, userId, emailFromAccount, profile)
      await upsertSettingsRecord(connection, userId, settings)
      await syncUserSubjects(connection, userId, profile.subjects)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function acceptCurrentConsent(userId: number) {
  await withConnection(async (connection) => {
    await connection.query(
      `
        UPDATE users
        SET
          consent_version = ?,
          privacy_consent_at = CURRENT_TIMESTAMP,
          camera_consent_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [CONSENT_VERSION, userId],
    )
  })
}

export async function getBootstrap(userId: number): Promise<BootstrapPayload> {
  return withConnection(async (connection) => {
    const profileRows = await connection.query<DbRow[]>(
      `
        SELECT
          u.id,
          u.email,
          u.display_name,
          u.daily_goal_hours,
          u.is_admin,
          u.consent_version,
          u.privacy_consent_at,
          u.camera_consent_at,
          s.daily_goal_hours AS settings_daily_goal_hours,
          s.idle_threshold_seconds,
          s.focus_alert,
          s.break_reminder,
          s.save_raw_video,
          s.default_session_minutes,
          s.default_session_mode,
          s.auto_resume_session,
          s.sound_alerts,
          s.show_live_score,
          s.show_event_log,
          s.reduce_motion,
          s.keep_screen_awake
        FROM users u
        LEFT JOIN user_settings s ON s.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
      `,
      [userId],
    )

    const sessionRows = await connection.query<DbRow[]>(
      `
        SELECT *
        FROM study_sessions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [userId],
    )

    const timelineMap = await loadSessionTimelines(
      connection,
      sessionRows.map((row) => String(row.session_id)),
    )

    const firstProfile = profileRows[0]

    if (!firstProfile) {
      return {
        profile: null,
        settings: null,
        sessions: [],
      }
    }

    const subjects = await loadUserSubjects(connection, userId)
    const resolvedDailyGoalHours = Number(
      firstProfile.settings_daily_goal_hours ?? firstProfile.daily_goal_hours ?? 4,
    )

    return {
      profile: {
        id: String(firstProfile.id),
        name: String(firstProfile.display_name),
        email: String(firstProfile.email),
        dailyGoalHours: resolvedDailyGoalHours,
        subjects,
        authSource: 'mariadb',
        isAdmin: resolveAdminFlag(firstProfile.is_admin, String(firstProfile.email)),
        consentVersion: String(firstProfile.consent_version ?? CONSENT_VERSION),
        privacyConsentAt: firstProfile.privacy_consent_at
          ? parseDateValue(firstProfile.privacy_consent_at).toISOString()
          : null,
        cameraConsentAt: firstProfile.camera_consent_at
          ? parseDateValue(firstProfile.camera_consent_at).toISOString()
          : null,
      },
      settings: {
        dailyGoalHours: resolvedDailyGoalHours,
        idleThresholdSeconds: Number(firstProfile.idle_threshold_seconds ?? 25),
        focusAlert: Number(firstProfile.focus_alert ?? 1) === 1,
        breakReminder: Number(firstProfile.break_reminder ?? 1) === 1,
        saveRawVideo: Number(firstProfile.save_raw_video ?? 0) === 1,
        defaultSessionMinutes: Number(firstProfile.default_session_minutes ?? 90),
        defaultSessionMode: String(firstProfile.default_session_mode ?? DEFAULT_SESSION_MODE),
        autoResumeSession: Number(firstProfile.auto_resume_session ?? 1) === 1,
        soundAlerts: Number(firstProfile.sound_alerts ?? 1) === 1,
        showLiveScore: Number(firstProfile.show_live_score ?? 1) === 1,
        showEventLog: Number(firstProfile.show_event_log ?? 1) === 1,
        reduceMotion: Number(firstProfile.reduce_motion ?? 0) === 1,
        keepScreenAwake: Number(firstProfile.keep_screen_awake ?? 0) === 1,
      },
      sessions: sessionRows.map((row) => mapSession(row, timelineMap.get(String(row.session_id)))),
    }
  })
}

export async function saveSession(
  userId: number,
  emailFromAccount: string,
  payload: SessionSavePayload,
): Promise<StoredSessionPayload> {
  await withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      await upsertUserRecord(connection, userId, emailFromAccount, payload.profile)
      await upsertSettingsRecord(connection, userId, payload.settings)
      await syncUserSubjects(connection, userId, payload.profile.subjects)
      await assertSessionOwnership(connection, userId, payload.session.id)

      await connection.query(
        `
          INSERT INTO study_sessions (
            session_id, user_id, subject_name, mode_name, goal_minutes, elapsed_seconds, focused_seconds,
            avg_score, final_score, timeline_json, tab_switches, idle_events, absence_events, hidden_seconds,
            highest_score, lowest_score, studied_note, distraction_note, next_goal_note, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            subject_name = VALUES(subject_name),
            mode_name = VALUES(mode_name),
            goal_minutes = VALUES(goal_minutes),
            elapsed_seconds = VALUES(elapsed_seconds),
            focused_seconds = VALUES(focused_seconds),
            avg_score = VALUES(avg_score),
            final_score = VALUES(final_score),
            timeline_json = VALUES(timeline_json),
            tab_switches = VALUES(tab_switches),
            idle_events = VALUES(idle_events),
            absence_events = VALUES(absence_events),
            hidden_seconds = VALUES(hidden_seconds),
            highest_score = VALUES(highest_score),
            lowest_score = VALUES(lowest_score),
            studied_note = VALUES(studied_note),
            distraction_note = VALUES(distraction_note),
            next_goal_note = VALUES(next_goal_note),
            created_at = VALUES(created_at),
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          payload.session.id,
          userId,
          payload.session.subject,
          payload.session.mode,
          payload.session.goalMinutes,
          payload.session.elapsedSeconds,
          payload.session.focusedSeconds,
          payload.session.avgScore,
          payload.session.finalScore,
          JSON.stringify(payload.session.timeline),
          payload.session.tabSwitches,
          payload.session.idleEvents,
          payload.session.absenceEvents,
          payload.session.hiddenSeconds,
          payload.session.highestScore,
          payload.session.lowestScore,
          payload.session.notes.studied,
          payload.session.notes.distraction,
          payload.session.notes.nextGoal,
          resolveSessionCreatedAt(payload.session.createdAt),
        ],
      )

      await replaceSessionTimeline(connection, payload.session.id, payload.session.timeline)

      await connection.query('DELETE FROM session_events WHERE session_id = ?', [payload.session.id])

      for (const event of payload.events) {
        await connection.query(
          `
            INSERT INTO session_events (session_id, severity, message, event_timestamp)
            VALUES (?, ?, ?, ?)
          `,
          [payload.session.id, event.severity, event.message, new Date(event.timestamp)],
        )
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })

  return payload.session
}

export async function updateSessionNotes(
  userId: number,
  sessionId: string,
  notes: SessionNotesPayload,
): Promise<StoredSessionPayload | null> {
  return withConnection(async (connection) => {
    await connection.query(
      `
        UPDATE study_sessions
        SET studied_note = ?, distraction_note = ?, next_goal_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND session_id = ?
      `,
      [notes.studied, notes.distraction, notes.nextGoal, userId, sessionId],
    )

    const rows = await connection.query<DbRow[]>(
      `
        SELECT *
        FROM study_sessions
        WHERE user_id = ? AND session_id = ?
        LIMIT 1
      `,
      [userId, sessionId],
    )

    if (!rows[0]) {
      return null
    }

    const timelineMap = await loadSessionTimelines(connection, [sessionId])
    return mapSession(rows[0], timelineMap.get(sessionId))
  })
}

export async function changeAccountPassword(userId: number, currentPassword: string, nextPassword: string) {
  await withConnection(async (connection) => {
    const storedHash = await loadPasswordHash(connection, userId)

    if (!storedHash || !verifyPassword(currentPassword, storedHash)) {
      throw new Error('INVALID_PASSWORD')
    }

    await connection.query(
      `
        UPDATE users
        SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [hashPassword(nextPassword), userId],
    )
  })
}

export async function deleteAccount(userId: number, password: string) {
  await withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      const storedHash = await loadPasswordHash(connection, userId)

      if (!storedHash || !verifyPassword(password, storedHash)) {
        throw new Error('INVALID_PASSWORD')
      }

      await connection.query('DELETE FROM users WHERE id = ?', [userId])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function requestPasswordReset(payload: ForgotPasswordPayload) {
  return withConnection(async (connection) => {
    await cleanupPasswordResetTokens(connection)

    const rows = await connection.query<DbRow[]>(
      `
        SELECT id, email, display_name
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [normalizeEmail(payload.email)],
    )

    const candidate = rows[0]

    if (!candidate) {
      return null
    }

    const userId = Number(candidate.id)
    const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex')
    const tokenHash = hashPasswordResetToken(token)

    await connection.beginTransaction()

    try {
      await connection.query(
        `
          DELETE FROM password_reset_tokens
          WHERE user_id = ?
        `,
        [userId],
      )

      await connection.query(
        `
          INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES (?, ?, ?)
        `,
        [userId, tokenHash, buildPasswordResetExpiryDate()],
      )

      await connection.commit()

      return {
        token,
        email: String(candidate.email),
        name: String(candidate.display_name),
      }
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function resetPasswordWithToken(token: string, nextPassword: string) {
  await withConnection(async (connection) => {
    await cleanupPasswordResetTokens(connection)
    await connection.beginTransaction()

    try {
      const rows = await connection.query<DbRow[]>(
        `
          SELECT id, user_id, expires_at, used_at
          FROM password_reset_tokens
          WHERE token_hash = ?
          LIMIT 1
        `,
        [hashPasswordResetToken(token)],
      )

      const tokenRecord = rows[0]

      if (!tokenRecord) {
        throw new Error('RESET_TOKEN_INVALID')
      }

      if (tokenRecord.used_at || parseDateValue(tokenRecord.expires_at).getTime() <= Date.now()) {
        throw new Error('RESET_TOKEN_INVALID')
      }

      const userId = Number(tokenRecord.user_id)

      await connection.query(
        `
          UPDATE users
          SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [hashPassword(nextPassword), userId],
      )

      await connection.query(
        `
          UPDATE password_reset_tokens
          SET used_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [Number(tokenRecord.id)],
      )

      await destroyAuthSessionsForUser(connection, userId)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function getActiveAnnouncement(): Promise<AnnouncementPayload | null> {
  return withConnection(async (connection) => {
    const rows = await connection.query<DbRow[]>(
      `
        SELECT id, title, body, tone, is_active, is_pinned, starts_at, ends_at, created_at, updated_at
        FROM announcements
        WHERE is_active = 1
          AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
          AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
        ORDER BY is_pinned DESC, updated_at DESC, id DESC
        LIMIT 1
      `,
    )

    return rows[0] ? mapAnnouncement(rows[0]) : null
  })
}

export async function getPublishedAnnouncements(): Promise<AnnouncementPayload[]> {
  return withConnection(async (connection) => {
    const rows = await connection.query<DbRow[]>(
      `
        SELECT id, title, body, tone, is_active, is_pinned, starts_at, ends_at, created_at, updated_at
        FROM announcements
        WHERE is_active = 1
          AND (ends_at IS NULL OR ends_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY))
        ORDER BY
          is_pinned DESC,
          CASE
            WHEN (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
              AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP) THEN 0
            WHEN starts_at > CURRENT_TIMESTAMP THEN 1
            ELSE 2
          END ASC,
          COALESCE(starts_at, updated_at) DESC,
          id DESC
        LIMIT 20
      `,
    )

    return rows.map((row) => mapAnnouncement(row))
  })
}

export async function createAnnouncement(actorUserId: number, payload: AnnouncementUpsertPayload) {
  return withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      const insertResult = await connection.query(
        `
          INSERT INTO announcements (
            title, body, tone, is_active, is_pinned, starts_at, ends_at, created_by, updated_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          payload.title,
          payload.body,
          payload.tone,
          payload.isActive ? 1 : 0,
          payload.isPinned ? 1 : 0,
          payload.startsAt ? new Date(payload.startsAt) : null,
          payload.endsAt ? new Date(payload.endsAt) : null,
          actorUserId,
          actorUserId,
        ],
      ) as InsertResult

      const announcementId = Number(insertResult.insertId)

      await insertAdminAuditLog(connection, {
        actorUserId,
        actionType: 'announcement.create',
        targetType: 'announcement',
        targetId: announcementId,
        summary: `Created announcement "${payload.title}"`,
        details: JSON.stringify({
          tone: payload.tone,
          isActive: payload.isActive,
          isPinned: payload.isPinned,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
        }),
      })

      const rows = await connection.query<DbRow[]>(
        `
          SELECT id, title, body, tone, is_active, is_pinned, starts_at, ends_at, created_at, updated_at
          FROM announcements
          WHERE id = ?
          LIMIT 1
        `,
        [announcementId],
      )

      await connection.commit()
      return mapAnnouncement(rows[0])
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function getDiscordBotSettings(botId = 1): Promise<DiscordBotSettingsRecord> {
  return withConnection(async (connection) => {
    const rows = await connection.query<DbRow[]>(
      `
        SELECT *
        FROM discord_bot_settings
        WHERE id = ?
        LIMIT 1
      `,
      [botId],
    )

    return mapDiscordBotSettings(rows[0])
  })
}

export async function saveDiscordBotSettings(
  actorUserId: number,
  payload: DiscordBotSettingsUpdatePayload,
  tokenUpdate?: { ciphertext: string | null; preview: string | null },
  botId = 1,
) {
  return withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      const existingRows = await connection.query<DbRow[]>(
        `
          SELECT *
          FROM discord_bot_settings
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [botId],
      )
      const existing = mapDiscordBotSettings(existingRows[0])
      const tokenCiphertext = tokenUpdate === undefined ? existing.tokenCiphertext : tokenUpdate.ciphertext
      const tokenPreview = tokenUpdate === undefined ? existing.settings.tokenPreview : tokenUpdate.preview

      if (existing.settings.enabled) {
        if (!tokenCiphertext) {
          throw new Error('Discord bot token is required.')
        }

        if (!payload.clientId.trim()) {
          throw new Error('Discord application ID is required.')
        }
      }

      await connection.query(
        `
          INSERT INTO discord_bot_settings (
            id,
            enabled,
            token_ciphertext,
            token_preview,
            client_id,
            guild_ids,
            admin_channel_id,
            admin_role_ids,
            bot_actor_user_id,
            register_commands,
            admin_url,
            support_poll_ms,
            health_poll_ms,
            daily_summary_hour,
            updated_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            token_ciphertext = VALUES(token_ciphertext),
            token_preview = VALUES(token_preview),
            client_id = VALUES(client_id),
            guild_ids = VALUES(guild_ids),
            admin_channel_id = VALUES(admin_channel_id),
            admin_role_ids = VALUES(admin_role_ids),
            bot_actor_user_id = VALUES(bot_actor_user_id),
            register_commands = VALUES(register_commands),
            admin_url = VALUES(admin_url),
            support_poll_ms = VALUES(support_poll_ms),
            health_poll_ms = VALUES(health_poll_ms),
            daily_summary_hour = VALUES(daily_summary_hour),
            updated_by = VALUES(updated_by),
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          botId,
          existing.settings.enabled ? 1 : 0,
          tokenCiphertext,
          tokenPreview,
          payload.clientId,
          JSON.stringify(payload.guildIds),
          payload.adminChannelId,
          JSON.stringify(payload.adminRoleIds),
          payload.botActorUserId,
          payload.registerCommands ? 1 : 0,
          payload.adminUrl,
          payload.supportPollMs,
          payload.healthPollMs,
          payload.dailySummaryHour,
          actorUserId,
        ],
      )

      await insertAdminAuditLog(connection, {
        actorUserId,
        actionType: 'discord_bot.settings_update',
        targetType: 'discord_bot',
        targetId: 'settings',
        summary: 'Updated Discord bot settings',
        details: JSON.stringify({
          tokenChanged: tokenUpdate !== undefined,
          clientIdConfigured: Boolean(payload.clientId),
          guildCount: payload.guildIds.length,
          adminRoleCount: payload.adminRoleIds.length,
        }),
      })

      const rows = await connection.query<DbRow[]>(
        `
          SELECT *
          FROM discord_bot_settings
          WHERE id = ?
          LIMIT 1
        `,
        [botId],
      )

      await connection.commit()
      return mapDiscordBotSettings(rows[0])
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function setDiscordBotEnabled(actorUserId: number, enabled: boolean, botId = 1) {
  return withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      if (enabled) {
        const existingRows = await connection.query<DbRow[]>(
          `
            SELECT *
            FROM discord_bot_settings
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
          `,
          [botId],
        )
        const existing = mapDiscordBotSettings(existingRows[0])

        if (!existing.tokenCiphertext) {
          throw new Error('Discord bot token is required.')
        }

        if (!existing.settings.clientId.trim()) {
          throw new Error('Discord application ID is required.')
        }
      }

      await connection.query(
        `
          INSERT INTO discord_bot_settings (
            id, enabled, guild_ids, admin_role_ids, updated_by, status_state
          )
          VALUES (?, ?, '[]', '[]', ?, ?)
          ON DUPLICATE KEY UPDATE
            enabled = VALUES(enabled),
            updated_by = VALUES(updated_by),
            updated_at = CURRENT_TIMESTAMP
        `,
        [botId, enabled ? 1 : 0, actorUserId, enabled ? 'starting' : 'disabled'],
      )

      await insertAdminAuditLog(connection, {
        actorUserId,
        actionType: enabled ? 'discord_bot.enable' : 'discord_bot.disable',
        targetType: 'discord_bot',
        targetId: 'settings',
        summary: enabled ? 'Enabled Discord bot' : 'Disabled Discord bot',
      })

      const rows = await connection.query<DbRow[]>(
        `
          SELECT *
          FROM discord_bot_settings
          WHERE id = ?
          LIMIT 1
        `,
        [botId],
      )

      await connection.commit()
      return mapDiscordBotSettings(rows[0])
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function updateDiscordBotStoredStatus(status: DiscordBotStatusPayload, botId = 1) {
  await withConnection(async (connection) => {
    await connection.query(
      `
        INSERT INTO discord_bot_settings (
          id, guild_ids, admin_role_ids, status_state, bot_user_tag, last_started_at, last_stopped_at, last_error
        )
        VALUES (?, '[]', '[]', ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status_state = VALUES(status_state),
          bot_user_tag = VALUES(bot_user_tag),
          last_started_at = VALUES(last_started_at),
          last_stopped_at = VALUES(last_stopped_at),
          last_error = VALUES(last_error),
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        botId,
        status.state,
        status.botUserTag,
        status.lastStartedAt ? new Date(status.lastStartedAt) : null,
        status.lastStoppedAt ? new Date(status.lastStoppedAt) : null,
        status.lastError,
      ],
    )
  })
}

export async function updateAnnouncement(
  actorUserId: number,
  announcementId: number,
  payload: AnnouncementUpsertPayload,
) {
  return withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      const existingRows = await connection.query<DbRow[]>(
        `
          SELECT id
          FROM announcements
          WHERE id = ?
          LIMIT 1
        `,
        [announcementId],
      )

      if (!existingRows[0]) {
        throw new Error('ANNOUNCEMENT_NOT_FOUND')
      }

      await connection.query(
        `
          UPDATE announcements
          SET
            title = ?,
            body = ?,
            tone = ?,
            is_active = ?,
            is_pinned = ?,
            starts_at = ?,
            ends_at = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          payload.title,
          payload.body,
          payload.tone,
          payload.isActive ? 1 : 0,
          payload.isPinned ? 1 : 0,
          payload.startsAt ? new Date(payload.startsAt) : null,
          payload.endsAt ? new Date(payload.endsAt) : null,
          actorUserId,
          announcementId,
        ],
      )

      await insertAdminAuditLog(connection, {
        actorUserId,
        actionType: 'announcement.update',
        targetType: 'announcement',
        targetId: announcementId,
        summary: `Updated announcement "${payload.title}"`,
        details: JSON.stringify({
          tone: payload.tone,
          isActive: payload.isActive,
          isPinned: payload.isPinned,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
        }),
      })

      const rows = await connection.query<DbRow[]>(
        `
          SELECT id, title, body, tone, is_active, is_pinned, starts_at, ends_at, created_at, updated_at
          FROM announcements
          WHERE id = ?
          LIMIT 1
        `,
        [announcementId],
      )

      await connection.commit()
      return mapAnnouncement(rows[0])
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function deleteAnnouncement(actorUserId: number, announcementId: number) {
  return withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      const existingRows = await connection.query<DbRow[]>(
        `
          SELECT id, title
          FROM announcements
          WHERE id = ?
          LIMIT 1
        `,
        [announcementId],
      )

      const existing = existingRows[0]

      if (!existing) {
        throw new Error('ANNOUNCEMENT_NOT_FOUND')
      }

      await connection.query('DELETE FROM announcements WHERE id = ?', [announcementId])

      await insertAdminAuditLog(connection, {
        actorUserId,
        actionType: 'announcement.delete',
        targetType: 'announcement',
        targetId: announcementId,
        summary: `Deleted announcement "${String(existing.title)}"`,
        details: JSON.stringify({
          title: String(existing.title),
        }),
      })

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function listSupportTicketsForUser(userId: number): Promise<SupportTicketPayload[]> {
  return withConnection(async (connection) => {
    const rows = await connection.query<DbRow[]>(
      `
        SELECT
          t.id,
          t.user_id,
          u.display_name,
          u.email,
          t.category,
          t.status,
          t.subject,
          t.body,
          t.admin_reply,
          t.created_at,
          t.updated_at,
          t.answered_at
        FROM support_tickets t
        INNER JOIN users u ON u.id = t.user_id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 50
      `,
      [userId],
    )

    return rows.map((row) => mapSupportTicket(row))
  })
}

export async function createSupportTicket(userId: number, payload: SupportTicketCreatePayload) {
  return withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      const insertResult = await connection.query(
        `
          INSERT INTO support_tickets (user_id, category, status, subject, body)
          VALUES (?, ?, 'open', ?, ?)
        `,
        [userId, payload.category, payload.subject, payload.body],
      ) as InsertResult

      const rows = await connection.query<DbRow[]>(
        `
          SELECT
            t.id,
            t.user_id,
            u.display_name,
            u.email,
            t.category,
            t.status,
            t.subject,
            t.body,
            t.admin_reply,
            t.created_at,
            t.updated_at,
            t.answered_at
          FROM support_tickets t
          INNER JOIN users u ON u.id = t.user_id
          WHERE t.id = ?
          LIMIT 1
        `,
        [Number(insertResult.insertId)],
      )

      await connection.commit()
      return mapSupportTicket(rows[0])
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function updateSupportTicket(
  actorUserId: number,
  ticketId: number,
  payload: SupportTicketAdminUpdatePayload,
) {
  return withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      const existingRows = await connection.query<DbRow[]>(
        `
          SELECT
            t.id,
            t.user_id,
            t.subject,
            t.status,
            u.display_name,
            u.email
          FROM support_tickets t
          INNER JOIN users u ON u.id = t.user_id
          WHERE t.id = ?
          LIMIT 1
        `,
        [ticketId],
      )

      const existing = existingRows[0]

      if (!existing) {
        throw new Error('SUPPORT_TICKET_NOT_FOUND')
      }

      await connection.query(
        `
          UPDATE support_tickets
          SET
            status = ?,
            admin_reply = ?,
            answered_at = CASE
              WHEN ? <> '' THEN CURRENT_TIMESTAMP
              ELSE answered_at
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [payload.status, payload.adminReply || null, payload.adminReply.trim(), ticketId],
      )

      await insertAdminAuditLog(connection, {
        actorUserId,
        actionType: 'support.update',
        targetType: 'support_ticket',
        targetId: ticketId,
        summary: `Updated support ticket "${String(existing.subject)}"`,
        details: JSON.stringify({
          status: payload.status,
          adminReplyLength: payload.adminReply.length,
          userEmail: String(existing.email),
        }),
      })

      const rows = await connection.query<DbRow[]>(
        `
          SELECT
            t.id,
            t.user_id,
            u.display_name,
            u.email,
            t.category,
            t.status,
            t.subject,
            t.body,
            t.admin_reply,
            t.created_at,
            t.updated_at,
            t.answered_at
          FROM support_tickets t
          INNER JOIN users u ON u.id = t.user_id
          WHERE t.id = ?
          LIMIT 1
        `,
        [ticketId],
      )

      await connection.commit()
      return mapSupportTicket(rows[0])
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

export async function updateAdminUserRole(actorUserId: number, targetUserId: number, isAdmin: boolean) {
  await withConnection(async (connection) => {
    await connection.beginTransaction()

    try {
      if (actorUserId === targetUserId) {
        throw new Error('SELF_ADMIN_ROLE_UPDATE_BLOCKED')
      }

      const targetRows = await connection.query<DbRow[]>(
        `
          SELECT id, email, display_name, is_admin
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
        [targetUserId],
      )

      const target = targetRows[0]

      if (!target) {
        throw new Error('ADMIN_TARGET_NOT_FOUND')
      }

      const email = String(target.email)
      const displayName = String(target.display_name)
      const persistedAdmin = Number(target.is_admin ?? 0) === 1

      if (!isAdmin && isAdminEmail(email)) {
        throw new Error('ALLOWLIST_ADMIN_LOCKED')
      }

      if (!isAdmin && persistedAdmin) {
        const [adminCountRow] = await connection.query<DbRow[]>(
          `
            SELECT COUNT(*) AS admin_count
            FROM users
            WHERE is_admin = 1
          `,
        )

        if (Number(adminCountRow?.admin_count ?? 0) <= 1) {
          throw new Error('LAST_ADMIN_BLOCKED')
        }
      }

      await connection.query(
        `
          UPDATE users
          SET is_admin = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [isAdmin ? 1 : 0, targetUserId],
      )

      await insertAdminAuditLog(connection, {
        actorUserId,
        actionType: isAdmin ? 'user.promote_admin' : 'user.revoke_admin',
        targetType: 'user',
        targetId: targetUserId,
        summary: `${isAdmin ? 'Granted' : 'Removed'} admin role for ${displayName}`,
        details: JSON.stringify({
          targetUserId,
          targetEmail: email,
          nextIsAdmin: isAdmin,
        }),
      })

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }
  })
}

function toIsoOrNull(value: unknown) {
  if (!value) {
    return null
  }

  return parseDateValue(value).toISOString()
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function buildRecentDateKeys(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (days - 1 - index))
    return formatDateKey(date)
  })
}

export async function getAdminSystemStatus(): Promise<AdminSystemStatusPayload> {
  return withConnection(async (connection) => {
    const [authSessionStats] = await connection.query<DbRow[]>(
      `
        SELECT
          COUNT(*) AS active_auth_sessions,
          SUM(
            CASE
              WHEN expires_at <= DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY) THEN 1
              ELSE 0
            END
          ) AS expiring_auth_sessions
        FROM auth_sessions
        WHERE expires_at > CURRENT_TIMESTAMP
      `,
    )

    const [userSystemStats] = await connection.query<DbRow[]>(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN session_counts.session_count IS NULL THEN 1
                ELSE 0
              END
            ),
            0
          ) AS users_without_sessions,
          MAX(u.created_at) AS last_user_created_at
        FROM users u
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS session_count
          FROM study_sessions
          GROUP BY user_id
        ) AS session_counts ON session_counts.user_id = u.id
      `,
    )

    const [sessionSystemStats] = await connection.query<DbRow[]>(
      `
        SELECT
          MAX(created_at) AS last_session_created_at,
          MAX(server_created_at) AS last_session_server_created_at
        FROM study_sessions
      `,
    )

    return {
      nodeEnv: env.NODE_ENV,
      mariaEnabled: true,
      mariaReachable: true,
      anthropicEnabled: false,
      autoMigrateSchema: false,
      activeAuthSessions: Number(authSessionStats?.active_auth_sessions ?? 0),
      authSessionsExpiringSoon: Number(authSessionStats?.expiring_auth_sessions ?? 0),
      usersWithoutSessions: Number(userSystemStats?.users_without_sessions ?? 0),
      lastUserCreatedAt: toIsoOrNull(userSystemStats?.last_user_created_at),
      lastSessionCreatedAt: toIsoOrNull(
        sessionSystemStats?.last_session_server_created_at ?? sessionSystemStats?.last_session_created_at,
      ),
      rateLimits: {
        totalActiveBuckets: 0,
        buckets: [],
      },
    }
  })
}

export async function getAdminOverview(): Promise<AdminOverviewPayload> {
  return withConnection(async (connection) => {
    const [userTotals] = await connection.query<DbRow[]>(
      `
        SELECT
          COUNT(*) AS total_users,
          SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS admin_users
        FROM users
      `,
    )

    const [sessionTotals] = await connection.query<DbRow[]>(
      `
        SELECT
          COUNT(*) AS total_sessions,
          COALESCE(ROUND(AVG(avg_score)), 0) AS average_focus_score,
          SUM(CASE WHEN server_created_at >= CURRENT_DATE THEN 1 ELSE 0 END) AS sessions_today,
          SUM(CASE WHEN server_created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY) THEN 1 ELSE 0 END) AS sessions_7d,
          COALESCE(
            ROUND(
              AVG(
                CASE
                  WHEN server_created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY) THEN avg_score
                  ELSE NULL
                END
              )
            ),
            0
          ) AS average_focus_score_7d,
          COUNT(
            DISTINCT CASE
              WHEN server_created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY) THEN user_id
              ELSE NULL
            END
          ) AS active_users_7d
        FROM study_sessions
      `,
    )

    const recentUsersRows = await connection.query<DbRow[]>(
      `
        SELECT
          u.id,
          u.display_name,
          u.email,
          u.is_admin,
          u.created_at,
          MAX(s.created_at) AS last_session_at
        FROM users u
        LEFT JOIN study_sessions s ON s.user_id = u.id
        GROUP BY u.id, u.display_name, u.email, u.is_admin, u.created_at
        ORDER BY u.created_at DESC
        LIMIT 8
      `,
    )

    const recentSessionRows = await connection.query<DbRow[]>(
      `
        SELECT
          s.session_id,
          s.subject_name,
          s.avg_score,
          s.created_at,
          u.display_name,
          u.email
        FROM study_sessions s
        INNER JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC
        LIMIT 8
      `,
    )

    const adminUsersRows = await connection.query<DbRow[]>(
      `
        SELECT
          u.id,
          u.display_name,
          u.email,
          u.is_admin,
          u.created_at,
          MAX(s.created_at) AS last_session_at,
          COUNT(DISTINCT s.session_id) AS session_count,
          COALESCE(ROUND(AVG(s.avg_score)), 0) AS average_focus_score,
          COALESCE(SUM(s.elapsed_seconds), 0) AS total_study_seconds,
          COALESCE(
            GROUP_CONCAT(DISTINCT subj.display_name ORDER BY subj.display_name SEPARATOR '||'),
            ''
          ) AS subjects_csv
        FROM users u
        LEFT JOIN study_sessions s ON s.user_id = u.id
        LEFT JOIN user_subjects us ON us.user_id = u.id
        LEFT JOIN subjects subj ON subj.id = us.subject_id
        GROUP BY u.id, u.display_name, u.email, u.is_admin, u.created_at
        ORDER BY last_session_at DESC, u.created_at DESC
        LIMIT 120
      `,
    )

    const adminSessionRows = await connection.query<DbRow[]>(
      `
        SELECT
          s.session_id,
          s.user_id,
          u.display_name,
          u.email,
          s.subject_name,
          s.mode_name,
          s.avg_score,
          s.final_score,
          s.goal_minutes,
          s.elapsed_seconds,
          s.focused_seconds,
          s.tab_switches,
          s.idle_events,
          s.absence_events,
          s.created_at
        FROM study_sessions s
        INNER JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC
        LIMIT 160
      `,
    )

    const topSubjectRows = await connection.query<DbRow[]>(
      `
        SELECT
          subject_name,
          COUNT(*) AS session_count,
          COALESCE(ROUND(AVG(avg_score)), 0) AS average_focus_score
        FROM study_sessions
        GROUP BY subject_name
        ORDER BY session_count DESC, average_focus_score DESC, subject_name ASC
        LIMIT 6
      `,
    )

    const sessionDailyRows = await connection.query<DbRow[]>(
      `
        SELECT
          DATE(server_created_at) AS date_key,
          COUNT(*) AS session_count,
          COALESCE(ROUND(AVG(avg_score)), 0) AS average_focus_score
        FROM study_sessions
        WHERE server_created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY)
        GROUP BY DATE(server_created_at)
      `,
    )

    const userDailyRows = await connection.query<DbRow[]>(
      `
        SELECT
          DATE(created_at) AS date_key,
          COUNT(*) AS user_count
        FROM users
        WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY)
        GROUP BY DATE(created_at)
      `,
    )

    const announcementRows = await connection.query<DbRow[]>(
      `
        SELECT id, title, body, tone, is_active, is_pinned, starts_at, ends_at, created_at, updated_at
        FROM announcements
        ORDER BY updated_at DESC, id DESC
        LIMIT 12
      `,
    )

    const supportTicketRows = await connection.query<DbRow[]>(
      `
        SELECT
          t.id,
          t.user_id,
          u.display_name,
          u.email,
          t.category,
          t.status,
          t.subject,
          t.body,
          t.admin_reply,
          t.created_at,
          t.updated_at,
          t.answered_at
        FROM support_tickets t
        INNER JOIN users u ON u.id = t.user_id
        ORDER BY
          CASE
            WHEN t.status IN ('open', 'reviewing') THEN 0
            ELSE 1
          END ASC,
          t.updated_at DESC,
          t.id DESC
        LIMIT 80
      `,
    )

    const auditLogRows = await connection.query<DbRow[]>(
      `
        SELECT
          id,
          actor_user_id,
          actor_name,
          actor_email,
          action_type,
          target_type,
          target_id,
          summary,
          details,
          created_at
        FROM admin_audit_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 20
      `,
    )

    const recentUsers: AdminUserSummaryPayload[] = recentUsersRows.map((row) => ({
      id: String(row.id),
      name: String(row.display_name),
      email: String(row.email),
      isAdmin: resolveAdminFlag(row.is_admin, String(row.email)),
      createdAt: parseDateValue(row.created_at).toISOString(),
      lastSessionAt: toIsoOrNull(row.last_session_at),
    }))

    const recentSessions: AdminSessionSummaryPayload[] = recentSessionRows.map((row) => ({
      sessionId: String(row.session_id),
      userName: String(row.display_name),
      userEmail: String(row.email),
      subject: String(row.subject_name),
      avgScore: Number(row.avg_score ?? 0),
      createdAt: parseDateValue(row.created_at).toISOString(),
    }))

    const users: AdminUserRecordPayload[] = adminUsersRows.map((row) => ({
      id: String(row.id),
      name: String(row.display_name),
      email: String(row.email),
      isAdmin: resolveAdminFlag(row.is_admin, String(row.email)),
      createdAt: parseDateValue(row.created_at).toISOString(),
      lastSessionAt: toIsoOrNull(row.last_session_at),
      sessionCount: Number(row.session_count ?? 0),
      averageFocusScore: Number(row.average_focus_score ?? 0),
      totalStudySeconds: Number(row.total_study_seconds ?? 0),
      subjects: String(row.subjects_csv ?? '')
        .split('||')
        .map((subject) => subject.trim())
        .filter(Boolean),
    }))

    const sessions: AdminSessionRecordPayload[] = adminSessionRows.map((row) => ({
      sessionId: String(row.session_id),
      userId: String(row.user_id),
      userName: String(row.display_name),
      userEmail: String(row.email),
      subject: String(row.subject_name),
      mode: String(row.mode_name),
      avgScore: Number(row.avg_score ?? 0),
      finalScore: Number(row.final_score ?? 0),
      goalMinutes: Number(row.goal_minutes ?? 0),
      elapsedSeconds: Number(row.elapsed_seconds ?? 0),
      focusedSeconds: Number(row.focused_seconds ?? 0),
      tabSwitches: Number(row.tab_switches ?? 0),
      idleEvents: Number(row.idle_events ?? 0),
      absenceEvents: Number(row.absence_events ?? 0),
      createdAt: parseDateValue(row.created_at).toISOString(),
    }))

    const topSubjects: AdminSubjectSummaryPayload[] = topSubjectRows.map((row) => ({
      subject: String(row.subject_name),
      sessionCount: Number(row.session_count ?? 0),
      averageFocusScore: Number(row.average_focus_score ?? 0),
    }))

    const sessionDailyMap = new Map(
      sessionDailyRows.map((row) => [
        formatDateKey(parseDateValue(row.date_key)),
        {
          sessions: Number(row.session_count ?? 0),
          averageFocusScore: Number(row.average_focus_score ?? 0),
        },
      ]),
    )

    const userDailyMap = new Map(
      userDailyRows.map((row) => [
        formatDateKey(parseDateValue(row.date_key)),
        Number(row.user_count ?? 0),
      ]),
    )

    const dailyStats: AdminDailyStatPayload[] = buildRecentDateKeys(7).map((dateKey) => ({
      date: dateKey,
      newUsers: userDailyMap.get(dateKey) ?? 0,
      sessions: sessionDailyMap.get(dateKey)?.sessions ?? 0,
      averageFocusScore: sessionDailyMap.get(dateKey)?.averageFocusScore ?? 0,
    }))

    const announcements = announcementRows.map((row) => mapAnnouncement(row))
    const supportTickets = supportTicketRows.map((row) => mapSupportTicket(row))
    const auditLogs = auditLogRows.map((row) => mapAdminAuditLog(row))

    return {
      totals: {
        totalUsers: Number(userTotals?.total_users ?? 0),
        totalSessions: Number(sessionTotals?.total_sessions ?? 0),
        sessionsToday: Number(sessionTotals?.sessions_today ?? 0),
        averageFocusScore: Number(sessionTotals?.average_focus_score ?? 0),
        adminUsers: Number(userTotals?.admin_users ?? 0),
        activeUsers7d: Number(sessionTotals?.active_users_7d ?? 0),
        sessions7d: Number(sessionTotals?.sessions_7d ?? 0),
        averageFocusScore7d: Number(sessionTotals?.average_focus_score_7d ?? 0),
      },
      recentUsers,
      recentSessions,
      users,
      sessions,
      topSubjects,
      dailyStats,
      announcements,
      supportTickets,
      auditLogs,
    }
  })
}
