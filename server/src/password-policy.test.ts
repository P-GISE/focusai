import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePasswordStrength } from './password-policy.js'
import {
  passwordChangeSchema,
  passwordResetConfirmSchema,
  registerSchema,
} from './contracts.js'

test('validatePasswordStrength accepts a long mixed password', () => {
  assert.equal(validatePasswordStrength('FocusAI-study-2026').valid, true)
})

test('validatePasswordStrength rejects short, one-class, repeated, and common passwords', () => {
  for (const password of ['short7A', 'aaaaaaaaaaaa', 'password1234', 'focusaifocusai']) {
    assert.equal(validatePasswordStrength(password).valid, false)
  }
})

test('auth schemas apply the password policy', () => {
  assert.equal(registerSchema.safeParse({
    name: 'Tester',
    email: 'tester@example.com',
    password: 'password1234',
    dailyGoalHours: 2,
    subjects: ['Math'],
    privacyPolicyAccepted: true,
    cameraPolicyAccepted: true,
  }).success, false)

  assert.equal(passwordResetConfirmSchema.safeParse({
    token: 'x'.repeat(24),
    nextPassword: 'FocusAI-study-2026',
  }).success, true)

  assert.equal(passwordChangeSchema.safeParse({
    currentPassword: 'current-password',
    nextPassword: 'aaaaaaaaaaaa',
  }).success, false)
})
