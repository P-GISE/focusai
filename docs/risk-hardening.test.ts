import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

test('production environment example contains placeholders instead of real-looking secrets', () => {
  const source = readFileSync(resolve(repoRoot, 'deploy/prod.env.example'), 'utf8')
  const anthropicKeyPattern = new RegExp('sk-' + 'ant-api03-[A-Za-z0-9_-]{20,}')

  assert.match(source, /^MARIADB_PASSWORD=CHANGE_ME_STRONG_PASSWORD$/m)
  assert.match(source, /^ANTHROPIC_API_KEY=CHANGE_ME_ANTHROPIC_API_KEY$/m)
  assert.match(source, /^SMTP_USER=example@example.com$/m)
  assert.match(source, /^SMTP_PASSWORD=CHANGE_ME_APP_PASSWORD$/m)
  assert.match(source, /^SMTP_FROM=FocusAI <example@example.com>$/m)
  assert.doesNotMatch(source, anthropicKeyPattern)
  assert.doesNotMatch(source, /paki\d*@/)
})

test('docker build context excludes local secrets, nested env files, logs, and build metadata', () => {
  const source = readFileSync(resolve(repoRoot, '.dockerignore'), 'utf8')

  for (const pattern of [
    '.env',
    '.env.*',
    '**/.env',
    '**/.env.*',
    '*.log',
    '*.tsbuildinfo',
    'logs',
  ]) {
    assert.match(source, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  }
})

test('production deployment uses the same server environment file convention as local development', () => {
  const composeSource = readFileSync(resolve(repoRoot, 'docker-compose.yml'), 'utf8')
  const ciSource = readFileSync(resolve(repoRoot, '.gitlab-ci.yml'), 'utf8')
  const deploymentSource = readFileSync(resolve(repoRoot, 'DEPLOYMENT.md'), 'utf8')

  assert.match(composeSource, /env_file:\s*\r?\n\s*-\s*\.env\.server/)
  assert.match(ciSource, /SERVER_ENV_FILE: \.env\.server/)
  assert.match(ciSource, /LEGACY_SERVER_ENV_FILE: \.env/)
  assert.match(ciSource, /Migrating legacy \.env to \.env\.server/)
  assert.doesNotMatch(ciSource, /FATAL \.env missing/)
  assert.match(deploymentSource, /\/data1\/docker\/focusai\/\.env\.server 작성/)
  assert.match(deploymentSource, /\/data1\/docker\/focusai\/\.env\.server`로 두고/)
  assert.match(deploymentSource, /`FATAL \$SERVER_ENV_FILE missing`/)
})

test('CI verify scope stays explicit while test and build remain local release checks', () => {
  const ciSource = readFileSync(resolve(repoRoot, '.gitlab-ci.yml'), 'utf8')
  const readmeSource = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')
  const deploymentSource = readFileSync(resolve(repoRoot, 'DEPLOYMENT.md'), 'utf8')
  const verifyJob = ciSource.slice(ciSource.indexOf('verify:'), ciSource.indexOf('deploy_production:'))

  assert.match(verifyJob, /-\s*npm ci/)
  assert.match(verifyJob, /-\s*npm run lint/)
  assert.doesNotMatch(verifyJob, /-\s*npm test/)
  assert.doesNotMatch(verifyJob, /-\s*npm run build/)
  assert.match(readmeSource, /verify 단계는 실제로 `npm ci`, `npm run lint`만 실행합니다/)
  assert.match(deploymentSource, /verify 단계.*`npm ci`, `npm run lint` 실행/s)
  assert.match(deploymentSource, /배포 전에는 로컬에서 `npm test`와 `npm run build`를 별도로 실행/)
})

test('local web-only dev script starts client and API without the Discord bot', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
  const scriptPath = resolve(repoRoot, 'scripts/dev-web.mjs')

  assert.equal(packageJson.scripts.dev, 'node scripts/dev-web.mjs')
  assert.equal(packageJson.scripts['dev:web'], 'node scripts/dev-web.mjs')
  assert.equal(packageJson.scripts['dev:client'], 'node scripts/dev-client.mjs')
  assert.equal(existsSync(scriptPath), true)

  const scriptSource = readFileSync(scriptPath, 'utf8')
  const envSource = readFileSync(resolve(repoRoot, 'server/src/env.ts'), 'utf8')
  const indexSource = readFileSync(resolve(repoRoot, 'server/src/index.ts'), 'utf8')

  assert.match(scriptSource, /server\/src\/index\.ts/)
  assert.match(scriptSource, /scripts\/dev-client\.mjs/)
  assert.match(scriptSource, /FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART/)
  assert.match(envSource, /FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART/)
  assert.match(indexSource, /discordBotAutostartDisabled/)
  assert.doesNotMatch(scriptSource, /bot\/src\/index\.ts/)
})

test('TypeScript build scripts clean generated output before compiling', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
  const buildTsScript = readFileSync(resolve(repoRoot, 'scripts/build-ts-project.mjs'), 'utf8')
  const lostarkBuildScript = readFileSync(resolve(repoRoot, 'scripts/build-lostark-discord-bot.mjs'), 'utf8')

  assert.equal(
    packageJson.scripts['build:server'],
    'node scripts/build-ts-project.mjs server/tsconfig.json server/dist',
  )
  assert.equal(
    packageJson.scripts['build:bot'],
    'node scripts/build-ts-project.mjs tsconfig.bot.json bot/dist',
  )
  assert.match(buildTsScript, /rm\(resolvedOutDir,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/s)
  assert.match(buildTsScript, /typescript['"]?,\s*['"]bin['"]?,\s*['"]tsc['"]?/)
  assert.match(lostarkBuildScript, /rm\(outDir,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/s)
})

test('server environment templates expose the Discord bot autostart runtime flag', () => {
  const localServerEnv = readFileSync(resolve(repoRoot, '.env.server.example'), 'utf8')
  const productionServerEnv = readFileSync(resolve(repoRoot, 'deploy/prod.env.example'), 'utf8')
  const envSource = readFileSync(resolve(repoRoot, 'server/src/env.ts'), 'utf8')

  assert.match(envSource, /FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART/)
  assert.match(localServerEnv, /^FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART=false$/m)
  assert.match(productionServerEnv, /^FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART=false$/m)
})

test('admin mutation APIs stay authenticated, admin-only, rate-limited, and error-mapped', () => {
  const indexSource = readFileSync(resolve(repoRoot, 'server/src/index.ts'), 'utf8')
  const routeErrorsSource = readFileSync(resolve(repoRoot, 'server/src/admin-route-errors.ts'), 'utf8')
  const storeSource = readFileSync(resolve(repoRoot, 'server/src/store.ts'), 'utf8')

  assert.match(
    indexSource,
    /app\.patch\(\s*['"]\/api\/admin\/users\/:userId\/role['"],\s*requireAuth,\s*requireAdmin,\s*adminRateLimit,/s,
  )
  assert.match(
    indexSource,
    /app\.post\(\s*['"]\/api\/admin\/announcements['"],\s*requireAuth,\s*requireAdmin,\s*adminRateLimit,/s,
  )
  assert.match(
    indexSource,
    /app\.patch\(\s*['"]\/api\/admin\/announcements\/:announcementId['"],\s*requireAuth,\s*requireAdmin,\s*adminRateLimit,/s,
  )
  assert.match(
    indexSource,
    /app\.delete\(\s*['"]\/api\/admin\/announcements\/:announcementId['"],\s*requireAuth,\s*requireAdmin,\s*adminRateLimit,/s,
  )
  assert.match(
    indexSource,
    /app\.patch\(\s*['"]\/api\/admin\/support\/tickets\/:ticketId['"],\s*requireAuth,\s*requireAdmin,\s*adminRateLimit,/s,
  )
  assert.match(indexSource, /getAdminRoleUpdateErrorResponse\(error\)/)
  assert.match(indexSource, /getAnnouncementMutationErrorResponse\(error\)/)
  assert.match(indexSource, /getSupportTicketAdminUpdateErrorResponse\(error\)/)

  assert.match(routeErrorsSource, /LAST_ADMIN_BLOCKED/)
  assert.match(routeErrorsSource, /ALLOWLIST_ADMIN_LOCKED/)
  assert.match(routeErrorsSource, /ANNOUNCEMENT_NOT_FOUND/)
  assert.match(routeErrorsSource, /SUPPORT_TICKET_NOT_FOUND/)

  assert.match(storeSource, /if \(actorUserId === targetUserId\)/)
  assert.match(storeSource, /SELECT COUNT\(\*\) AS admin_count[\s\S]*FROM users[\s\S]*WHERE is_admin = 1/)
  assert.match(storeSource, /throw new Error\('LAST_ADMIN_BLOCKED'\)/)
})

test('account deletion keeps the documented personal-data deletion and operational-log retention policy', () => {
  const schemaSql = readFileSync(resolve(repoRoot, 'db/schema.sql'), 'utf8')
  const mariaSchema = readFileSync(resolve(repoRoot, 'server/src/mariadb.ts'), 'utf8')
  const combinedSchema = `${schemaSql}\n${mariaSchema}`

  for (const tableName of [
    'user_subjects',
    'user_settings',
    'study_sessions',
    'auth_sessions',
    'password_reset_tokens',
    'support_tickets',
  ]) {
    assert.match(
      combinedSchema,
      new RegExp(`${tableName}[\\s\\S]*FOREIGN KEY \\(user_id\\) REFERENCES users\\(id\\) ON DELETE CASCADE`),
      `${tableName} should be removed with the user account`,
    )
  }

  for (const [tableName, columnName] of [
    ['ai_usage_logs', 'user_id'],
    ['admin_audit_logs', 'actor_user_id'],
    ['announcements', 'created_by'],
    ['discord_bot_settings', 'updated_by'],
  ]) {
    assert.match(
      combinedSchema,
      new RegExp(`${tableName}[\\s\\S]*FOREIGN KEY \\(${columnName}\\) REFERENCES users\\(id\\) ON DELETE SET NULL`),
      `${tableName}.${columnName} should retain operational history without a live user reference`,
    )
  }
})

test('server and client contracts keep bootstrap, session, and admin overview payload shapes aligned', () => {
  const serverContracts = readFileSync(resolve(repoRoot, 'server/src/contracts.ts'), 'utf8')
  const clientContracts = readFileSync(resolve(repoRoot, 'src/lib/contracts.ts'), 'utf8')

  for (const fieldName of ['profile', 'settings', 'sessions', 'authToken', 'status']) {
    assert.match(serverContracts, new RegExp(`${fieldName}\\??:`))
    assert.match(clientContracts, new RegExp(`${fieldName}\\??:`))
  }

  for (const fieldName of [
    'id',
    'createdAt',
    'subject',
    'mode',
    'goalMinutes',
    'elapsedSeconds',
    'focusedSeconds',
    'avgScore',
    'finalScore',
    'timeline',
    'tabSwitches',
    'idleEvents',
    'absenceEvents',
    'hiddenSeconds',
    'highestScore',
    'lowestScore',
    'notes',
  ]) {
    assert.match(serverContracts, new RegExp(`${fieldName}:`))
    assert.match(clientContracts, new RegExp(`${fieldName}:`))
  }

  for (const fieldName of [
    'totals',
    'recentUsers',
    'recentSessions',
    'users',
    'sessions',
    'announcements',
    'supportTickets',
    'auditLogs',
  ]) {
    assert.match(serverContracts, new RegExp(`${fieldName}:`))
    assert.match(clientContracts, new RegExp(`${fieldName}:`))
  }
})

test('README uses repository-relative links instead of Windows absolute paths', () => {
  const source = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')

  assert.doesNotMatch(source, /<\/D:\//)
  assert.doesNotMatch(source, /D:\\/)
  assert.match(source, /\[src\/App\.tsx\]\(\.\/src\/App\.tsx\)/)
  assert.match(source, /\[server\/src\]\(\.\/server\/src\)/)
})

test('legacy Discord bot compose build context exists', () => {
  const dockerfilePath = resolve(repoRoot, 'discord-bot/Dockerfile')
  const entrypointPath = resolve(repoRoot, 'discord-bot/entrypoint.mjs')

  assert.equal(existsSync(dockerfilePath), true)
  assert.equal(existsSync(entrypointPath), true)
  assert.match(readFileSync(dockerfilePath, 'utf8'), /entrypoint\.mjs/)
  assert.match(readFileSync(entrypointPath, 'utf8'), /managed by the web admin page/)
})

test('study session schema keeps server receipt time for operational statistics', () => {
  const schemaSql = readFileSync(resolve(repoRoot, 'db/schema.sql'), 'utf8')
  const mariaSchema = readFileSync(resolve(repoRoot, 'server/src/mariadb.ts'), 'utf8')
  const storeSource = readFileSync(resolve(repoRoot, 'server/src/store.ts'), 'utf8')

  assert.match(schemaSql, /server_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP/)
  assert.match(mariaSchema, /server_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP/)
  assert.match(storeSource, /last_session_server_created_at/)
  assert.match(storeSource, /DATE\(server_created_at\)/)
})

test('consent version changes require an explicit re-acceptance flow', () => {
  const contractsSource = readFileSync(resolve(repoRoot, 'server/src/contracts.ts'), 'utf8')
  const indexSource = readFileSync(resolve(repoRoot, 'server/src/index.ts'), 'utf8')
  const storeSource = readFileSync(resolve(repoRoot, 'server/src/store.ts'), 'utf8')
  const apiSource = readFileSync(resolve(repoRoot, 'src/lib/api.ts'), 'utf8')
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')

  assert.match(contractsSource, /consentRefreshSchema/)
  assert.match(indexSource, /\/api\/account\/consent/)
  assert.match(storeSource, /acceptCurrentConsent/)
  assert.match(apiSource, /acceptCurrentConsentInApi/)
  assert.match(appSource, /needsConsentRefresh/)
  assert.match(appSource, /handleAcceptUpdatedConsent/)
})
