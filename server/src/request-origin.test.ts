import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request } from 'express'
import { isStateChangingRequestAllowed } from './request-origin.js'

const guardOptions = {
  allowedOrigins: ['https://focusai.example', 'https://localhost'],
  sessionCookieName: 'focusai_session',
}

function request(input: {
  method?: string
  path?: string
  origin?: string
  referer?: string
  cookie?: string
  authorization?: string
}) {
  return {
    method: input.method ?? 'POST',
    path: input.path ?? '/api/auth/logout',
    headers: {
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.referer ? { referer: input.referer } : {}),
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(input.authorization ? { authorization: input.authorization } : {}),
    },
  } as Request
}

test('state-changing API guard allows safe methods and non-API paths', () => {
  assert.equal(
    isStateChangingRequestAllowed(
      request({ method: 'GET', origin: 'https://evil.example', cookie: 'focusai_session=abc' }),
      guardOptions,
    ),
    true,
  )
  assert.equal(
    isStateChangingRequestAllowed(
      request({ path: '/assets/app.js', origin: 'https://evil.example', cookie: 'focusai_session=abc' }),
      guardOptions,
    ),
    true,
  )
})

test('state-changing API guard rejects disallowed browser origins', () => {
  assert.equal(
    isStateChangingRequestAllowed(
      request({ origin: 'https://evil.example', cookie: 'focusai_session=abc' }),
      guardOptions,
    ),
    false,
  )
  assert.equal(
    isStateChangingRequestAllowed(request({ origin: 'null', cookie: 'focusai_session=abc' }), guardOptions),
    false,
  )
})

test('state-changing API guard allows configured origins and referer fallback', () => {
  assert.equal(
    isStateChangingRequestAllowed(
      request({ origin: 'https://focusai.example/app', cookie: 'focusai_session=abc' }),
      guardOptions,
    ),
    true,
  )
  assert.equal(
    isStateChangingRequestAllowed(
      request({ referer: 'https://focusai.example/settings', cookie: 'focusai_session=abc' }),
      guardOptions,
    ),
    true,
  )
})

test('state-changing API guard rejects originless cookie-auth mutations', () => {
  assert.equal(
    isStateChangingRequestAllowed(request({ cookie: 'focusai_session=abc' }), guardOptions),
    false,
  )
})

test('state-changing API guard keeps bearer-token clients usable without browser origin', () => {
  assert.equal(
    isStateChangingRequestAllowed(request({ authorization: 'Bearer android-session-token' }), guardOptions),
    true,
  )
})
