import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPasswordResetEmailContent, buildPasswordResetUrl } from './mailer.js'

test('buildPasswordResetUrl puts reset token in the URL fragment', () => {
  const resetUrl = buildPasswordResetUrl('token value')
  const parsed = new URL(resetUrl)

  assert.equal(parsed.searchParams.has('reset_token'), false)
  assert.equal(new URLSearchParams(parsed.hash.slice(1)).get('reset_token'), 'token value')
})

test('buildPasswordResetEmailContent escapes user-controlled HTML fields', () => {
  const content = buildPasswordResetEmailContent({
    toName: '<img src=x onerror=alert(1)>',
    resetUrl: 'https://focusai.example/#reset_token=abc',
  })

  assert.doesNotMatch(content.html, /<img/i)
  assert.match(content.html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(content.text, /<img src=x onerror=alert\(1\)>/)
})
