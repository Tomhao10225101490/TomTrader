import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

if (process.env.TOMTRADER_PUBLIC_FEEDS !== '1') throw new Error('Explicit public-feed consent required');
const executablePath = process.env.TOMTRADER_DESKTOP_EXECUTABLE;
if (!executablePath || !path.isAbsolute(executablePath)) throw new Error('Use an independently installed absolute executable path');
const reportDir = path.resolve('test-results/rc/real-installed');
await mkdir(reportDir, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), 'TomTrader 真实行情 验收 '));
let instance;
const evidence = { version: null, startedAt: Date.now(), mode: 'personal real network, isolated profile, no developer key', checks: [], quotes: [], histories: [], pageTimings: [], samples: [], errors: [] };
const env = { ...process.env, TOMTRADER_DESKTOP_TEST_PROFILE: profile, PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin' };
for (const key of Object.keys(env)) if (/^(FINNHUB_|NODE_OPTIONS$|NODE_PATH$|TOMTRADER_DB$)/.test(key)) delete env[key];
const request = (page, endpoint, method = 'GET', body) => page.evaluate(async ({ endpoint, method, body }) => {
  const response = await fetch(endpoint, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  return response.json();
}, { endpoint, method, body });
const launch = () => electron.launch({ executablePath, args: ['--acceptance-test'], env, cwd: os.tmpdir(), timeout: 90_000 });
try {
  instance = await launch();
  const firstRun = await instance.firstWindow({ timeout: 90_000 });
  await expect(firstRun.getByRole('heading', { name: /Data sources/ })).toBeVisible();
  await expect(firstRun.locator('#mode')).toHaveValue('personal');
  await firstRun.locator('#mode').selectOption('personal');
  const marketWindow = instance.waitForEvent('window', { timeout: 90_000 });
  const startup = Date.now();
  await firstRun.locator('#save').click();
  const page = await marketWindow;
  page.on('pageerror', (error) => evidence.errors.push(error.message));
  await expect(page.getByRole('heading', { level: 1, name: /Global Market Overview/ })).toBeVisible({ timeout: 60_000 });
  evidence.pageTimings.push({ page: 'first-run apply → market overview', ms: Date.now() - startup });
  await firstRun.close();
  const base = new URL(page.url()).origin;
  expect((await fetch(`${base}/api/watchlist`)).status).toBe(401);
  expect((await fetch(`${base}/api/watchlist`, { method: 'POST', headers: { origin: 'https://other.example', 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
  expect(await page.evaluate(() => window.tomtraderDesktop.status())).toMatchObject({ mode: 'personal', configured: false });
  evidence.version = (await page.evaluate(() => window.tomtraderDesktop.status())).version;
  evidence.checks.push('real first-run configuration screen', 'public feeds explicitly selected', 'external loopback clients denied');
  await page.goto(`${base}/settings`);
  await page.getByRole('button', { name: 'Verify connection', exact: true }).click();
  await expect(page.locator('body')).toContainText(/Real source requests returned|Some sources available/, { timeout: 30_000 });
  evidence.connection = await page.evaluate(() => window.tomtraderDesktop.verify());
  for (const [id, query, currency, market] of [['equity:CN:600519', '600519', 'CNY', 'CN'], ['equity:HK:00700', '00700', 'HKD', 'HK'], ['equity:US:AAPL', 'AAPL', 'USD', 'US']]) {
    const search = await request(page, `/api/search?q=${query}`);
    expect(search.results.some((item) => item.instrument.id === id && item.instrument.market === market)).toBe(true);
    const quotes = await request(page, `/api/quotes?ids=${encodeURIComponent(id)}&mode=await`);
    const snapshot = quotes.snapshots.find((item) => item.instrument.id === id);
    expect(snapshot.instrument.currency).toBe(currency);
    expect(snapshot.quote?.last).toBeGreaterThan(0);
    expect(snapshot.quote.provider).not.toBe('demo');
    expect(snapshot.quote.tier).toBe('unverified');
    expect(snapshot.quote.instrumentId).toBe(id);
    if (snapshot.quote.previousClose > 0) expect(Math.abs(snapshot.quote.changePercent - (snapshot.quote.last / snapshot.quote.previousClose - 1) * 100)).toBeLessThan(0.1);
    evidence.quotes.push({ instrument: snapshot.instrument, quote: snapshot.quote, marketState: snapshot.status.state, issue: snapshot.issue });
    const history = await request(page, `/api/bars?id=${encodeURIComponent(id)}&range=1M&wait=1`);
    expect(history.series?.bars.length).toBeGreaterThan(0);
    expect(history.series.meta.provider).not.toBe('demo');
    evidence.histories.push({ id, provider: history.series.meta.provider, adjustment: history.series.adjustment, currency: history.series.meta.currency, interval: history.series.interval, count: history.series.bars.length, first: history.series.bars[0], last: history.series.bars.at(-1) });
    const start = Date.now();
    await page.goto(`${base}/stocks/${encodeURIComponent(id)}`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('body')).not.toContainText(/Demo mode/);
    evidence.pageTimings.push({ page: id, ms: Date.now() - start });
    await page.screenshot({ path: path.join(reportDir, `real-${market}-detail.png`), fullPage: true });
  }
  evidence.checks.push('CN/HK/US identity and currency', 'three real quotes and historical charts', 'consistent previous-close comparison', 'no real-mode synthetic fallback');
  await page.goto(`${base}/watchlist`);
  await page.getByRole('button', { name: /Add symbol/i }).first().click();
  const picker = page.getByTestId('symbol-picker');
  await picker.locator('input').first().fill('NVDA');
  await picker.locator('[data-picker-row]').first().click();
  await expect(page.getByTestId('watchlist-table')).toContainText('NVDA', { timeout: 30_000 });
  const savedGroups = (await request(page, '/api/watchlist')).groups;
  await page.screenshot({ path: path.join(reportDir, 'real-watchlist-light.png') });
  // Observe genuine server frames without changing their payload or adding a
  // second stream. Reconnect once so the observer attaches to the app's source.
  const openInstrument = evidence.quotes.find((row) => row.marketState === 'open')?.instrument.id ?? null;
  await page.evaluate((observedId) => {
    window.__quoteEvidence = [];
    const Original = window.EventSource;
    window.EventSource = class extends Original {
      constructor(url, options) {
        super(url, options);
        this.addEventListener('message', (event) => {
          const frame = JSON.parse(event.data);
          if (frame.type === 'quotes') for (const snapshot of frame.quotes ?? []) {
            if (snapshot.instrument.id === observedId && snapshot.quote) window.__quoteEvidence.push({ receivedAt: snapshot.quote.receivedAt, quoteAt: snapshot.quote.exchangeTimestamp, provider: snapshot.quote.provider });
          }
        });
      }
    };
    window.dispatchEvent(new Event('tomtrader:resume'));
  }, openInstrument);
  for (let n = 0; n < 5; n++) {
    const status = await request(page, '/api/status');
    evidence.samples.push({ at: Date.now(), clients: status.hub.clients, subscribed: status.hub.subscribed, queue: status.queue,
      memory: await instance.evaluate(({ app }) => app.getAppMetrics().map(({ type, memory }) => ({ type, workingSetKB: memory.workingSetSize }))) });
    expect(status.hub.clients).toBe(1);
    if (n < 4) await page.waitForTimeout(15_000);
  }
  evidence.automaticUpdates = await page.evaluate(() => window.__quoteEvidence);
  if (openInstrument) {
    expect(new Set(evidence.automaticUpdates.map((frame) => frame.receivedAt)).size).toBeGreaterThan(1);
    expect(evidence.automaticUpdates.every((frame) => frame.provider !== 'demo')).toBe(true);
    evidence.checks.push(`60-second real-mode sample: one stream and multiple genuine automatic refreshes for ${openInstrument}`);
  } else {
    evidence.checks.push('60-second closed-session sample: one stream; unchanged close is expected, not fabricated updates');
  }
  await instance.close(); instance = null;
  instance = await launch();
  const restored = await instance.firstWindow({ timeout: 90_000 });
  await expect(restored.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  expect((await restored.evaluate(() => window.tomtraderDesktop.status())).mode).toBe('personal');
  expect((await request(restored, '/api/watchlist')).groups).toEqual(savedGroups);
  expect(JSON.parse(await readFile(path.join(profile, 'desktop-settings.json'), 'utf8')).dataMode).toBe('personal');
  evidence.checks.push('restart restores real mode and watchlists');
  expect(evidence.errors).toEqual([]);
  evidence.passed = true;
} catch (error) { evidence.passed = false; evidence.failure = error.message; throw error; }
finally {
  evidence.completedAt = Date.now();
  await writeFile(path.join(reportDir, 'acceptance.json'), JSON.stringify(evidence, null, 2));
  if (instance) await instance.close();
  await rm(profile, { recursive: true, force: true });
}
