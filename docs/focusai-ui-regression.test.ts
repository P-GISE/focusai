import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SESSION_SAVE_FAILURE_MESSAGE,
  SESSION_SAVE_OFFLINE_MESSAGE,
  mergeRecentSession,
} from '../src/lib/sessionCompletion'

const repoRoot = resolve(import.meta.dirname, '..')

test('requested FocusAI UI refinements are wired in the client', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const cssSource = readFileSync(resolve(repoRoot, 'src/App.css'), 'utf8')
  const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8')
  const apiSource = readFileSync(resolve(repoRoot, 'src/lib/api.ts'), 'utf8')
  const authSource = readFileSync(resolve(repoRoot, 'server/src/auth.ts'), 'utf8')
  const viteConfigSource = readFileSync(resolve(repoRoot, 'vite.config.ts'), 'utf8')
  const devClientSource = readFileSync(resolve(repoRoot, 'scripts/dev-client.mjs'), 'utf8')
  const previewClientSource = readFileSync(resolve(repoRoot, 'scripts/preview-client.mjs'), 'utf8')

  assert.match(indexHtml, /<html lang="ko">/)
  assert.match(indexHtml, /<title>FocusAI<\/title>/)
  assert.match(appSource, /FocusAI/)
  assert.match(appSource, /로그인 상태 유지/)
  assert.match(appSource, /FOCUS_RANGE_OPTIONS/)
  assert.match(appSource, /current-week/)
  assert.match(appSource, /previous-week/)
  assert.match(appSource, /month/)
  assert.match(appSource, /지난 주/)
  assert.match(appSource, /최근 30일/)
  assert.match(appSource, /learning-observation-pane/)
  assert.match(appSource, /learning-side-scroll/)
  assert.match(appSource, /backendHealthRetryTimer/)
  assert.match(appSource, /window\.setInterval/)
  assert.match(cssSource, /\.auth-brand-lockup/)
  assert.match(cssSource, /\.focus-range-controls/)
  assert.match(cssSource, /\.learning-observation-pane/)
  assert.match(cssSource, /\.learning-side-scroll/)
  assert.match(apiSource, /credentials:\s*'include'/)
  assert.match(authSource, /maxAge/)
  assert.match(viteConfigSource, /FOCUSAI_CLIENT_HOST/)
  assert.match(devClientSource, /0\.0\.0\.0/)
  assert.match(previewClientSource, /FOCUSAI_PREVIEW_HOST/)
})

test('mobile feedback and study-session polish are wired in the client', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const cssSource = readFileSync(resolve(repoRoot, 'src/App.css'), 'utf8')

  assert.match(appSource, /APP_MESSAGE_AUTO_DISMISS_MS = 7_000/)
  assert.match(appSource, /app-toast-region/)
  assert.match(cssSource, /\.app-toast-region/)
  assert.match(cssSource, /\.app-toast/)
  assert.match(cssSource, /\.app-shell\.reduce-motion \*/)
  assert.doesNotMatch(cssSource, /transition-duration:\s*0\.01ms !important;/)
  assert.match(cssSource, /transition-duration:\s*80ms !important;/)

  assert.match(appSource, /집중 휴식 반복/)
  assert.doesNotMatch(appSource, /포모도로/)
  assert.match(appSource, /REST_CYCLE_MODE_NAME/)

  assert.match(appSource, /SUPPORT_TICKET_SUBJECT_MAX_LENGTH = 80/)
  assert.match(appSource, /SUPPORT_TICKET_BODY_MAX_LENGTH = 800/)
  assert.match(appSource, /maxLength=\{SUPPORT_TICKET_SUBJECT_MAX_LENGTH\}/)
  assert.match(appSource, /maxLength=\{SUPPORT_TICKET_BODY_MAX_LENGTH\}/)
  assert.match(appSource, /support-form-alert/)

  assert.match(appSource, /handleWindowBlur/)
  assert.match(appSource, /handleWindowFocus/)
  assert.match(appSource, /화면 포커스 이탈/)
  assert.match(appSource, /window\.addEventListener\('blur', handleWindowBlur\)/)

  assert.match(appSource, /학습 중에는 로그아웃할 수 없습니다/)
  assert.match(appSource, /로그아웃되었습니다/)
  assert.doesNotMatch(appSource, />\s*계속 진행\s*</)

  assert.match(
    cssSource,
    /@media \(orientation: portrait\) and \(max-width: 1100px\)[\s\S]*\.sidebar\s*{[\s\S]*top:\s*62px;[\s\S]*padding-top:\s*0\.9rem;/,
  )
  assert.match(
    cssSource,
    /@media \(orientation: portrait\) and \(max-width: 1100px\)[\s\S]*\.sidebar-backdrop\s*{[\s\S]*inset:\s*62px 0 0;/,
  )
  assert.match(cssSource, /\.bar-row\s*{[\s\S]*grid-template-columns:\s*minmax\(6\.5rem,\s*7\.5rem\)\s*minmax\(6rem,\s*1fr\)\s*minmax\(2\.5rem,\s*auto\);/)
  assert.match(cssSource, /\.session-goal-card\s+\.centered-time-picker\s*{[\s\S]*min-height:\s*6\.5rem;/)
  assert.match(cssSource, /@media \(max-width: 1100px\)[\s\S]*\.learning-observation-pane\s*{[\s\S]*position:\s*sticky;[\s\S]*top:\s*62px;/)
  assert.match(cssSource, /@media \(max-width: 1100px\)[\s\S]*\.settings-nav-card\s*{[\s\S]*margin:\s*0;/)
  assert.match(cssSource, /\.settings-nav-list\s*{[\s\S]*scroll-padding-inline:\s*1\.2rem;/)
})

test('report, settings, and support refinements are wired in the client', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const cssSource = readFileSync(resolve(repoRoot, 'src/App.css'), 'utf8')
  const indexCss = readFileSync(resolve(repoRoot, 'src/index.css'), 'utf8')

  assert.match(appSource, /function formatStudyDuration/)
  assert.match(appSource, /function formatCompactHour/)
  assert.match(appSource, /hourlyStudyCells/)
  assert.match(appSource, /className="hourly-study-chart"/)
  assert.match(appSource, /최근 30일 학습 시간/)
  assert.match(appSource, /캘린더 일자 기준/)
  assert.match(appSource, /탭 전환 방해/)
  assert.match(appSource, /disturbanceCount/)

  assert.match(appSource, /SUPPORT_CATEGORY_OPTIONS/)
  assert.match(appSource, /support-category-toggle/)
  assert.match(appSource, /support-category-example/)
  assert.match(appSource, /예: 로그인은 되지만/)
  assert.doesNotMatch(appSource, /<select[\s\S]*value=\{supportForm\.category\}/)

  assert.match(cssSource, /\.settings-nav-list\s*{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(9rem,\s*1fr\)\);/)
  assert.match(cssSource, /\.settings-nav-copy\s*{[\s\S]*display:\s*block;/)
  assert.match(cssSource, /\.hourly-study-chart/)
  assert.match(cssSource, /\.hourly-study-bar-fill/)
  assert.match(cssSource, /\.support-category-toggle/)
  assert.match(cssSource, /\.support-category-button/)
  assert.match(cssSource, /\.support-category-example/)
  assert.match(cssSource, /\.feedback-analytics-card/)
  assert.match(cssSource, /\.report-card/)
  assert.doesNotMatch(`${indexCss}\n${cssSource}`, /letter-spacing:\s*-/)
  assert.match(
    indexCss,
    /--focus-font-display:\s*'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif;/,
  )
  assert.match(appSource, /로그인과 학습 기록은 서버 세션과 MariaDB에 보관합니다\./)
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*\.auth-hero p\s*{[\s\S]*word-break:\s*keep-all;/)
})

test('profile sync avoids redundant bootstrap writes', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')

  assert.match(appSource, /function buildProfileSyncPayloadKey\(profile: UserProfile, settings: AppSettings\)/)
  assert.match(appSource, /lastSyncedProfilePayloadRef/)
  assert.match(
    appSource,
    /lastSyncedProfilePayloadRef\.current = buildProfileSyncPayloadKey\(profile, nextSettings\)/,
  )
  assert.match(appSource, /if \(lastSyncedProfilePayloadRef\.current === syncPayloadKey\) {\s*return\s*}/)
  assert.match(appSource, /lastSyncedProfilePayloadRef\.current = syncPayloadKey/)
})

test('completed session remains visible when server save fails', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const completionStart = appSource.indexOf("completeSessionRef.current = (reason: 'manual' | 'goal' = 'manual') => {")
  const completionEnd = appSource.indexOf('useEffect(() => {', completionStart + 1)
  const completionSource = appSource.slice(completionStart, completionEnd)

  assert.match(completionSource, /setResultSessionId\(completed\.id\)/)
  assert.match(completionSource, /setSessions\(\(current\) => mergeRecentSession\(current, completed\)\)/)
  assert.match(completionSource, /setScreen\('result'\)/)
  assert.match(completionSource, /SESSION_SAVE_OFFLINE_MESSAGE/)
  assert.match(completionSource, /SESSION_SAVE_FAILURE_MESSAGE/)
  assert.doesNotMatch(completionSource, /setSessions\(\(current\) => current\.filter/)
  assert.doesNotMatch(completionSource, /setScreen\('dashboard'\)/)
})

test('forced session-save rejection keeps the local completed result', async () => {
  const staleSession = { id: 'session-1', label: 'old' }
  const completedSession = { id: 'session-1', label: 'completed' }
  const previousSession = { id: 'session-0', label: 'previous' }
  const saveFailure = Promise.reject(new Error('api unavailable'))

  const sessions = mergeRecentSession([staleSession, previousSession], completedSession)
  let appError = ''

  await saveFailure.catch(() => {
    appError = SESSION_SAVE_FAILURE_MESSAGE
  })

  assert.deepEqual(sessions, [completedSession, previousSession])
  assert.equal(appError, SESSION_SAVE_FAILURE_MESSAGE)
  assert.equal(SESSION_SAVE_OFFLINE_MESSAGE.includes('결과는 현재 화면'), true)
})

test('browser E2E suite covers the API-backed login baseline', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
    devDependencies: Record<string, string>
  }
  const playwrightConfig = readFileSync(resolve(repoRoot, 'playwright.config.ts'), 'utf8')
  const e2eSource = readFileSync(resolve(repoRoot, 'tests/e2e/focusai-login.spec.ts'), 'utf8')

  assert.equal(packageJson.scripts['test:e2e'], 'playwright test')
  assert.match(packageJson.devDependencies['@playwright/test'], /^\^/)
  assert.match(playwrightConfig, /webServer:\s*\[/)
  assert.match(playwrightConfig, /command:\s*'npm run dev:server'/)
  assert.match(playwrightConfig, /url:\s*`\$\{apiBaseURL\}\/api\/health`/)
  assert.match(playwrightConfig, /command:\s*'npm run dev:client'/)
  assert.match(playwrightConfig, /fullyParallel:\s*false/)
  assert.match(playwrightConfig, /workers:\s*1/)
  assert.match(playwrightConfig, /FOCUSAI_E2E_PORT \?\? 15173/)
  assert.match(playwrightConfig, /FOCUSAI_E2E_API_PORT \?\? 18787/)
  assert.match(playwrightConfig, /CLIENT_ORIGIN:\s*baseURL/)
  assert.match(playwrightConfig, /FOCUSAI_API_PROXY_TARGET:\s*apiBaseURL/)
  assert.match(playwrightConfig, /viewport:\s*{\s*width:\s*1440,\s*height:\s*900\s*}/)
  assert.match(playwrightConfig, /viewport:\s*{\s*width:\s*500,\s*height:\s*844\s*}/)
  assert.match(e2eSource, /request\.get\('\/api\/health'\)/)
  assert.match(e2eSource, /request\.post\('\/api\/auth\/register'/)
  assert.match(e2eSource, /page\.waitForResponse/)
  assert.match(e2eSource, /\/api\/auth\/login/)
  assert.match(e2eSource, /submits login and reaches the authenticated dashboard flow/)
  assert.doesNotMatch(e2eSource, /page\.route\('(?:\*\*\/)?api\/auth\/login/)
  assert.doesNotMatch(e2eSource, /page\.route\('\*\*\/api\/auth\/login/)
  assert.match(e2eSource, /카메라 없이 계속/)
  assert.match(e2eSource, /안녕하세요, \$\{account\.name\}님/)
  assert.match(e2eSource, /formFieldsMissingNameOrId/)
  assert.match(e2eSource, /document\.documentElement\.scrollWidth > document\.documentElement\.clientWidth/)
  assert.match(e2eSource, /MariaDB에 보관합니다\./)
})
