import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const start = source.indexOf("app.post('/api/auth/forgot-password'")
const end = source.indexOf("app.post('/api/auth/reset-password'", start)
assert.ok(start >= 0 && end > start)
const route = ts.transpileModule(source.slice(start, end), {}).outputText

test('reset response precedes account lookup and is unchanged by mail failure or absent account', async () => {
  const responses: string[] = []
  for (const outcome of ['absent', 'present', 'mail-failure', 'database-failure']) {
    const scheduled: Array<() => Promise<void>> = []
    let handler: (request: unknown, response: unknown) => Promise<void>
    let lookedUp = false
    let delivered = false
    let logged = false
    const context = {
      app: { post: (_path: string, _limit: unknown, callback: typeof handler) => { handler = callback } },
      authRateLimit: {},
      requireMariaConfigured: () => true,
      runtimeFlags: { smtpEnabled: true },
      forgotPasswordSchema: { parse: (input: unknown) => input },
      setImmediate: (task: () => Promise<void>) => scheduled.push(task),
      requestPasswordReset: async () => {
        lookedUp = true
        if (outcome === 'database-failure') throw new Error('synthetic database failure')
        return outcome === 'absent' ? null : { email: 'synthetic@example.invalid', name: 'Synthetic', token: 'dummy' }
      },
      sendPasswordResetEmail: async () => {
        delivered = true
        if (outcome === 'mail-failure') throw new Error('MAIL_NOT_CONFIGURED')
      },
      logRouteError: () => { logged = true },
      rejectValidationError: () => assert.fail('valid request should receive the uniform response'),
    }
    runInNewContext(route, context)
    await handler!({ body: { email: 'synthetic@example.invalid' } }, {
      json: (body: unknown) => responses.push(JSON.stringify(body)),
      status: () => assert.fail('account-dependent response status'),
    })
    assert.equal(lookedUp, false)
    assert.equal(scheduled.length, 1)
    await scheduled[0]()
    assert.equal(lookedUp, true)
    assert.equal(delivered, outcome === 'present' || outcome === 'mail-failure')
    assert.equal(logged, outcome.endsWith('failure'))
  }
  assert.equal(new Set(responses).size, 1)
})
