import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'

type HealthPayload = {
  ok?: unknown
  mariaEnabled?: unknown
  mariaReachable?: unknown
}

type AuthBootstrapPayload = {
  authToken?: unknown
  profile?: {
    email?: unknown
    name?: unknown
  } | null
  status?: {
    authenticated?: unknown
    mariaEnabled?: unknown
  }
}

type E2EAccount = {
  authToken: string
  email: string
  name: string
  password: string
  subjects: string[]
}

const E2E_PASSWORD = 'FocusAI-e2e-password-2026!'

function buildE2EAccount(testInfo: TestInfo) {
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const runId = randomUUID()
  const subjectSuffix = `${projectSlug} ${runId.slice(0, 8)}`

  return {
    email: `focusai-e2e-${projectSlug}-${runId}@example.com`,
    name: `테스트 학습자 ${projectSlug}`,
    password: E2E_PASSWORD,
    subjects: [`수학 ${subjectSuffix}`, `영어 ${subjectSuffix}`],
  }
}

async function registerE2EAccount(request: APIRequestContext, testInfo: TestInfo): Promise<E2EAccount> {
  const account = buildE2EAccount(testInfo)
  const response = await request.post('/api/auth/register', {
    data: {
      name: account.name,
      email: account.email,
      password: account.password,
      dailyGoalHours: 4,
      subjects: account.subjects,
      privacyPolicyAccepted: true,
      cameraPolicyAccepted: true,
    },
    headers: { Origin: 'https://localhost' },
  })
  const body = await response.text()

  expect(response.status(), `POST /api/auth/register returned ${response.status()} with body: ${body}`).toBe(201)

  const payload = JSON.parse(body) as AuthBootstrapPayload
  expect(payload.profile?.email).toBe(account.email)
  expect(payload.profile?.name).toBe(account.name)
  expect(payload.status?.authenticated).toBe(true)
  expect(typeof payload.authToken).toBe('string')

  return {
    ...account,
    authToken: String(payload.authToken),
  }
}

async function deleteE2EAccount(request: APIRequestContext, account: E2EAccount) {
  const response = await request.delete('/api/account', {
    data: { password: account.password },
    headers: { Authorization: `Bearer ${account.authToken}` },
  })

  expect(
    [200, 401, 404].includes(response.status()),
    `DELETE /api/account returned ${response.status()} with body: ${await response.text()}`,
  ).toBe(true)
}

test.describe('FocusAI login baseline', () => {
  test('serves API health through the full dev surface', async ({ request }) => {
    const response = await request.get('/api/health')
    const body = await response.text()

    expect(response.ok(), `GET /api/health returned ${response.status()} with body: ${body}`).toBe(true)
    const payload = JSON.parse(body) as HealthPayload
    expect(payload.ok).toBe(true)
    expect(typeof payload.mariaEnabled).toBe('boolean')
    expect(typeof payload.mariaReachable).toBe('boolean')
  })

  test('submits login and reaches the authenticated dashboard flow', async ({ page, request }, testInfo) => {
    const account = await registerE2EAccount(request, testInfo)

    try {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()

      await page.locator('.auth-form input[name="email"]').fill(account.email)
      await page.locator('.auth-form input[name="password"]').fill(account.password)
      const [loginResponse] = await Promise.all([
        page.waitForResponse(
          (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST',
        ),
        page.locator('.auth-form').getByRole('button', { name: '로그인' }).click(),
      ])
      const loginBody = await loginResponse.text()

      expect(loginResponse.ok(), `POST /api/auth/login returned ${loginResponse.status()} with body: ${loginBody}`).toBe(
        true,
      )

      const loginPayload = JSON.parse(loginBody) as AuthBootstrapPayload
      expect(loginPayload.profile?.email).toBe(account.email)
      expect(loginPayload.profile?.name).toBe(account.name)
      expect(loginPayload.status?.authenticated).toBe(true)

      await expect(page.getByRole('heading', { name: '카메라 설정' })).toBeVisible()
      await page.getByRole('button', { name: '카메라 없이 계속' }).click()
      await expect(page.getByRole('heading', { name: `안녕하세요, ${account.name}님` })).toBeVisible()
      await expect(page.getByRole('button', { name: '새 세션 시작' })).toBeVisible()
    } finally {
      await deleteE2EAccount(request, account)
    }
  })

  test('keeps login UI accessible and overflow-free', async ({ page }, testInfo) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'FocusAI' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()
    await expect(page.locator('.runtime-status-line.api-status')).toContainText(/API (정상|점검)/)

    const emailField = page.locator('input[name="email"]').first()
    await emailField.focus()

    const metrics = await page.evaluate(() => {
      const formFieldsMissingNameOrId = [...document.querySelectorAll('input, textarea, select')]
        .filter((field) => !field.getAttribute('name') && !field.id)
        .map((field) => field.outerHTML.slice(0, 160))
      const email = document.querySelector('input[name="email"]')
      const emailStyle = email ? getComputedStyle(email) : null
      const heroCopy = document.querySelector('.auth-hero p')
      const heroStyle = heroCopy ? getComputedStyle(heroCopy) : null
      const runtimeApiStatus = document.querySelector('.runtime-status-line.api-status')
      const runtimeApiStyle = runtimeApiStatus ? getComputedStyle(runtimeApiStatus) : null

      return {
        formFieldsMissingNameOrId,
        heroCopy: heroCopy?.textContent?.trim() ?? '',
        heroOverflowWrap: heroStyle?.overflowWrap ?? '',
        heroWordBreak: heroStyle?.wordBreak ?? '',
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        emailFocus: {
          outlineWidth: emailStyle?.outlineWidth ?? '',
          outlineOffset: emailStyle?.outlineOffset ?? '',
        },
        runtimeApiJustify: runtimeApiStyle?.justifyContent ?? '',
      }
    })

    expect(metrics.overflowX).toBe(false)
    expect(metrics.formFieldsMissingNameOrId).toEqual([])
    expect(metrics.emailFocus.outlineWidth).toBe('3px')
    expect(metrics.emailFocus.outlineOffset).toBe('3px')
    expect(metrics.heroCopy).toContain('MariaDB에 보관합니다.')

    if (testInfo.project.name.includes('mobile')) {
      expect(metrics.heroWordBreak).toBe('keep-all')
      expect(metrics.heroOverflowWrap).toBe('normal')
      expect(metrics.runtimeApiJustify).toBe('flex-end')
    }

    await page.screenshot({
      path: testInfo.outputPath(`login-${testInfo.project.name}.png`),
      fullPage: false,
    })
  })
})
