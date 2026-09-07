import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertProductionRuntimeEnv,
  assertProductionUrl,
  appendCapacitorClientOrigin,
  parseBooleanFlag,
  parseOriginList,
} from './env.js'

test('parseBooleanFlag accepts only explicit boolean strings', () => {
  assert.equal(parseBooleanFlag(undefined, 'SMTP_SECURE'), false)
  assert.equal(parseBooleanFlag('', 'SMTP_SECURE'), false)
  assert.equal(parseBooleanFlag('true', 'SMTP_SECURE'), true)
  assert.equal(parseBooleanFlag('TRUE', 'SMTP_SECURE'), true)
  assert.equal(parseBooleanFlag('false', 'SMTP_SECURE'), false)
  assert.equal(parseBooleanFlag('False', 'SMTP_SECURE'), false)
  assert.throws(() => parseBooleanFlag('yes', 'SMTP_SECURE'), /SMTP_SECURE/)
  assert.throws(() => parseBooleanFlag('1', 'AUTO_MIGRATE_SCHEMA'), /AUTO_MIGRATE_SCHEMA/)
})

test('parseOriginList normalizes comma-separated URL origins', () => {
  assert.deepEqual(
    parseOriginList('https://focusai.ibetter.kr, http://127.0.0.1:5173/'),
    ['https://focusai.ibetter.kr', 'http://127.0.0.1:5173'],
  )
})

test('appendCapacitorClientOrigin allows packaged Android local assets without widening cookies', () => {
  assert.deepEqual(
    appendCapacitorClientOrigin(['https://focusai.ibetter.kr', 'https://localhost']),
    ['https://focusai.ibetter.kr', 'https://localhost'],
  )
  assert.deepEqual(
    appendCapacitorClientOrigin(['https://focusai.ibetter.kr']),
    ['https://focusai.ibetter.kr', 'https://localhost'],
  )
})

test('parseOriginList rejects empty, wildcard, and malformed origins', () => {
  assert.throws(() => parseOriginList(''), /CLIENT_ORIGIN/)
  assert.throws(() => parseOriginList('*'), /CLIENT_ORIGIN/)
  assert.throws(() => parseOriginList('not a url'), /CLIENT_ORIGIN/)
})

test('assertProductionUrl requires HTTPS in production', () => {
  assert.doesNotThrow(() => assertProductionUrl('APP_BASE_URL', 'http://127.0.0.1:8787', 'development'))
  assert.doesNotThrow(() => assertProductionUrl('APP_BASE_URL', 'https://focusai.ibetter.kr', 'production'))
  assert.throws(
    () => assertProductionUrl('APP_BASE_URL', 'http://focusai.ibetter.kr', 'production'),
    /APP_BASE_URL/,
  )
})

test('assertProductionRuntimeEnv rejects enabled Anthropic budget with zero model prices', () => {
  assert.throws(
    () =>
      assertProductionRuntimeEnv({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://focusai.example',
        APP_BASE_URL: 'https://focusai.example',
        ANTHROPIC_API_KEY: 'anthropic-test-key',
        ANTHROPIC_DAILY_BUDGET_USD: 10,
        ANTHROPIC_INPUT_USD_PER_MILLION: 0,
        ANTHROPIC_OUTPUT_USD_PER_MILLION: 3,
        ANTHROPIC_CACHE_WRITE_USD_PER_MILLION: 0,
        ANTHROPIC_CACHE_READ_USD_PER_MILLION: 0,
      }),
    /ANTHROPIC_INPUT_USD_PER_MILLION/,
  )
})

test('assertProductionRuntimeEnv rejects incomplete production SMTP settings', () => {
  assert.throws(
    () =>
      assertProductionRuntimeEnv({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://focusai.example',
        APP_BASE_URL: 'https://focusai.example',
        SMTP_HOST: 'smtp.example.com',
        SMTP_FROM: '',
      }),
    /SMTP_FROM/,
  )

  assert.throws(
    () =>
      assertProductionRuntimeEnv({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://focusai.example',
        APP_BASE_URL: 'https://focusai.example',
        SMTP_HOST: 'smtp.example.com',
        SMTP_FROM: 'FocusAI <noreply@example.com>',
        SMTP_USER: 'noreply@example.com',
      }),
    /SMTP_PASSWORD/,
  )
})
