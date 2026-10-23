import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const output = path.resolve(process.env.FOCUSAI_TEST_OUTPUT ?? '.omo/focusai-compose-test.json')
const secretDir = mkdtempSync(path.join(tmpdir(), 'focusai-ci-'))
const originalOwner = statSync(secretDir)
const project = `focusai-ci-${randomBytes(6).toString('hex')}`
const origin = 'https://focusai.pigs0516.com'
const port = process.env.FOCUSAI_TEST_PORT ?? '13400'
const base = `http://127.0.0.1:${port}`
const environment = { ...process.env, FOCUSAI_SECRETS_DIR: secretDir, FOCUSAI_ORIGIN: origin, FOCUSAI_PORT: port }
const composeArgs = ['compose', '-p', project, '-f', 'deploy/aws.compose.yml']
const evidence = { project, passed: false, checks: {}, sampledMemory: {}, limitations: ['Synthetic API test; physical camera and real email/AI integrations are not exercised.'] }
let cookie = ''
let sampler

function privileged(args, allowFailure = false) {
  const executable = process.getuid?.() === 0 ? args[0] : 'sudo'
  const composeEnvironment = ['FOCUSAI_IMAGE', 'FOCUSAI_SECRETS_DIR', 'FOCUSAI_ORIGIN', 'FOCUSAI_PORT']
    .filter(name => environment[name] !== undefined).map(name => `${name}=${environment[name]}`)
  const argumentsList = process.getuid?.() === 0 ? args.slice(1) : ['-n', 'env', ...composeEnvironment, ...args]
  const result = spawnSync(executable, argumentsList, { env: environment, encoding: 'utf8', timeout: 180000 })
  if (!allowFailure && result.status !== 0) throw new Error(`Privileged operation failed: ${args[0]} (exit ${result.status})`)
  return result
}
function docker(args, allowFailure = false) {
  const result = privileged(['docker', ...args], true)
  if (!allowFailure && result.status !== 0) throw new Error(`Docker operation failed: ${args[0]} ${args[1]} (exit ${result.status})`)
  return result
}
function compose(args, allowFailure = false) { return docker([...composeArgs, ...args], allowFailure) }
function record(name, condition) { assert.ok(condition, name); evidence.checks[name] = true }
async function request(route, method = 'GET', body, useCookie = true) {
  const response = await fetch(`${base}${route}`, {
    method, headers: { Origin: origin, Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie && useCookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  })
  const data = await response.json()
  return { response, data }
}
function sampleMemory() {
  const ids = compose(['ps', '-q'], true).stdout.trim().split(/\s+/).filter(Boolean)
  if (!ids.length) return
  const stats = docker(['stats', '--no-stream', '--format', '{{json .}}', ...ids], true)
  for (const line of stats.stdout.trim().split('\n').filter(Boolean)) {
    const item = JSON.parse(line)
    const match = item.MemUsage.match(/^([\d.]+)([KMG]?i?B)/)
    if (!match) continue
    const scale = { B: 1, kB: 1000, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, MB: 1e6, GB: 1e9 }[match[2]]
    const bytes = Number(match[1]) * scale
    evidence.sampledMemory[item.Name] = Math.max(evidence.sampledMemory[item.Name] ?? 0, bytes)
  }
}
try {
  record('linuxPermissionTest', process.platform === 'linux')
  record('imageSpecified', Boolean(environment.FOCUSAI_IMAGE))
  for (const name of ['db_root_password', 'db_app_password']) {
    const file = path.join(secretDir, name)
    writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o444 })
    chmodSync(file, 0o444)
  }
  privileged(['chown', 'root:root', '--', secretDir, path.join(secretDir, 'db_root_password'), path.join(secretDir, 'db_app_password')])
  privileged(['chmod', '0700', '--', secretDir])
  const permissions = privileged(['stat', '--format=%u:%g:%a', '--', secretDir, path.join(secretDir, 'db_root_password'), path.join(secretDir, 'db_app_password')]).stdout.trim().split('\n')
  record('productionSecretOwnerAndMode', JSON.stringify(permissions) === JSON.stringify(['0:0:700', '0:0:444', '0:0:444']))
  evidence.secretPermissions = { directory: permissions[0], files: permissions.slice(1) }
  compose(['config', '-q'])
  compose(['up', '-d', '--wait', 'db'])
  const initialized = compose(['--profile', 'init', 'run', '--rm', '--no-deps', 'init'])
  record('freshSchema14Tables', initialized.stdout.includes('"tableCount":14'))
  const repeated = compose(['--profile', 'init', 'run', '--rm', '--no-deps', 'init'], true)
  record('repeatInitializationRefused', repeated.status !== 0)
  compose(['up', '-d', '--no-deps', '--wait', 'app'])
  sampleMemory()
  sampler = setInterval(sampleMemory, 1500)
  const health = await request('/api/health')
  record('dbReachable', health.response.status === 200 && health.data.mariaReachable && health.data.mariaEnabled)
  record('externalAiDisabled', health.data.anthropicEnabled === false)
  const password = `A!${randomBytes(24).toString('hex')}`
  const email = `synthetic-${randomUUID()}@example.invalid`
  const registered = await request('/api/auth/register', 'POST', { name: '합성 검증', email, password, dailyGoalHours: 2, subjects: ['합성 과목'], privacyPolicyAccepted: true, cameraPolicyAccepted: true })
  record('register201', registered.response.status === 201)
  const setCookie = registered.response.headers.get('set-cookie') ?? ''
  record('cookieAttributes', /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Lax/i.test(setCookie))
  cookie = setCookie.split(';')[0]
  record('cookieAuthenticatedBootstrap', (await request('/api/bootstrap')).data.status.authenticated === true)
  const bootstrap = registered.data
  const sessionId = randomUUID()
  const saved = await request('/api/sessions', 'POST', {
    profile: bootstrap.profile, settings: bootstrap.settings,
    session: { id: sessionId, createdAt: new Date().toISOString(), subject: '합성 과목', mode: '능동 학습', goalMinutes: 1, elapsedSeconds: 60, focusedSeconds: 45, avgScore: 75, finalScore: 75, timeline: [75], tabSwitches: 0, idleEvents: 0, absenceEvents: 0, hiddenSeconds: 0, highestScore: 75, lowestScore: 75, notes: { studied: '', distraction: '', nextGoal: '' } }, events: [],
  })
  record('sessionSaved201', saved.response.status === 201)
  record('savedSessionReadBack', (await request('/api/bootstrap')).data.sessions.some(s => s.id === sessionId))
  const feedback = await request('/api/ai/feedback')
  record('honestLocalFeedback', feedback.response.status === 200 && feedback.data.source === 'local' && feedback.data.model === null)
  const login = await request('/api/auth/login', 'POST', { email, password }, false)
  record('login200', login.response.status === 200)
  const ddl = compose(['exec', '-T', 'app', 'node', '--input-type=module', '-e', `import {readFileSync} from 'node:fs';import{createConnection}from'mariadb';const c=await createConnection({host:'db',user:'focusai_app',password:readFileSync('/run/secrets/db_app_password','utf8').trim(),database:'focusai'});try{await c.query('CREATE TABLE unauthorized_schema_change(id INT)');process.exitCode=1}catch(e){process.exitCode=e.errno===1142?0:1}finally{await c.end()}`])
  record('runtimeDdlDenied', ddl.status === 0)
  const dbBefore = compose(['ps', '-q', 'db']).stdout.trim()
  compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', 'app'])
  record('appRestartPreservesDbContainer', compose(['ps', '-q', 'db']).stdout.trim() === dbBefore)
  record('appRestartPreservesSession', (await request('/api/bootstrap')).data.sessions.some(s => s.id === sessionId))
  record('syntheticAccountRemoved', (await request('/api/account', 'DELETE', { password })).response.status === 200)
  sampleMemory()
  evidence.passed = true
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : 'Integration test failed'
  process.exitCode = 1
} finally {
  clearInterval(sampler)
  const cleanup = compose(['down', '--volumes', '--remove-orphans'], true)
  evidence.cleanupPassed = cleanup.status === 0
  if (!evidence.cleanupPassed) process.exitCode = 1
  const resolvedTemp = path.resolve(tmpdir()) + path.sep
  if (secretDir.startsWith(resolvedTemp) && path.basename(secretDir).startsWith('focusai-ci-')) {
    const restored = privileged(['chown', '-R', `${originalOwner.uid}:${originalOwner.gid}`, '--', secretDir], true)
    evidence.secretOwnershipRestored = restored.status === 0
    if (restored.status === 0) rmSync(secretDir, { recursive: true, force: true })
    else process.exitCode = 1
  } else {
    evidence.secretOwnershipRestored = false
    process.exitCode = 1
  }
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ passed: evidence.passed, cleanupPassed: evidence.cleanupPassed, checks: Object.keys(evidence.checks).length, artifact: output }))
}
