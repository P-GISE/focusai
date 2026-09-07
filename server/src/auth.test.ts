import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request } from 'express'
import { readSessionToken } from './auth.js'

test('readSessionToken accepts bearer auth for packaged Android clients', () => {
  assert.equal(
    readSessionToken({
      headers: {
        authorization: 'Bearer android-session-token',
        cookie: 'focusai_session=cookie-session-token',
      },
    } as Request),
    'android-session-token',
  )
})

test('readSessionToken falls back to the session cookie for same-origin web clients', () => {
  assert.equal(
    readSessionToken({
      headers: {
        cookie: 'other=value; focusai_session=cookie-session-token',
      },
    } as Request),
    'cookie-session-token',
  )
})

test('readSessionToken ignores malformed cookie fragments instead of throwing', () => {
  assert.equal(
    readSessionToken({
      headers: {
        cookie: 'broken=%E0%A4%A; focusai_session=cookie-session-token',
      },
    } as Request),
    'cookie-session-token',
  )
})
