import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

if (process.env.TOMTRADER_PUBLIC_FEEDS !== '1') throw new Error('Explicit public-feed opt-in required');
const executablePath = process.env.TOMTRADER_DESKTOP_EXECUTABLE;
if (!executablePath || !path.isAbsolute(executablePath)) throw new Error('Installed executable required');
const profile = await mkdtemp(path.join(os.tmpdir(), 'TomTrader real soak '));
await writeFile(path.join(profile, 'desktop-settings.json'), JSON.stringify({ dataMode: 'personal' }));
const directory = path.resolve('test-results/rc/soak'); await mkdir(directory, { recursive: true });
const report = { startedAt: Date.now(), durationTargetSeconds: 600, samples: [], errors: [], kind: 'real providers, independent installed binary, isolated profile' };
let application;
try {
  application = await electron.launch({ executablePath, args: ['--acceptance-test'], cwd: os.tmpdir(), env: { ...process.env, PATH: '/usr/bin:/bin', TOMTRADER_DESKTOP_TEST_PROFILE: profile }, timeout: 90_000 });
  const page = await application.firstWindow({ timeout: 90_000 });
  page.on('pageerror', (error) => report.errors.push(error.message));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/watchlist`);
  await expect(page.getByTestId('watchlist-table')).toBeVisible({ timeout: 45_000 });
  await page.evaluate(() => {
    window.__observedQuotes = [];
    const Original = window.EventSource;
    window.EventSource = class extends Original {
      constructor(url, options) {
        super(url, options);
        this.addEventListener('message', (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'quotes') for (const snapshot of data.quotes ?? []) {
            if (snapshot.quote && ['equity:CN:600519', 'equity:HK:00700'].includes(snapshot.instrument.id)) window.__observedQuotes.push({ id: snapshot.instrument.id, quoteAt: snapshot.quote.exchangeTimestamp, receivedAt: snapshot.quote.receivedAt, provider: snapshot.quote.provider, state: snapshot.status.state });
          }
          window.__observedQuotes = window.__observedQuotes.slice(-300);
        });
      }
    };
    window.dispatchEvent(new Event('tomtrader:resume'));
  });
  for (let n = 0; n <= 20; n++) {
    const status = await page.evaluate(async () => (await fetch('/api/status')).json());
    expect(status.demoMode).toBe(false);
    expect(status.hub.clients).toBeLessThanOrEqual(1);
    const memory = await application.evaluate(({ app }) => app.getAppMetrics().map(({ pid, type, memory }) => ({ pid, type, workingSetKB: memory.workingSetSize })));
    report.samples.push({ at: Date.now(), streamClients: status.hub.clients, subscribed: status.hub.subscribed, pollingIntervalMs: status.hub.pollingIntervalMs, cacheEntries: status.cache.entries, memory, totalWorkingSetKB: memory.reduce((sum, item) => sum + item.workingSetKB, 0) });
    await writeFile(path.join(directory, 'progress.json'), JSON.stringify(report, null, 2));
    if (n < 20) await page.waitForTimeout(30_000);
  }
  report.automaticQuotes = await page.evaluate(() => window.__observedQuotes);
  expect(report.automaticQuotes.every((quote) => quote.provider !== 'demo')).toBe(true);
  expect(report.errors).toEqual([]);
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.message; throw error; }
finally {
  report.completedAt = Date.now();
  await writeFile(path.join(directory, 'acceptance.json'), JSON.stringify(report, null, 2));
  if (application) await application.close();
  await rm(profile, { recursive: true, force: true });
}
