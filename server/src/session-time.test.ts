import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSessionCreatedAt } from './session-time.js'

test('resolveSessionCreatedAt accepts a recent client timestamp', () => {
  const now = new Date('2026-05-13T12:00:00.000Z')
  const clientTime = '2026-05-13T11:30:00.000Z'

  assert.equal(resolveSessionCreatedAt(clientTime, now).toISOString(), clientTime)
})

test('resolveSessionCreatedAt falls back to server time for future or stale timestamps', () => {
  const now = new Date('2026-05-13T12:00:00.000Z')

  assert.equal(resolveSessionCreatedAt('2026-05-13T12:10:01.000Z', now).toISOString(), now.toISOString())
  assert.equal(resolveSessionCreatedAt('2026-04-01T12:00:00.000Z', now).toISOString(), now.toISOString())
  assert.equal(resolveSessionCreatedAt('not-a-date', now).toISOString(), now.toISOString())
})
