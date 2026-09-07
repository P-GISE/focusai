import type { NextFunction, Request, Response } from 'express'
import { env } from './env.js'
import { destroyAuthSession, resolveAuthSession, type AuthenticatedUser } from './store.js'

export type AuthContext = AuthenticatedUser

declare module 'express-serve-static-core' {
  interface Request {
    authContext?: AuthContext
  }
}

function parseCookies(headerValue: string | undefined) {
  if (!headerValue) {
    return new Map<string, string>()
  }

  const decodeCookieComponent = (value: string) => {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return new Map(
    headerValue
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=')

        if (separatorIndex === -1) {
          return [entry, ''] as const
        }

        return [
          decodeCookieComponent(entry.slice(0, separatorIndex)),
          decodeCookieComponent(entry.slice(separatorIndex + 1)),
        ] as const
      }),
  )
}

function readBearerSessionToken(headerValue: string | string[] | undefined) {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue

  if (!value) {
    return ''
  }

  const match = value.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

export function readSessionToken(request: Request) {
  const bearerToken = readBearerSessionToken(request.headers.authorization)

  if (bearerToken) {
    return bearerToken
  }

  return parseCookies(request.headers.cookie).get(env.SESSION_COOKIE_NAME) ?? ''
}

function sessionCookieOptions(includeMaxAge: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    ...(includeMaxAge ? { maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000 } : {}),
  }
}

export function setSessionCookie(response: Response, token: string) {
  response.cookie(env.SESSION_COOKIE_NAME, token, sessionCookieOptions(true))
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(env.SESSION_COOKIE_NAME, sessionCookieOptions(false))
}

export async function resolveRequestAuth(request: Request) {
  if (request.authContext) {
    return request.authContext
  }

  const token = readSessionToken(request)

  if (!token) {
    return null
  }

  const authContext = await resolveAuthSession(token)

  if (authContext) {
    request.authContext = authContext
  }

  return authContext
}

export async function destroyRequestSession(request: Request) {
  const token = readSessionToken(request)

  if (!token) {
    return
  }

  await destroyAuthSession(token)
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    const authContext = await resolveRequestAuth(request)

    if (!authContext) {
      response.status(401).json({ error: '로그인이 필요합니다.' })
      return
    }

    next()
  } catch {
    response.status(401).json({ error: '로그인이 필요합니다.' })
  }
}

export async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  try {
    const authContext = await resolveRequestAuth(request)

    if (!authContext) {
      response.status(401).json({ error: '로그인이 필요합니다.' })
      return
    }

    if (!authContext.isAdmin) {
      response.status(403).json({ error: '관리자 권한이 필요합니다.' })
      return
    }

    next()
  } catch {
    response.status(403).json({ error: '관리자 권한이 필요합니다.' })
  }
}
