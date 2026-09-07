import { defineConfig } from '@playwright/test'

const host = process.env.FOCUSAI_E2E_HOST ?? '127.0.0.1'
const port = Number(process.env.FOCUSAI_E2E_PORT ?? 15173)
const apiPort = Number(process.env.FOCUSAI_E2E_API_PORT ?? 18787)
const baseURL = `http://${host}:${port}`
const apiBaseURL = process.env.FOCUSAI_E2E_API_BASE_URL ?? `http://${host}:${apiPort}`

process.env.FOCUSAI_E2E_API_BASE_URL = apiBaseURL

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    screenshot: { mode: 'only-on-failure', fullPage: true },
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'api',
      command: 'npm run dev:server',
      url: `${apiBaseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        APP_BASE_URL: apiBaseURL,
        CLIENT_ORIGIN: baseURL,
        FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART: 'true',
        PORT: String(apiPort),
      },
    },
    {
      name: 'client',
      command: 'npm run dev:client',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        FOCUSAI_API_PROXY_TARGET: apiBaseURL,
        FOCUSAI_CLIENT_HOST: host,
        FOCUSAI_CLIENT_PORT: String(port),
      },
    },
  ],
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        viewport: { width: 500, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
})
