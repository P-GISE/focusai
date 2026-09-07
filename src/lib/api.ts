import type {
  Announcement,
  AdminOverview,
  AdminSystemStatus,
  AiFeedbackResult,
  ApiBootstrap,
  ApiHealth,
  AppSettings,
  DiscordBotSettings,
  DiscordBotSettingsUpdate,
  DiscordBotStatus,
  SessionEvent,
  SessionNotes,
  StoredSession,
  SupportTicket,
  UserProfile,
} from './contracts'

type ClientEnv = ImportMetaEnv & {
  VITE_API_BASE_URL?: string
}

type RegisterPayload = {
  name: string
  email: string
  password: string
  dailyGoalHours: number
  subjects: string[]
  privacyPolicyAccepted: true
  cameraPolicyAccepted: true
}

const env = import.meta.env as ClientEnv
const API_BASE = env.VITE_API_BASE_URL ?? '/api'
const AUTH_TOKEN_STORAGE_KEY = 'focusai:api-session-token'

function readStoredAuthToken() {
  if (!shouldUseStoredAuthToken()) {
    return ''
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''
}

function storeAuthToken(token: string | undefined) {
  if (!shouldUseStoredAuthToken() || !token) {
    return
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
}

function clearStoredAuthToken() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

function shouldUseStoredAuthToken() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return new URL(API_BASE, window.location.origin).origin !== window.location.origin
  } catch {
    return false
  }
}

function applyAuthHeader(headers: Headers) {
  const token = readStoredAuthToken()

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
}

async function readErrorMessage(response: Response) {
  const text = await response.text()

  if (!text) {
    return `Request failed: ${response.status}`
  }

  try {
    const parsed = JSON.parse(text) as { error?: string }

    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error
    }
  } catch {
    // Ignore JSON parse errors and fall back to the raw response text.
  }

  return text
}

async function requestJson<T>(path: string, init: RequestInit) {
  const headers = new Headers(init.headers)

  if (!headers.has('Content-Type') && init.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json')
  }

  applyAuthHeader(headers)

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return (await response.json()) as T
}

export async function getApiHealth(): Promise<ApiHealth> {
  try {
    const headers = new Headers()
    applyAuthHeader(headers)

    const response = await fetch(`${API_BASE}/health`, {
      headers,
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(String(response.status))
    }

    const data = (await response.json()) as Omit<ApiHealth, 'apiReachable'>
    return {
      apiReachable: true,
      mariaEnabled: data.mariaEnabled,
      mariaReachable: data.mariaReachable,
      anthropicEnabled: data.anthropicEnabled,
    }
  } catch {
    return {
      apiReachable: false,
      mariaEnabled: false,
      mariaReachable: false,
      anthropicEnabled: false,
    }
  }
}

export async function fetchBootstrapFromApi() {
  return requestJson<ApiBootstrap>('/bootstrap', { method: 'GET' })
}

export async function registerWithApi(payload: RegisterPayload) {
  const bootstrap = await requestJson<ApiBootstrap>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  storeAuthToken(bootstrap.authToken)
  return bootstrap
}

export async function loginWithApi(email: string, password: string) {
  const bootstrap = await requestJson<ApiBootstrap>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  storeAuthToken(bootstrap.authToken)
  return bootstrap
}

export async function requestPasswordResetInApi(email: string) {
  return requestJson<{ ok: true; message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPasswordWithTokenInApi(token: string, nextPassword: string) {
  return requestJson<{ ok: true }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, nextPassword }),
  })
}

export async function logoutFromApi() {
  try {
    return await requestJson<{ ok: true }>('/auth/logout', {
      method: 'POST',
    })
  } finally {
    clearStoredAuthToken()
  }
}

export async function changePasswordInApi(currentPassword: string, nextPassword: string) {
  return requestJson<{ ok: true }>('/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, nextPassword }),
  })
}

export async function deleteAccountInApi(password: string) {
  return requestJson<{ ok: true }>('/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}

export async function acceptCurrentConsentInApi() {
  return requestJson<ApiBootstrap>('/account/consent', {
    method: 'POST',
    body: JSON.stringify({
      privacyPolicyAccepted: true,
      cameraPolicyAccepted: true,
    }),
  })
}

export async function syncProfileToApi(
  profile: UserProfile,
  settings: AppSettings,
) {
  return requestJson<{ ok: true }>('/profile', {
    method: 'PUT',
    body: JSON.stringify({ profile, settings }),
  })
}

export async function saveSessionToApi(
  payload: {
    profile: UserProfile
    settings: AppSettings
    session: StoredSession
    events: SessionEvent[]
  },
) {
  return requestJson<{ session: StoredSession }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateSessionNotesInApi(
  sessionId: string,
  notes: SessionNotes,
) {
  return requestJson<{ session: StoredSession | null }>(`/sessions/${sessionId}/notes`, {
    method: 'PATCH',
    body: JSON.stringify(notes),
  })
}

export async function fetchAiFeedbackFromApi() {
  return requestJson<AiFeedbackResult>('/ai/feedback', {
    method: 'GET',
  })
}

export async function fetchActiveAnnouncementFromApi() {
  return requestJson<{ announcement: Announcement | null }>('/announcements/active', {
    method: 'GET',
  })
}

export async function fetchAnnouncementsFromApi() {
  return requestJson<{ announcements: Announcement[] }>('/announcements', {
    method: 'GET',
  })
}

export async function fetchAdminOverviewFromApi() {
  return requestJson<{ overview: AdminOverview; system: AdminSystemStatus }>('/admin/overview', {
    method: 'GET',
  })
}

export async function fetchDiscordBotAdminStateFromApi() {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>('/admin/discord-bot', {
    method: 'GET',
  })
}

export async function updateDiscordBotSettingsInApi(payload: DiscordBotSettingsUpdate) {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>('/admin/discord-bot/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function startDiscordBotInApi() {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>('/admin/discord-bot/start', {
    method: 'POST',
  })
}

export async function stopDiscordBotInApi() {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>('/admin/discord-bot/stop', {
    method: 'POST',
  })
}

export async function fetchLostarkDiscordBotAdminStateFromApi() {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>('/admin/discord-bot/lostark', {
    method: 'GET',
  })
}

export async function updateLostarkDiscordBotSettingsInApi(payload: DiscordBotSettingsUpdate) {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>(
    '/admin/discord-bot/lostark/settings',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

export async function startLostarkDiscordBotInApi() {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>(
    '/admin/discord-bot/lostark/start',
    {
      method: 'POST',
    },
  )
}

export async function stopLostarkDiscordBotInApi() {
  return requestJson<{ settings: DiscordBotSettings; status: DiscordBotStatus }>(
    '/admin/discord-bot/lostark/stop',
    {
      method: 'POST',
    },
  )
}

export async function updateAdminUserRoleInApi(userId: string, isAdmin: boolean) {
  return requestJson<{ ok: true }>(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ isAdmin }),
  })
}

export async function createAdminAnnouncementInApi(payload: {
  title: string
  body: string
  tone: Announcement['tone']
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
}) {
  return requestJson<{ announcement: Announcement }>('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateAdminAnnouncementInApi(
  announcementId: string,
  payload: {
    title: string
    body: string
    tone: Announcement['tone']
    isActive: boolean
    startsAt: string | null
    endsAt: string | null
  },
) {
  return requestJson<{ announcement: Announcement }>(`/admin/announcements/${announcementId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteAdminAnnouncementInApi(announcementId: string) {
  return requestJson<{ ok: true }>(`/admin/announcements/${announcementId}`, {
    method: 'DELETE',
  })
}

export async function fetchSupportTicketsFromApi() {
  return requestJson<{ tickets: SupportTicket[] }>('/support/tickets', {
    method: 'GET',
  })
}

export async function createSupportTicketInApi(payload: {
  category: SupportTicket['category']
  subject: string
  body: string
}) {
  return requestJson<{ ticket: SupportTicket }>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateAdminSupportTicketInApi(
  ticketId: string,
  payload: {
    status: SupportTicket['status']
    adminReply: string
  },
) {
  return requestJson<{ ticket: SupportTicket }>(`/admin/support/tickets/${ticketId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
