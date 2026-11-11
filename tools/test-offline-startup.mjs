import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import os from 'node:os';

if (process.env.TOMTRADER_PUBLIC_FEEDS !== '1') throw new Error('Explicit opt-in required');
const executablePath = process.env.TOMTRADER_DESKTOP_EXECUTABLE;
if (!executablePath || !path.isAbsolute(executablePath)) throw new Error('Installed app path required');
const profile = await mkdtemp(path.join(os.tmpdir(), 'TomTrader offline 用户 '));
await writeFile(path.join(profile, 'desktop-settings.json'), JSON.stringify({ dataMode: 'personal' }));
const directory = path.resolve('test-results/rc/offline'); await mkdir(directory, { recursive: true });
const report = { method: 'Real packaged requests; process-local Node proxy failure injection. No system networking changes.', checks: [] };
let application;
const baseEnv = { ...process.env, PATH: '/usr/bin:/bin', TOMTRADER_DESKTOP_TEST_PROFILE: profile };
async function launch(extra = {}) {
  application = await electron.launch({ executablePath, args: ['--acceptance-test'], env: { ...baseEnv, ...extra }, cwd: os.tmpdir(), timeout: 90_000 });
  const page = await application.firstWindow({ timeout: 90_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  return page;
}
try {
  let page = await launch();
  const connected = await page.evaluate(() => window.tomtraderDesktop.verify());
  expect(connected.ok).toBe(true); report.onlineBefore = connected;
  await application.close(); application = null;
  const server = createServer(); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const closedPort = server.address().port; await new Promise((resolve) => server.close(resolve));
  const start = Date.now();
  page = await launch({ NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: `http://127.0.0.1:${closedPort}`, HTTP_PROXY: `http://127.0.0.1:${closedPort}`, NO_PROXY: '127.0.0.1,localhost' });
  report.offlineStartupMs = Date.now() - start;
  const failed = await page.evaluate(() => window.tomtraderDesktop.verify()); report.offlineConnection = failed;
  // An available provider here would mean this runtime ignored the injection;
  // it must be recorded as unverified, never called an offline pass.
  expect(failed.ok).toBe(false);
  const result = await page.evaluate(async () => (await fetch('/api/quotes?ids=equity%3AUS%3AAAPL&mode=stale')).json());
  const snapshot = result.snapshots[0];
  expect(snapshot.quote.last).toBeGreaterThan(0);
  expect(snapshot.quote.provider).not.toBe('demo');
  expect(snapshot.quote.tier).toBe('unverified');
  await expect(page.locator('body')).not.toContainText('Demo mode');
  report.cachedQuote = { provider: snapshot.quote.provider, quality: snapshot.quote.quality, quoteAt: snapshot.quote.exchangeTimestamp, receivedAt: snapshot.quote.receivedAt };
  await page.screenshot({ path: path.join(directory, 'offline-cached-startup.png') });
  report.checks.push('Cold start with unreachable upstream proxy still opens local UI and cached actual quote; no Demo fallback');
  await application.close(); application = null;
  page = await launch();
  const restored = await page.evaluate(() => window.tomtraderDesktop.verify()); expect(restored.ok).toBe(true);
  report.onlineAfter = restored;
  report.checks.push('Restored upstream environment and relaunched: real network requests resume with existing profile');
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.message; throw error; }
finally {
  if (application) await application.close();
  await writeFile(path.join(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  await rm(profile, { recursive: true, force: true });
}
