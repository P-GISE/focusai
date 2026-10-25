import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import type { RegisterPayload } from './contracts.js'

const require = createRequire(import.meta.url)
const email = 'reserved-admin@example.invalid'
const registration: RegisterPayload = {
  name: 'Synthetic member', email, password: 'synthetic-test-password',
  dailyGoalHours: 4, subjects: [], privacyPolicyAccepted: true, cameraPolicyAccepted: true,
}

function loadStore(persistedAdmin: number) {
  const calls: { sql: string, parameters: unknown[] }[] = []
  let passwordHash = ''
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {},
    query: async (sql: string, parameters: unknown[] = []) => {
      calls.push({ sql, parameters })
      if (/INSERT INTO users/.test(sql)) {
        passwordHash = String(parameters[1])
        return { insertId: 7 }
      }
      if (/password_hash, is_admin/.test(sql) || /INNER JOIN users u/.test(sql)) {
        return [{ id: 7, email, display_name: 'Synthetic member', password_hash: passwordHash, is_admin: persistedAdmin }]
      }
      return []
    },
  }
  const compiled = ts.transpileModule(readFileSync(new URL('./store.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText
  const module = { exports: {} }
  new vm.Script(compiled).runInNewContext({
    module, exports: module.exports, Buffer, Date, console,
    require: (name: string) => {
      if (name === './env.js') return { adminEmailAllowlist: new Set([email]), env: {} }
      if (name === './mariadb.js') return { withConnection: (callback: (value: typeof connection) => unknown) => callback(connection) }
      if (name === './session-time.js') return {}
      return require(name)
    },
  })
  return { store: module.exports as typeof import('./store.js'), calls }
}

test('public registration cannot claim administrator privilege using an allowlisted email', async () => {
  const { store, calls } = loadStore(0)
  const user = await store.registerAccount(registration)
  assert.equal(user.isAdmin, false)
  assert.equal(calls.find((call) => /INSERT INTO users/.test(call.sql))?.parameters[4], 0)
})

test('login and existing sessions do not elevate an unprivileged allowlisted email', async () => {
  const { store, calls } = loadStore(0)
  await store.registerAccount(registration)
  assert.equal((await store.authenticateAccount(email, registration.password))?.isAdmin, false)
  assert.equal((await store.resolveAuthSession('synthetic-session-token'))?.isAdmin, false)
  assert.equal(calls.filter((call) => /UPDATE users/.test(call.sql)).length, 0)
})

test('administrator privilege explicitly persisted in the database survives the change', async () => {
  const { store } = loadStore(1)
  await store.registerAccount(registration)
  assert.equal((await store.authenticateAccount(email, registration.password))?.isAdmin, true)
  assert.equal((await store.resolveAuthSession('synthetic-session-token'))?.isAdmin, true)
})
