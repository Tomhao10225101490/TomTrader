import { _electron as electron, chromium, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

if (process.platform !== 'darwin') throw new Error('Native macOS lifecycle acceptance only');
const executable = process.env.TOMTRADER_DESKTOP_EXECUTABLE;
if (!executable || !path.isAbsolute(executable)) throw new Error('Set the independently installed executable');
const appBundle = path.resolve(executable, '../../..');
const baseline = path.resolve('test-results/rc/baseline/TomTrader.app');
const temp = await mkdtemp(path.join(os.tmpdir(), 'TomTrader lifecycle 中文 '));
const reportDir = path.resolve('test-results/rc/lifecycle');
await mkdir(reportDir, { recursive: true });
const profile = path.join(temp, '用户 数据');
await mkdir(profile);
let application, heldPort, systemBrowser, systemPid;
const report = { platform: 'darwin', arch: process.arch, checks: [], limitations: ['Suspend/resume is event-injected, not a physical sleep cycle.', 'Offline transport is fault-injected; full OS networking is not disabled.'] };
const env = { ...process.env, TOMTRADER_DESKTOP_TEST_PROFILE: profile, PATH: '/usr/bin:/bin' };
const request = (page, endpoint, body) => page.evaluate(async ({ endpoint, body }) => {
  const response = await fetch(endpoint, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!response.ok) throw new Error(`${endpoint} ${response.status}`);
  return response.json();
}, { endpoint, body });
const launch = (exe = executable, flag = '--acceptance-test') => electron.launch({ executablePath: exe, args: [flag], cwd: os.tmpdir(), env, timeout: 90_000 });
async function closeHeldPort() {
  if (!heldPort) return;
  const server = heldPort; heldPort = null;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    server.close(() => { clearTimeout(timer); resolve(); });
  });
}
async function pageOf(instance) { const page = await instance.firstWindow({ timeout: 60_000 }); await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 }); return page; }
try {
  // Upgrade the same isolated installation location from the actual previous
  // desktop binary, not just a fabricated empty database.
  const upgradeBundle = path.join(temp, 'Upgrade TomTrader.app');
  execFileSync('ditto', [baseline, upgradeBundle]);
  const upgradeExecutable = path.join(upgradeBundle, 'Contents/MacOS/TomTrader');
  application = await launch(upgradeExecutable, '--smoke-test');
  let page = await pageOf(application);
  expect(await application.evaluate(({ app }) => app.getVersion())).toBe('1.0.0');
  await request(page, '/api/watchlist', { op: 'create', name: 'Upgrade fixture only' });
  await request(page, '/api/portfolio', { op: 'add', instrumentId: 'equity:US:AAPL', quantity: 2, averageCost: 100, currency: 'USD', purchasedAt: '2026-01-02', note: 'Synthetic acceptance holding, not personal data' });
  const alert = await request(page, '/api/alerts', { op: 'create', instrumentId: 'equity:US:AAPL', condition: { type: 'price-above', threshold: 1000000 }, cooldownMinutes: 30 });
  await request(page, '/api/alerts', { op: 'toggle', id: alert.id, enabled: false });
  const before = await request(page, '/api/portfolio', { op: 'export' }); delete before.exportedAt;
  await page.goto(new URL('/settings', page.url()).href);
  await page.getByRole('radio', { name: /^Dark$/ }).click();
  await page.getByRole('radio', { name: '简体中文' }).click();
  await page.waitForTimeout(800);
  await application.close(); application = null;
  const settingsFile = path.join(profile, 'desktop-settings.json');
  const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  await writeFile(settingsFile, JSON.stringify({ ...settings, dataMode: 'demo' }));
  await rm(upgradeBundle, { recursive: true });
  execFileSync('ditto', [appBundle, upgradeBundle]);
  application = await launch(upgradeExecutable);
  page = await pageOf(application);
  const after = await request(page, '/api/portfolio', { op: 'export' }); delete after.exportedAt;
  expect(after).toEqual(before);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  report.checks.push('Actual 1.0.0 → RC replacement in same installation path: groups, synthetic holdings, disabled alert, theme and Chinese locale retained');
  report.version = await application.evaluate(({ app }) => app.getVersion());

  // Real native secure-storage API, with a clearly labelled dummy key while
  // in Demo. No real Finnhub request or successful account claim is made.
  const configure = application.waitForEvent('window');
  await page.evaluate(() => window.tomtraderDesktop.configure());
  let config = await configure;
  await config.locator('#mode').selectOption('demo');
  await config.locator('#key').fill('fixture-not-a-real-account-123456');
  if (process.env.TOMTRADER_TEST_SECURE_STORAGE === '1') {
    await config.locator('#check-storage').click();
    await expect(config.locator('#check-storage')).toBeEnabled({ timeout: 30_000 });
  }
  const secure = !(await config.locator('#persist').isDisabled());
  if (!secure) await config.locator('#persist').uncheck();
  await config.locator('#save').click();
  await expect(config.locator('#result')).toContainText('Applied', { timeout: 30_000 });
  expect(await readFile(settingsFile, 'utf8')).not.toContain('fixture-not-a-real-account-123456');
  expect(JSON.stringify(await request(page, '/api/status'))).not.toContain('fixture-not-a-real-account-123456');
  await config.close();
  await application.close(); application = null;
  application = await launch(upgradeExecutable);
  page = await pageOf(application);
  expect((await page.evaluate(() => window.tomtraderDesktop.status())).configured).toBe(secure);
  report.secureStorage = secure ? 'Native asynchronous encryption/decryption passed across restart; fixture key only, Demo network disabled' : 'Session-only verified; OS-encrypted persistence on this re-signed preview requires native Keychain authorization and is not claimed by this run';
  const clearing = application.waitForEvent('window');
  await page.evaluate(() => window.tomtraderDesktop.configure()); config = await clearing;
  await config.locator('#forget').check();
  await config.locator('#save').click();
  await expect(config.locator('#result')).toContainText('Applied', { timeout: 30_000 });
  await config.close();
  expect((await page.evaluate(() => window.tomtraderDesktop.status())).configured).toBe(false);
  report.checks.push(secure ? 'Native encrypted credential fixture survives restart; key removal works' : 'Credential entry isolated from market renderer; explicit session-only never persists a key and does not survive restart; key removal works');
  if (!secure) report.limitations.push('Native encrypted persistence not revalidated for this final code identity: requires user Keychain approval. No permission bypass; optional explicit TOMTRADER_TEST_SECURE_STORAGE=1 checks it with owner approval.');

  // Window lifecycle follows macOS: close hides all windows, Dock activation
  // recreates the market window, Cmd+Q/app.quit stops only its own service.
  await page.close();
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
  const reopened = application.waitForEvent('window');
  await application.evaluate(({ app }) => app.emit('activate'));
  page = await reopened;
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  report.checks.push('Close window keeps macOS app; Dock activation recreates window with saved data');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 700));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  report.retinaDevicePixelRatio = await page.evaluate(() => devicePixelRatio);
  await page.screenshot({ path: path.join(reportDir, 'installed-dark-small-window.png') });
  report.fullscreen = await application.evaluate(({ BrowserWindow }) => new Promise((resolve) => {
    const target = BrowserWindow.getAllWindows()[0]; target.once('enter-full-screen', () => resolve(target.isFullScreen())); target.setFullScreen(true);
  }));
  expect(report.fullscreen).toBe(true);
  await application.evaluate(({ BrowserWindow }) => new Promise((resolve) => {
    const target = BrowserWindow.getAllWindows()[0]; target.once('leave-full-screen', () => resolve()); target.setFullScreen(false);
  }));
  report.checks.push('Resize, actual macOS fullscreen enter/exit and Retina scale');
  await page.waitForTimeout(1000);

  // Controlled service crash + occupied old port. Capture the native recovery
  // dialog and inject the user's "another port" choice, without adding a test
  // IPC or weakening production isolation.
  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(settingsFile, 'utf8'));
    return saved.browserPreferences ? JSON.parse(saved.browserPreferences).state.theme : null;
  }).toBe('dark');
  const status = await request(page, '/api/status');
  const oldOrigin = new URL(page.url()).origin;
  const oldPort = Number(new URL(oldOrigin).port);
  const ownPids = await application.evaluate(({ app }) => app.getAppMetrics().map((m) => m.pid));
  expect(ownPids).toContain(status.runtime.pid);
  await application.evaluate(({ dialog }) => {
    globalThis.__originalMessageBox = dialog.showMessageBox;
    dialog.showMessageBox = async (options) => {
      globalThis.__recoveryOptions = options;
      return new Promise((resolve) => { globalThis.__chooseRecovery = resolve; });
    };
  });
  process.kill(status.runtime.pid, 'SIGKILL');
  await expect.poll(() => application.evaluate(() => Boolean(globalThis.__chooseRecovery)), { timeout: 15_000 }).toBe(true);
  heldPort = createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => { heldPort.once('error', reject); heldPort.listen(oldPort, '127.0.0.1', resolve); });
  report.recoveryDialog = await application.evaluate(() => globalThis.__recoveryOptions);
  await application.evaluate(() => globalThis.__chooseRecovery({ response: 1 }));
  await expect.poll(() => page.url(), { timeout: 30_000 }).not.toContain(`:${oldPort}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  const recovered = await request(page, '/api/portfolio', { op: 'export' }); delete recovered.exportedAt;
  expect(recovered).toEqual(before);
  await application.evaluate(({ dialog }) => { dialog.showMessageBox = globalThis.__originalMessageBox; });
  await closeHeldPort();
  report.checks.push('Own service termination + occupied saved port: native recovery chooses new port, data/theme/Chinese locale preserved');
  await application.close(); application = null;

  // Deny the complete checkout to the installed process and all descendants.
  // The test driver still runs outside that sandbox; the app cannot borrow
  // the checkout's .env, node_modules, static files or development server.
  const wrapper = path.join(temp, 'isolated-launch');
  const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
  const policy = `(version 1)(allow default)(deny file-read* (subpath ${JSON.stringify(process.cwd())}))`;
  await writeFile(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -p ${quote(policy)} ${quote(executable)} "$@"\n`, { mode: 0o755 });
  if (process.env.TOMTRADER_TRY_NESTED_SANDBOX === '1') {
    try {
      execFileSync(process.execPath, ['tools/smoke-desktop.mjs'], { env: { ...process.env, TOMTRADER_DESKTOP_EXECUTABLE: wrapper, TOMTRADER_DESKTOP_REPORT_DIR: 'test-results/rc/lifecycle/checkout-denied' }, stdio: 'inherit', timeout: 180_000 });
      report.checkoutDenial = { status: 'passed' };
    } catch {
      report.checkoutDenial = { status: 'blocked', reason: 'OS refuses nested Chromium sandbox initialization. Electron sandbox is NOT disabled to work around this.' };
    }
  } else {
    report.checkoutDenial = { status: 'blocked', reason: 'Already attempted on this host: nested sandbox initialization is not permitted. Evidence: test-results/rc/nested-sandbox-blocker.txt. Not counted as a pass.' };
  }
  execFileSync(process.execPath, ['tools/smoke-desktop.mjs'], { env: { ...process.env, TOMTRADER_DESKTOP_EXECUTABLE: executable, TOMTRADER_DESKTOP_REPORT_DIR: 'test-results/rc/lifecycle/independent-install' }, stdio: 'inherit', timeout: 180_000 });
  report.checks.push('Independent installed app passes smoke outside checkout with clean PATH and own bundled service/dependencies');

  // LaunchServices/Finder-equivalent entry (not direct executable invocation).
  const systemProfile = path.join(temp, '系统启动 用户'); await mkdir(systemProfile);
  const server = createServer(); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const debuggingPort = server.address().port; await new Promise((resolve) => server.close(resolve));
  execFileSync('open', ['-n', '-a', appBundle, '--env', `TOMTRADER_DESKTOP_TEST_PROFILE=${systemProfile}`, '--env', 'PATH=/usr/bin:/bin', '--args', '--smoke-test', `--remote-debugging-port=${debuggingPort}`]);
  await expect.poll(async () => { try { return (await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)).ok; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
  const processes = execFileSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' });
  const ownLine = processes.split('\n').find((line) => line.includes('/Contents/MacOS/TomTrader --smoke-test') && line.includes(`--remote-debugging-port=${debuggingPort}`));
  systemPid = ownLine ? Number(ownLine.trim().split(/\s+/)[0]) : undefined;
  systemBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
  await expect.poll(() => systemBrowser.contexts().flatMap((context) => context.pages()).filter((page) => page.url().startsWith('http://127.0.0.1:')).length, { timeout: 45_000 }).toBeGreaterThan(0);
  const systemPage = systemBrowser.contexts().flatMap((context) => context.pages()).find((page) => page.url().startsWith('http://127.0.0.1:'));
  await expect(systemPage.getByRole('heading', { level: 1, name: /Global Market Overview/ })).toBeVisible({ timeout: 30_000 });
  await systemPage.screenshot({ path: path.join(reportDir, 'system-entry-installed.png') });
  await systemPage.close(); await systemBrowser.close(); systemBrowser = null;
  if (systemPid) await expect.poll(() => { try { process.kill(systemPid, 0); return true; } catch { return false; } }, { timeout: 10_000 }).toBe(false);
  systemPid = null;
  report.checks.push('LaunchServices system entry starts independent installed app with no developer PATH');

  // Missing resources fail with a bounded actionable message, not an endless
  // blank window. Only this disposable install is temporarily altered.
  const service = path.join(appBundle, 'Contents/Resources/server');
  await rename(service, `${service}.disabled`);
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(executable, ['--smoke-test'], { env, cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
      let text = ''; child.stdout.on('data', (x) => { text += x; }); child.stderr.on('data', (x) => { text += x; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Missing-resource failure did not terminate')); }, 15_000);
      child.on('exit', () => { clearTimeout(timer); resolve(text); });
    });
    expect(result).toContain('installed local service is incomplete');
    report.checks.push('Missing-resource startup failure terminates within 15 seconds with reinstall/recovery message; no data clearing');
  } finally { await rename(`${service}.disabled`, service); }
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.message; throw error; }
finally {
  await writeFile(path.join(reportDir, 'acceptance.json'), JSON.stringify(report, null, 2));
  if (application) await application.close();
  if (systemBrowser) await systemBrowser.close().catch(() => {});
  if (systemPid) { try { process.kill(systemPid, 'SIGTERM'); } catch { /* Already exited. */ } }
  await closeHeldPort();
  await rm(temp, { recursive: true, force: true });
}
