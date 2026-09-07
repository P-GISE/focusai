import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSecurityHeaders } from './security-headers.js'

test('buildSecurityHeaders includes baseline browser protections', () => {
  const headers = buildSecurityHeaders('production')

  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(headers['Referrer-Policy'], 'same-origin')
  assert.equal(headers['X-Frame-Options'], 'DENY')
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin')
  assert.equal(headers['Cross-Origin-Resource-Policy'], 'same-origin')
  assert.match(headers['Permissions-Policy'], /camera=\(self\)/)
  assert.match(headers['Permissions-Policy'], /microphone=\(\)/)
  assert.match(headers['Strict-Transport-Security'] ?? '', /max-age=31536000/)
  assert.match(headers['Content-Security-Policy'], /default-src 'self'/)
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.match(headers['Content-Security-Policy'], /style-src 'self' 'unsafe-inline'/)
  assert.match(headers['Content-Security-Policy'], /font-src 'self' data:/)
  assert.doesNotMatch(headers['Content-Security-Policy'], /fonts\.googleapis\.com/)
  assert.doesNotMatch(headers['Content-Security-Policy'], /fonts\.gstatic\.com/)
})

test('buildSecurityHeaders omits HSTS outside production', () => {
  const headers = buildSecurityHeaders('development')

  assert.equal(headers['Strict-Transport-Security'], undefined)
})

test('server disables framework fingerprinting and handles unknown API paths explicitly', () => {
  const serverSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

  assert.match(serverSource, /app\.disable\('x-powered-by'\)/)
  assert.match(serverSource, /createStateChangingRequestGuard\(clientOrigins,\s*env\.SESSION_COOKIE_NAME\)/)
  assert.match(serverSource, /app\.use\('\/api'/)
  assert.match(serverSource, /status\(404\)\.json\(\{ error: 'API endpoint not found\.' \}\)/)
  assert.match(serverSource, /function handleUnexpectedError/)
})
