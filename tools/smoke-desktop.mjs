import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile, readFile, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(os.tmpdir(), 'TomTrader 中文 用户 '));
const executablePath = process.env.TOMTRADER_DESKTOP_EXECUTABLE;
const reportDir = path.resolve(process.env.TOMTRADER_DESKTOP_REPORT_DIR || 'test-results/desktop');
await mkdir(reportDir, { recursive: true });
let instance, servicePort, servicePid;
const failures = [], measurements = [], checks = [];
const started = Date.now();
const cleanEnv = { ...process.env, TOMTRADER_DESKTOP_TEST_PROFILE: profile,
  PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin' };
for (const name of Object.keys(cleanEnv)) if (/^(FINNHUB_|NODE_OPTIONS$|NODE_PATH$|TOMTRADER_DB$)/.test(name)) delete cleanEnv[name];
const api = (page, endpoint, method = 'GET', body) => page.evaluate(async ({ endpoint, method, body }) => {
  const response = await fetch(endpoint, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`API ${endpoint} returned ${response.status}`);
  return response.json();
}, { endpoint, method, body });
async function serviceStopped() {
  if (!servicePort) return;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { await fetch(`http://127.0.0.1:${servicePort}/api/status`, { signal: AbortSignal.timeout(500) }); }
    catch {
      try { if (servicePid) process.kill(servicePid, 0); else return; }
      catch { return; }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Local service still responds after application quit');
}
try {
  const launch = async () => {
    const application = await electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: [...(executablePath ? [] : [process.cwd()]), '--smoke-test'],
      env: cleanEnv, cwd: os.tmpdir(), timeout: 90_000,
    });
    application.process().stderr?.on('data', (data) => process.stderr.write(data));
    return application;
  };
  instance = await launch();
  const page = await instance.firstWindow({ timeout: 90_000 });
  page.on('pageerror', (error) => failures.push(error.message));
  await expect(page.getByRole('heading', { level: 1, name: /Global Market Overview/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-index-card]').first()).toBeVisible({ timeout: 60_000 });
  measurements.push({ name: 'cold launch to populated overview', ms: Date.now() - started });
  await expect(page.locator('body')).toContainText(/Demo mode/i);
  const security = await instance.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox, webSecurity: preferences.webSecurity };
  });
  expect(security).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  expect(await page.evaluate(() => Object.keys(window.tomtraderDesktop).sort())).toEqual(['backup', 'configure', 'status', 'verify']);
  const status = await api(page, '/api/status');
  expect(status.dbPath).toBe(path.join(profile, 'data', 'demo.db'));
  expect(status.configuration.publicFeedsEnabled).toBe(false);
  servicePid = status.runtime.pid;
  if (executablePath) {
    const resources = await instance.evaluate(() => process.resourcesPath);
    const expectedRoot = await realpath(path.join(resources, 'server'));
    expect(await realpath(status.runtime.cwd)).toBe(expectedRoot);
    expect((await realpath(status.runtime.nextModule)).startsWith(`${expectedRoot}${path.sep}`)).toBe(true);
    checks.push('backend cwd and actual Next module resolution are inside installed resources');
  }
  const originalOrigin = new URL(page.url()).origin;
  servicePort = new URL(originalOrigin).port;
  for (const endpoint of ['/api/status', '/api/watchlist', '/api/portfolio', '/api/stream', '/']) {
    expect((await fetch(`${originalOrigin}${endpoint}`)).status).toBe(401);
  }
  checks.push('unauthenticated loopback reads/mutations blocked', 'sandbox and restricted bridge', 'Unicode and spaces in isolated profile', 'no system Node/npm in application PATH');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await palette.locator('input').fill('AAPL');
  await palette.locator('[data-search-row]').first().click();
  await expect(page).toHaveURL(/\/stocks\//);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  checks.push('keyboard search opens chart');
  const group = await api(page, '/api/watchlist', 'POST', { op: 'create', name: 'RC synthetic acceptance' });
  const groupId = group.group?.id ?? group.id;
  if (!groupId) throw new Error(`Unexpected create response: ${JSON.stringify(group)}`);
  for (const id of ['equity:US:AAPL', 'equity:US:NVDA']) await api(page, '/api/watchlist', 'POST', { op: 'add', groupId, instrumentId: id });
  await api(page, '/api/watchlist', 'POST', { op: 'reorder', groupId, ids: ['equity:US:NVDA', 'equity:US:AAPL'] });
  await page.goto(`${originalOrigin}/watchlist`);
  await page.locator('main').getByRole('button', { name: /RC synthetic acceptance/ }).click();
  await expect(page.getByTestId('watchlist-table')).toContainText('NVDA', { timeout: 15_000 });
  await page.screenshot({ path: path.join(reportDir, 'installed-watchlist.png') });
  await page.getByTestId('watchlist-table').locator('tbody tr').filter({ hasText: 'AAPL' }).getByRole('button', { name: /Remove from list/ }).click();
  await expect(page.getByTestId('watchlist-table')).not.toContainText('AAPL');
  await api(page, '/api/watchlist', 'POST', { op: 'add', groupId, instrumentId: 'equity:US:AAPL' });
  checks.push('watchlist create, add, reorder, remove through installed app');
  const backupBytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch('/api/backup', { method: 'POST' })).arrayBuffer())));
  const backupPath = path.join(profile, 'acceptance-backup.db');
  await writeFile(backupPath, Buffer.from(backupBytes));
  const backup = new DatabaseSync(backupPath);
  expect(backup.prepare('PRAGMA quick_check').get().quick_check).toBe('ok');
  expect(backup.prepare('SELECT name FROM watchlist_group WHERE id=?').get(groupId).name).toBe('RC synthetic acceptance');
  backup.close();
  checks.push('consistent backup includes committed user data');
  await page.goto(`${originalOrigin}/settings`);
  await page.getByRole('radio', { name: /^Dark$/ }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('radio', { name: '简体中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.screenshot({ path: path.join(reportDir, 'installed-settings-dark-zh.png') });
  await page.waitForTimeout(900); // allow the bounded preference mirror to persist
  for (let n = 0; n < 3; n++) {
    await instance.evaluate(({ powerMonitor }) => { powerMonitor.emit('suspend'); powerMonitor.emit('resume'); });
    await page.waitForTimeout(500);
  }
  await expect.poll(async () => (await api(page, '/api/status')).hub.clients, { timeout: 15_000 }).toBe(1);
  checks.push('injected suspend/resume events retain one stream (not physical sleep)');
  await page.context().setOffline(true);
  await page.waitForTimeout(500);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await api(page, '/api/status')).hub.clients, { timeout: 20_000 }).toBe(1);
  checks.push('renderer network fault injection and recovery (not OS network shutdown)');
  measurements.push({ name: 'sample after core journeys', value: await instance.evaluate(({ app }) => app.getAppMetrics().map(({ type, memory }) => ({ type, workingSetKB: memory.workingSetSize }))) });
  if (executablePath) {
    const duplicate = spawn(executablePath, ['--smoke-test'], { env: cleanEnv, cwd: os.tmpdir(), stdio: 'ignore' });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => { duplicate.kill(); reject(new Error('Duplicate instance did not exit')); }, 15_000); duplicate.on('exit', () => { clearTimeout(timer); resolve(); }); });
    expect((await api(page, '/api/status')).hub.clients).toBe(1);
    checks.push('duplicate process exits without another service');
  }
  const quitAt = Date.now();
  await instance.close(); instance = null;
  await serviceStopped();
  measurements.push({ name: 'quit including own-service cleanup', ms: Date.now() - quitAt });
  checks.push('quit leaves no responding orphan service');
  instance = await launch();
  const restarted = await instance.firstWindow({ timeout: 90_000 });
  await expect(restarted.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  expect(new URL(restarted.url()).origin).toBe(originalOrigin);
  await expect(restarted.locator('html')).toHaveClass(/dark/);
  await expect(restarted.locator('html')).toHaveAttribute('lang', 'zh-CN');
  servicePid = (await api(restarted, '/api/status')).runtime.pid;
  const groups = await api(restarted, '/api/watchlist');
  expect(groups.groups.find((g) => g.id === groupId).instrumentIds).toEqual(['equity:US:NVDA', 'equity:US:AAPL']);
  const settings = JSON.parse(await readFile(path.join(profile, 'desktop-settings.json'), 'utf8'));
  expect(JSON.stringify(settings)).not.toContain('TOMTRADER_DESKTOP_TOKEN');
  checks.push('restart retains watchlist ordering, theme and language');
  expect(failures).toEqual([]);
  await writeFile(path.join(reportDir, 'smoke.json'), JSON.stringify({ platform: process.platform, arch: process.arch, packaged: Boolean(executablePath), checks, measurements, passed: true }, null, 2));
  console.log(`Desktop acceptance smoke passed (${checks.length} checks).`);
} catch (error) {
  await writeFile(path.join(reportDir, 'failure.json'), JSON.stringify({ message: error.message, completedChecks: checks, measurements }, null, 2));
  throw error;
} finally {
  if (instance) await instance.close();
  await serviceStopped();
  await rm(profile, { recursive: true, force: true });
}
