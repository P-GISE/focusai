import type { NextFunction, Request, Response } from 'express'

type StateChangingRequestGuardOptions = {
  allowedOrigins: string[]
  sessionCookieName: string
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function headerOrigin(value: string | string[] | undefined) {
  const headerValue = firstHeaderValue(value)?.trim()

  if (!headerValue) {
    return null
  }

  try {
    return new URL(headerValue).origin
  } catch {
    return ''
  }
}

function hasBearerAuthorization(request: Request) {
  const authorization = firstHeaderValue(request.headers.authorization)
  return /^Bearer\s+\S+/i.test(authorization ?? '')
}

function hasCookieNamed(request: Request, cookieName: string) {
  const cookie = firstHeaderValue(request.headers.cookie)

  if (!cookie) {
    return false
  }

  return cookie
    .split(';')
    .map((entry) => entry.trim())
    .some((entry) => entry === cookieName || entry.startsWith(`${cookieName}=`))
}

function isApiPath(request: Request) {
  const requestPath = request.path || request.url || ''
  return requestPath === '/api' || requestPath.startsWith('/api/')
}

export function isStateChangingRequestAllowed(
  request: Request,
  options: StateChangingRequestGuardOptions,
) {
  if (safeMethods.has(request.method.toUpperCase()) || !isApiPath(request)) {
    return true
  }

  if (hasBearerAuthorization(request)) {
    return true
  }

  const allowedOrigins = new Set(options.allowedOrigins.map((origin) => new URL(origin).origin))
  const requestOrigin = headerOrigin(request.headers.origin)

  if (requestOrigin !== null) {
    return Boolean(requestOrigin) && allowedOrigins.has(requestOrigin)
  }

  const refererOrigin = headerOrigin(request.headers.referer)

  if (refererOrigin !== null) {
    return Boolean(refererOrigin) && allowedOrigins.has(refererOrigin)
  }

  return !hasCookieNamed(request, options.sessionCookieName)
}

export function createStateChangingRequestGuard(
  allowedOrigins: string[],
  sessionCookieName: string,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (
      isStateChangingRequestAllowed(request, {
        allowedOrigins,
        sessionCookieName,
      })
    ) {
      next()
      return
    }

    response.status(403).json({ error: 'Blocked cross-site request.' })
  }
}
