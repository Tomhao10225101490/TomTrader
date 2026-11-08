import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the built app on 3100, driven by the machine's own Chrome
 * (`channel: 'chrome'`) so no browser download is needed.
 *
 * Two deliberate choices:
 *  - production build, not `next dev`: this host's proxy refuses the dev HMR
 *    websocket, which leaves the dev-mode page un-hydrated. The built app is
 *    also what ships, so it is the honest target.
 *  - assertions are structural (a cell holds a parsed price *or* an explicit
 *    "Unavailable", a badge names its source). A market terminal's tests must
 *    not fail because of what the S&P did today.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/playwright.json' }], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    channel: 'chrome',
    locale: 'en-US',
    timezoneId: 'Asia/Shanghai',
    launchOptions: { args: ['--no-proxy-server'] },
  },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'node tools/e2e-server.mjs',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: false,
    timeout: 300_000,
    env: { TOMTRADER_DB: `${process.cwd()}/test-results/e2e.db`, TOMTRADER_DEMO: '1', TOMTRADER_PUBLIC_FEEDS: '0' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
