import './load-env.js'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { generateAiFeedback } from './anthropic.js'
import {
  adminRoleUpdateSchema,
  accountDeleteSchema,
  announcementUpsertSchema,
  consentRefreshSchema,
  discordBotSettingsUpdateSchema,
  forgotPasswordSchema,
  loginSchema,
  notesUpdateSchema,
  passwordResetConfirmSchema,
  passwordChangeSchema,
  profileSchema,
  registerSchema,
  supportTicketAdminUpdateSchema,
  supportTicketCreateSchema,
  sessionSaveSchema,
  settingsSchema,
} from './contracts.js'
import {
  clearSessionCookie,
  destroyRequestSession,
  requireAdmin,
  requireAuth,
  resolveRequestAuth,
  setSessionCookie,
} from './auth.js'
import { CAPACITOR_CLIENT_ORIGIN, clientOrigins, env, runtimeFlags } from './env.js'
import { createDiscordJsBotGateway } from './discord-bot-gateway.js'
import { createDiscordBotManager, type DiscordBotManager } from './discord-bot-manager.js'
import {
  decryptDiscordBotToken,
  encryptDiscordBotToken,
  isDiscordBotTokenStorageReady,
  maskDiscordBotToken,
} from './discord-bot-secrets.js'
import { createProcessDiscordBotGateway } from './process-discord-bot-gateway.js'
import { seedBundledLostarkDiscordBotData } from './lostark-discord-bot-runtime.js'
import { sendPasswordResetEmail } from './mailer.js'
import { ensureSchema, pingMaria } from './mariadb.js'
import { createRateLimit, getRateLimitStats } from './rate-limit.js'
import { createStateChangingRequestGuard } from './request-origin.js'
import { buildSecurityHeaders } from './security-headers.js'
import {
  getAdminRoleUpdateErrorResponse,
  getAnnouncementMutationErrorResponse,
  getSupportTicketAdminUpdateErrorResponse,
} from './admin-route-errors.js'
import {
  authenticateAccount,
  acceptCurrentConsent,
  changeAccountPassword,
  createAnnouncement,
  createAuthSession,
  createSupportTicket,
  deleteAnnouncement,
  deleteAccount,
  getDiscordBotSettings,
  getActiveAnnouncement,
  getAdminOverview,
  getPublishedAnnouncements,
  getAdminSystemStatus,
  getBootstrap,
  listSupportTicketsForUser,
  registerAccount,
  requestPasswordReset,
  resetPasswordWithToken,
  saveSession,
  saveDiscordBotSettings,
  setDiscordBotEnabled,
  updateDiscordBotStoredStatus,
  updateAnnouncement,
  updateAdminUserRole,
  updateSupportTicket,
  updateSessionNotes,
  upsertProfileAndSettings,
} from './store.js'
import type { DiscordBotSettingsRecord } from './store.js'

const app = express()
const serverRoot = path.dirname(fileURLToPath(import.meta.url))
const frontendDistDir = path.resolve(serverRoot, '../../dist')

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(
  cors({
    origin: clientOrigins,
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
const securityHeaders = buildSecurityHeaders(env.NODE_ENV)

app.use((request, response, next) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.setHeader(name, value)
  }

  if (request.path.startsWith('/api/')) {
    response.setHeader('Cache-Control', 'no-store')
  }

  next()
})
app.use(createStateChangingRequestGuard(clientOrigins, env.SESSION_COOKIE_NAME))

const authRateLimit = createRateLimit({
  bucket: 'auth',
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
})

const accountRateLimit = createRateLimit({
  bucket: 'account',
  windowMs: env.ACCOUNT_RATE_LIMIT_WINDOW_MS,
  max: env.ACCOUNT_RATE_LIMIT_MAX,
})

const aiRateLimit = createRateLimit({
  bucket: 'ai',
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  max: env.AI_RATE_LIMIT_MAX,
})

const adminRateLimit = createRateLimit({
  bucket: 'admin',
  windowMs: env.ADMIN_RATE_LIMIT_WINDOW_MS,
  max: env.ADMIN_RATE_LIMIT_MAX,
})

const discordBotManager = createDiscordBotManager({
  gateway: createDiscordJsBotGateway(),
})
const configuredLostarkDiscordBotDir = process.env.LOSTARK_DISCORD_BOT_DIR?.trim()
const useBundledLostarkDiscordBot = env.NODE_ENV === 'production' && !configuredLostarkDiscordBotDir
const lostarkDiscordBotDir = configuredLostarkDiscordBotDir
  ? path.resolve(process.cwd(), configuredLostarkDiscordBotDir)
  : useBundledLostarkDiscordBot
    ? path.resolve(process.cwd(), 'uploads', 'lostark-discord-bot')
    : path.resolve(process.cwd(), 'lostark-discord-bot')
const bundledLostarkDiscordBotDir = path.resolve(serverRoot, 'lostark-discord-bot')

if (useBundledLostarkDiscordBot) {
  mkdirSync(lostarkDiscordBotDir, { recursive: true })
  seedBundledLostarkDiscordBotData({
    bundledBotDir: bundledLostarkDiscordBotDir,
    workingBotDir: lostarkDiscordBotDir,
  })
}

const lostarkDiscordBotManager = createDiscordBotManager({
  gateway: createProcessDiscordBotGateway({
    botDir: lostarkDiscordBotDir,
    entrypoint: useBundledLostarkDiscordBot
      ? path.join(bundledLostarkDiscordBotDir, 'index.js')
      : undefined,
    commandDeployEntrypoint: useBundledLostarkDiscordBot
      ? path.join(bundledLostarkDiscordBotDir, 'deploy-commands.js')
      : undefined,
    logPrefix: 'lostark-discord-bot',
  }),
})

const focusaiDiscordBotId = 1
const lostarkDiscordBotId = 2
const generatedDiscordBotSecretFilePath = path.resolve(
  process.cwd(),
  'uploads',
  '.focusai-secrets',
  'discord-bot-settings-secret',
)
const discordBotSecretMissingMessage =
  '운영 서버의 Discord 봇 토큰 암호화 키를 준비하지 못해 Discord 봇 토큰을 저장하거나 사용할 수 없습니다. uploads 볼륨 권한을 확인해 주세요.'

function discordBotSecretOptions() {
  return {
    secret: process.env.DISCORD_BOT_SETTINGS_SECRET,
    nodeEnv: env.NODE_ENV,
    generatedSecretFilePath: generatedDiscordBotSecretFilePath,
  }
}

function discordBotResponse(record: DiscordBotSettingsRecord, manager: DiscordBotManager) {
  const managerStatus = manager.getStatus()

  return {
    settings: {
      ...record.settings,
      tokenStorageReady: isDiscordBotTokenStorageReady(discordBotSecretOptions()),
    },
    status: managerStatus.state === 'disabled' ? record.status : managerStatus,
  }
}

function toDiscordRuntimeSettings(record: DiscordBotSettingsRecord) {
  return {
    enabled: record.settings.enabled,
    token: decryptDiscordBotToken(record.tokenCiphertext, discordBotSecretOptions()),
    clientId: record.settings.clientId,
    guildIds: record.settings.guildIds,
    adminChannelId: record.settings.adminChannelId,
    adminRoleIds: record.settings.adminRoleIds,
    botActorUserId: record.settings.botActorUserId,
    registerCommands: record.settings.registerCommands,
    adminUrl: record.settings.adminUrl,
    supportPollMs: record.settings.supportPollMs,
    healthPollMs: record.settings.healthPollMs,
    dailySummaryHour: record.settings.dailySummaryHour,
  }
}

function authTokenPayload(request: Request, token: string) {
  return request.headers.origin === CAPACITOR_CLIENT_ORIGIN ? { authToken: token } : {}
}

function isDiscordBotSecretError(error: unknown) {
  return error instanceof Error && error.message.includes('DISCORD_BOT_SETTINGS_SECRET')
}

function rejectDiscordBotSecretError(response: Response) {
  response.status(400).json({ error: discordBotSecretMissingMessage })
}

async function persistDiscordBotManagerStatus(manager: DiscordBotManager, botId: number) {
  if (!runtimeFlags.mariaEnabled) {
    return
  }

  await updateDiscordBotStoredStatus(manager.getStatus(), botId)
}

async function startDiscordBotFromRecord(
  record: DiscordBotSettingsRecord,
  manager: DiscordBotManager,
  botId: number,
) {
  await manager.start(toDiscordRuntimeSettings(record))
  await persistDiscordBotManagerStatus(manager, botId)
}

async function startDiscordBotIfEnabledById(
  botId: number,
  manager: DiscordBotManager,
  logLabel: string,
) {
  if (!runtimeFlags.mariaEnabled) {
    return
  }

  try {
    const record = await getDiscordBotSettings(botId)

    if (!record.settings.enabled) {
      return
    }

    await startDiscordBotFromRecord(record, manager, botId)
  } catch (error) {
    logRouteError(`${logLabel}.autostart`, error)
    await persistDiscordBotManagerStatus(manager, botId).catch((statusError: unknown) =>
      logRouteError(`${logLabel}.autostart-status`, statusError),
    )
  }
}

async function startDiscordBotIfEnabled() {
  if (runtimeFlags.discordBotAutostartDisabled) {
    return
  }

  await startDiscordBotIfEnabledById(focusaiDiscordBotId, discordBotManager, 'discord-bot.focusai')
  await startDiscordBotIfEnabledById(lostarkDiscordBotId, lostarkDiscordBotManager, 'discord-bot.lostark')
}

function withStatus(authenticated: boolean) {
  return {
    mariaEnabled: runtimeFlags.mariaEnabled,
    authenticated,
  }
}

function isDuplicateEmailError(error: unknown) {
  return error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS'
}

function isInvalidPasswordError(error: unknown) {
  return error instanceof Error && error.message === 'INVALID_PASSWORD'
}

function isSessionAccessDeniedError(error: unknown) {
  return error instanceof Error && error.message === 'SESSION_ACCESS_DENIED'
}

function isResetTokenInvalidError(error: unknown) {
  return error instanceof Error && error.message === 'RESET_TOKEN_INVALID'
}

function isMailNotConfiguredError(error: unknown) {
  return error instanceof Error && error.message === 'MAIL_NOT_CONFIGURED'
}

function toValidAnnouncementWindow(startsAt: string | null, endsAt: string | null) {
  if (!startsAt || !endsAt) {
    return true
  }

  return new Date(startsAt).getTime() <= new Date(endsAt).getTime()
}

function requireMariaConfigured(response: Response) {
  if (runtimeFlags.mariaEnabled) {
    return true
  }

  response.status(503).json({ error: 'MariaDB is not configured.' })
  return false
}

function logRouteError(scope: string, error: unknown) {
  console.error(`[${scope}]`, error)
}

function handleUnexpectedError(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  logRouteError('unhandled', error)

  if (response.headersSent) {
    next(error)
    return
  }

  response.status(500).json({ error: 'Unexpected server error.' })
}

function rejectValidationError(response: Response, message: string) {
  response.status(400).json({ error: message })
}

function assertProductionSecurity() {
  if (
    env.NODE_ENV === 'production' &&
    env.MARIADB_USER?.trim().toLowerCase() === 'root' &&
    !runtimeFlags.allowRootDbInProduction
  ) {
    throw new Error(
      'Refusing to start in production with the MariaDB root account. Use a dedicated application database user instead.',
    )
  }
}

app.get('/api/health', async (_request: Request, response: Response) => {
  response.json({
    ok: true,
    mariaEnabled: runtimeFlags.mariaEnabled,
    mariaReachable: await pingMaria(),
    anthropicEnabled: runtimeFlags.anthropicEnabled,
  })
})

app.get('/api/bootstrap', async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const authContext = await resolveRequestAuth(request)

    if (!authContext) {
      response.json({
        profile: null,
        settings: null,
        sessions: [],
        status: withStatus(false),
      })
      return
    }

    const bootstrap = await getBootstrap(authContext.userId)
    response.json({
      ...bootstrap,
      status: withStatus(true),
    })
  } catch (error) {
    logRouteError('bootstrap', error)
    response.status(500).json({ error: 'Failed to load bootstrap data.' })
  }
})

app.post('/api/auth/register', authRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const payload = registerSchema.parse(request.body)
    const account = await registerAccount(payload)
    const token = await createAuthSession(account.userId, request.headers['user-agent'] ?? '')
    setSessionCookie(response, token)

    const bootstrap = await getBootstrap(account.userId)
    response.status(201).json({
      ...bootstrap,
      ...authTokenPayload(request, token),
      status: withStatus(true),
    })
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      response.status(409).json({ error: 'This email is already registered.' })
      return
    }

    logRouteError('auth.register', error)
    rejectValidationError(response, 'Failed to register account.')
  }
})

app.post('/api/auth/login', authRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const payload = loginSchema.parse(request.body)
    const account = await authenticateAccount(payload.email, payload.password)

    if (!account) {
      response.status(401).json({ error: 'Email or password is incorrect.' })
      return
    }

    const token = await createAuthSession(account.userId, request.headers['user-agent'] ?? '')
    setSessionCookie(response, token)

    const bootstrap = await getBootstrap(account.userId)
    response.json({
      ...bootstrap,
      ...authTokenPayload(request, token),
      status: withStatus(true),
    })
  } catch (error) {
    logRouteError('auth.login', error)
    rejectValidationError(response, 'Failed to sign in.')
  }
})

app.post('/api/auth/forgot-password', authRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  if (!runtimeFlags.smtpEnabled) {
    response.status(503).json({ error: '비밀번호 재설정 이메일 발송이 아직 설정되지 않았습니다.' })
    return
  }

  try {
    const payload = forgotPasswordSchema.parse(request.body)
    const resetRequest = await requestPasswordReset(payload)

    if (resetRequest) {
      await sendPasswordResetEmail({
        toEmail: resetRequest.email,
        toName: resetRequest.name,
        token: resetRequest.token,
      })
    }

    response.json({
      ok: true,
      message: '해당 이메일이 존재하면 비밀번호 재설정 링크를 전송했습니다.',
    })
  } catch (error) {
    if (isMailNotConfiguredError(error)) {
      response.status(503).json({ error: '비밀번호 재설정 이메일 발송이 아직 설정되지 않았습니다.' })
      return
    }

    logRouteError('auth.forgot-password', error)
    rejectValidationError(response, '비밀번호 재설정 요청에 실패했습니다.')
  }
})

app.post('/api/auth/reset-password', authRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const payload = passwordResetConfirmSchema.parse(request.body)
    await resetPasswordWithToken(payload.token, payload.nextPassword)
    response.json({ ok: true })
  } catch (error) {
    if (isResetTokenInvalidError(error)) {
      response.status(400).json({ error: '비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다.' })
      return
    }

    logRouteError('auth.reset-password', error)
    rejectValidationError(response, 'Failed to reset password.')
  }
})

app.post('/api/auth/logout', async (request: Request, response: Response) => {
  try {
    await destroyRequestSession(request)
  } finally {
    clearSessionCookie(response)
  }

  response.json({ ok: true })
})

app.post(
  '/api/account/password',
  requireAuth,
  accountRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const payload = passwordChangeSchema.parse(request.body)
      await changeAccountPassword(
        request.authContext!.userId,
        payload.currentPassword,
        payload.nextPassword,
      )
      response.json({ ok: true })
    } catch (error) {
      if (isInvalidPasswordError(error)) {
        response.status(401).json({ error: 'Current password is incorrect.' })
        return
      }

      logRouteError('account.password', error)
      rejectValidationError(response, 'Failed to change password.')
    }
  },
)

app.delete('/api/account', requireAuth, accountRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const payload = accountDeleteSchema.parse(request.body)
    await deleteAccount(request.authContext!.userId, payload.password)
    await destroyRequestSession(request)
    clearSessionCookie(response)
    response.json({ ok: true })
  } catch (error) {
    if (isInvalidPasswordError(error)) {
      response.status(401).json({ error: 'Password is incorrect.' })
      return
    }

    logRouteError('account.delete', error)
    rejectValidationError(response, 'Failed to delete account.')
  }
})

app.post('/api/account/consent', requireAuth, accountRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    consentRefreshSchema.parse(request.body)
    await acceptCurrentConsent(request.authContext!.userId)

    const bootstrap = await getBootstrap(request.authContext!.userId)
    response.json({
      ...bootstrap,
      status: withStatus(true),
    })
  } catch (error) {
    logRouteError('account.consent', error)
    rejectValidationError(response, '동의 갱신에 실패했습니다.')
  }
})

app.get('/api/announcements/active', async (_request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const announcement = await getActiveAnnouncement()
    response.json({ announcement })
  } catch (error) {
    logRouteError('announcements.active', error)
    response.status(500).json({ error: '공지사항을 불러오지 못했습니다.' })
  }
})

app.get('/api/announcements', async (_request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const announcements = await getPublishedAnnouncements()
    response.json({ announcements })
  } catch (error) {
    logRouteError('announcements.list', error)
    response.status(500).json({ error: '공지사항 목록을 불러오지 못했습니다.' })
  }
})

app.put('/api/profile', requireAuth, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const profile = profileSchema.parse(request.body.profile)
    const settings = settingsSchema.parse(request.body.settings)
    await upsertProfileAndSettings(
      request.authContext!.userId,
      request.authContext!.email,
      profile,
      settings,
    )
    response.json({ ok: true })
  } catch (error) {
    logRouteError('profile.update', error)
    rejectValidationError(response, 'Invalid profile payload.')
  }
})

app.post('/api/sessions', requireAuth, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const payload = sessionSaveSchema.parse(request.body)
    const session = await saveSession(request.authContext!.userId, request.authContext!.email, payload)
    response.status(201).json({ session })
  } catch (error) {
    if (isSessionAccessDeniedError(error)) {
      response.status(403).json({ error: 'You cannot modify another user session.' })
      return
    }

    logRouteError('sessions.save', error)
    rejectValidationError(response, 'Failed to save session.')
  }
})

app.patch('/api/sessions/:sessionId/notes', requireAuth, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const notes = notesUpdateSchema.parse(request.body)
    const sessionId = Array.isArray(request.params.sessionId)
      ? request.params.sessionId[0]
      : request.params.sessionId
    const session = await updateSessionNotes(request.authContext!.userId, sessionId, notes)

    if (!session) {
      response.status(404).json({ error: 'Session was not found.' })
      return
    }

    response.json({ session })
  } catch (error) {
    logRouteError('sessions.notes', error)
    rejectValidationError(response, 'Failed to update notes.')
  }
})

app.get('/api/ai/feedback', requireAuth, aiRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const bootstrap = await getBootstrap(request.authContext!.userId)

    if (!bootstrap.settings) {
      response.status(404).json({ error: 'Feedback data is not available yet.' })
      return
    }

    response.json(await generateAiFeedback(request.authContext!.userId, bootstrap.sessions, bootstrap.settings))
  } catch (error) {
    logRouteError('ai.feedback', error)
    response.status(500).json({ error: 'Failed to generate AI feedback.' })
  }
})

app.get('/api/support/tickets', requireAuth, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const tickets = await listSupportTicketsForUser(request.authContext!.userId)
    response.json({ tickets })
  } catch (error) {
    logRouteError('support.list', error)
    response.status(500).json({ error: '문의 목록을 불러오지 못했습니다.' })
  }
})

app.post('/api/support/tickets', requireAuth, accountRateLimit, async (request: Request, response: Response) => {
  if (!requireMariaConfigured(response)) {
    return
  }

  try {
    const payload = supportTicketCreateSchema.parse(request.body)
    const ticket = await createSupportTicket(request.authContext!.userId, payload)
    response.status(201).json({ ticket })
  } catch (error) {
    logRouteError('support.create', error)
    rejectValidationError(response, '문의 접수에 실패했습니다.')
  }
})

app.get(
  '/api/admin/overview',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (_request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const [overview, dbSystem, mariaReachable] = await Promise.all([
        getAdminOverview(),
        getAdminSystemStatus(),
        pingMaria(),
      ])

      response.json({
        overview,
        system: {
          ...dbSystem,
          nodeEnv: env.NODE_ENV,
          mariaEnabled: runtimeFlags.mariaEnabled,
          mariaReachable,
          anthropicEnabled: runtimeFlags.anthropicEnabled,
          autoMigrateSchema: runtimeFlags.autoMigrateSchema,
          rateLimits: getRateLimitStats(),
        },
      })
    } catch (error) {
      logRouteError('admin.overview', error)
      response.status(500).json({ error: '관리자 개요 데이터를 불러오지 못했습니다.' })
    }
  },
)

app.get(
  '/api/admin/discord-bot',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (_request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const record = await getDiscordBotSettings()
      response.json(discordBotResponse(record, discordBotManager))
    } catch (error) {
      logRouteError('admin.discord-bot.get', error)
      response.status(500).json({ error: 'Discord 봇 설정을 불러오지 못했습니다.' })
    }
  },
)

app.put(
  '/api/admin/discord-bot/settings',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const payload = discordBotSettingsUpdateSchema.parse(request.body)
      const trimmedToken = payload.botToken?.trim()
      const tokenUpdate = payload.clearToken
        ? { ciphertext: null, preview: null }
        : trimmedToken
          ? {
              ciphertext: encryptDiscordBotToken(trimmedToken, discordBotSecretOptions()),
              preview: maskDiscordBotToken(trimmedToken),
            }
          : undefined

      const record = await saveDiscordBotSettings(request.authContext!.userId, payload, tokenUpdate)

      if (record.settings.enabled) {
        await startDiscordBotFromRecord(record, discordBotManager, focusaiDiscordBotId)
      }

      response.json(discordBotResponse(await getDiscordBotSettings(), discordBotManager))
    } catch (error) {
      if (isDiscordBotSecretError(error)) {
        rejectDiscordBotSecretError(response)
        return
      }

      logRouteError('admin.discord-bot.settings', error)
      rejectValidationError(response, 'Discord 봇 설정 저장에 실패했습니다.')
    }
  },
)

app.post(
  '/api/admin/discord-bot/start',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const record = await setDiscordBotEnabled(request.authContext!.userId, true)
      await startDiscordBotFromRecord(record, discordBotManager, focusaiDiscordBotId)
      response.json(discordBotResponse(await getDiscordBotSettings(), discordBotManager))
    } catch (error) {
      await persistDiscordBotManagerStatus(discordBotManager, focusaiDiscordBotId).catch((statusError: unknown) =>
        logRouteError('admin.discord-bot.status', statusError),
      )
      if (isDiscordBotSecretError(error)) {
        rejectDiscordBotSecretError(response)
        return
      }
      logRouteError('admin.discord-bot.start', error)
      response.status(400).json({
        error: error instanceof Error ? error.message : 'Discord 봇 시작에 실패했습니다.',
      })
    }
  },
)

app.post(
  '/api/admin/discord-bot/stop',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      await setDiscordBotEnabled(request.authContext!.userId, false)
      await discordBotManager.stop()
      await persistDiscordBotManagerStatus(discordBotManager, focusaiDiscordBotId)
      response.json(discordBotResponse(await getDiscordBotSettings(), discordBotManager))
    } catch (error) {
      logRouteError('admin.discord-bot.stop', error)
      response.status(500).json({ error: 'Discord 봇 중지에 실패했습니다.' })
    }
  },
)

app.get(
  '/api/admin/discord-bot/lostark',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (_request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const record = await getDiscordBotSettings(lostarkDiscordBotId)
      response.json(discordBotResponse(record, lostarkDiscordBotManager))
    } catch (error) {
      logRouteError('admin.discord-bot.lostark.get', error)
      response.status(500).json({ error: 'Lost Ark Discord 봇 설정을 불러오지 못했습니다.' })
    }
  },
)

app.put(
  '/api/admin/discord-bot/lostark/settings',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const payload = discordBotSettingsUpdateSchema.parse(request.body)
      const trimmedToken = payload.botToken?.trim()
      const tokenUpdate = payload.clearToken
        ? { ciphertext: null, preview: null }
        : trimmedToken
          ? {
              ciphertext: encryptDiscordBotToken(trimmedToken, discordBotSecretOptions()),
              preview: maskDiscordBotToken(trimmedToken),
            }
          : undefined
      const record = await saveDiscordBotSettings(
        request.authContext!.userId,
        payload,
        tokenUpdate,
        lostarkDiscordBotId,
      )

      if (record.settings.enabled) {
        await startDiscordBotFromRecord(record, lostarkDiscordBotManager, lostarkDiscordBotId)
      }

      response.json(
        discordBotResponse(await getDiscordBotSettings(lostarkDiscordBotId), lostarkDiscordBotManager),
      )
    } catch (error) {
      if (isDiscordBotSecretError(error)) {
        rejectDiscordBotSecretError(response)
        return
      }

      logRouteError('admin.discord-bot.lostark.settings', error)
      rejectValidationError(response, 'Lost Ark Discord 봇 설정 저장에 실패했습니다.')
    }
  },
)

app.post(
  '/api/admin/discord-bot/lostark/start',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const record = await setDiscordBotEnabled(request.authContext!.userId, true, lostarkDiscordBotId)
      await startDiscordBotFromRecord(record, lostarkDiscordBotManager, lostarkDiscordBotId)
      response.json(
        discordBotResponse(await getDiscordBotSettings(lostarkDiscordBotId), lostarkDiscordBotManager),
      )
    } catch (error) {
      await persistDiscordBotManagerStatus(lostarkDiscordBotManager, lostarkDiscordBotId).catch(
        (statusError: unknown) => logRouteError('admin.discord-bot.lostark.status', statusError),
      )
      if (isDiscordBotSecretError(error)) {
        rejectDiscordBotSecretError(response)
        return
      }
      logRouteError('admin.discord-bot.lostark.start', error)
      response.status(400).json({
        error: error instanceof Error ? error.message : 'Lost Ark Discord 봇 시작에 실패했습니다.',
      })
    }
  },
)

app.post(
  '/api/admin/discord-bot/lostark/stop',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      await setDiscordBotEnabled(request.authContext!.userId, false, lostarkDiscordBotId)
      await lostarkDiscordBotManager.stop()
      await persistDiscordBotManagerStatus(lostarkDiscordBotManager, lostarkDiscordBotId)
      response.json(
        discordBotResponse(await getDiscordBotSettings(lostarkDiscordBotId), lostarkDiscordBotManager),
      )
    } catch (error) {
      logRouteError('admin.discord-bot.lostark.stop', error)
      response.status(500).json({ error: 'Lost Ark Discord 봇 중지에 실패했습니다.' })
    }
  },
)

app.patch(
  '/api/admin/users/:userId/role',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const payload = adminRoleUpdateSchema.parse(request.body)
      const targetUserId = Number(Array.isArray(request.params.userId) ? request.params.userId[0] : request.params.userId)

      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        rejectValidationError(response, '유효하지 않은 사용자 ID입니다.')
        return
      }

      await updateAdminUserRole(request.authContext!.userId, targetUserId, payload.isAdmin)
      response.json({ ok: true })
    } catch (error) {
      const routeError = getAdminRoleUpdateErrorResponse(error)
      if (routeError) {
        response.status(routeError.status).json({ error: routeError.error })
        return
      }

      logRouteError('admin.user-role', error)
      response.status(500).json({ error: '관리자 권한 변경에 실패했습니다.' })
    }
  },
)

app.post(
  '/api/admin/announcements',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const payload = announcementUpsertSchema.parse(request.body)

      if (!toValidAnnouncementWindow(payload.startsAt, payload.endsAt)) {
        rejectValidationError(response, '공지 종료 시각은 시작 시각보다 이후여야 합니다.')
        return
      }

      const announcement = await createAnnouncement(request.authContext!.userId, payload)
      response.status(201).json({ announcement })
    } catch (error) {
      logRouteError('admin.announcements.create', error)
      rejectValidationError(response, '공지사항 등록에 실패했습니다.')
    }
  },
)

app.patch(
  '/api/admin/announcements/:announcementId',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const payload = announcementUpsertSchema.parse(request.body)
      const announcementId = Number(
        Array.isArray(request.params.announcementId)
          ? request.params.announcementId[0]
          : request.params.announcementId,
      )

      if (!Number.isInteger(announcementId) || announcementId <= 0) {
        rejectValidationError(response, '유효하지 않은 공지사항 ID입니다.')
        return
      }

      if (!toValidAnnouncementWindow(payload.startsAt, payload.endsAt)) {
        rejectValidationError(response, '공지 종료 시각은 시작 시각보다 이후여야 합니다.')
        return
      }

      const announcement = await updateAnnouncement(request.authContext!.userId, announcementId, payload)
      response.json({ announcement })
    } catch (error) {
      const routeError = getAnnouncementMutationErrorResponse(error)
      if (routeError) {
        response.status(routeError.status).json({ error: routeError.error })
        return
      }

      logRouteError('admin.announcements.update', error)
      rejectValidationError(response, '공지사항 수정에 실패했습니다.')
    }
  },
)

app.delete(
  '/api/admin/announcements/:announcementId',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const announcementId = Number(
        Array.isArray(request.params.announcementId)
          ? request.params.announcementId[0]
          : request.params.announcementId,
      )

      if (!Number.isInteger(announcementId) || announcementId <= 0) {
        rejectValidationError(response, '유효하지 않은 공지사항 ID입니다.')
        return
      }

      await deleteAnnouncement(request.authContext!.userId, announcementId)
      response.json({ ok: true })
    } catch (error) {
      const routeError = getAnnouncementMutationErrorResponse(error)
      if (routeError) {
        response.status(routeError.status).json({ error: routeError.error })
        return
      }

      logRouteError('admin.announcements.delete', error)
      rejectValidationError(response, '공지사항 삭제에 실패했습니다.')
    }
  },
)

app.patch(
  '/api/admin/support/tickets/:ticketId',
  requireAuth,
  requireAdmin,
  adminRateLimit,
  async (request: Request, response: Response) => {
    if (!requireMariaConfigured(response)) {
      return
    }

    try {
      const payload = supportTicketAdminUpdateSchema.parse(request.body)
      const ticketId = Number(Array.isArray(request.params.ticketId) ? request.params.ticketId[0] : request.params.ticketId)

      if (!Number.isInteger(ticketId) || ticketId <= 0) {
        rejectValidationError(response, '유효하지 않은 문의 ID입니다.')
        return
      }

      const ticket = await updateSupportTicket(request.authContext!.userId, ticketId, payload)
      response.json({ ticket })
    } catch (error) {
      const routeError = getSupportTicketAdminUpdateErrorResponse(error)
      if (routeError) {
        response.status(routeError.status).json({ error: routeError.error })
        return
      }

      logRouteError('admin.support.update', error)
      rejectValidationError(response, '문의 처리 저장에 실패했습니다.')
    }
  },
)

app.use('/api', (_request: Request, response: Response) => {
  response.status(404).json({ error: 'API endpoint not found.' })
})

if (existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir))

  app.get('/', (_request: Request, response: Response) => {
    response.sendFile(path.join(frontendDistDir, 'index.html'))
  })

  app.get('/{*path}', (request: Request, response: Response, next) => {
    if (request.path.startsWith('/api/')) {
      next()
      return
    }

    response.sendFile(path.join(frontendDistDir, 'index.html'))
  })
}

app.use(handleUnexpectedError)

async function boot() {
  assertProductionSecurity()

  if (runtimeFlags.mariaEnabled && runtimeFlags.autoMigrateSchema) {
    await ensureSchema()
  }

  await startDiscordBotIfEnabled()

  app.listen(env.PORT, () => {
    console.log(
      JSON.stringify(
        {
          service: 'focusai-api',
          port: env.PORT,
          mariaEnabled: runtimeFlags.mariaEnabled,
          autoMigrateSchema: runtimeFlags.autoMigrateSchema,
          sessionCookieName: env.SESSION_COOKIE_NAME,
        },
        null,
        2,
      ),
    )
  })
}

boot().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
