/** Isolated native regression: backup safety and Mac closed-window activation. */
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

const scratch = await mkdtemp(path.join(os.tmpdir(), 'tomtrader-native-backup-'));
const profile = path.join(scratch, 'profile');
const reportDirectory = path.resolve('test-results/desktop-backup');
await mkdir(reportDirectory, { recursive: true });
await rm(path.join(reportDirectory, 'acceptance.json'), { force: true });
const checks = [];
let application;
try {
  application = await electron.launch({
    args: [process.cwd(), '--smoke-test'], cwd: os.tmpdir(), timeout: 90000,
    env: { ...process.env, TOMTRADER_DESKTOP_TEST_PROFILE: profile },
  });
  let page = await application.firstWindow({ timeout: 90000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60000 });
  const status = await page.evaluate(async () => (await fetch('/api/status')).json());
  expect(status.demoMode).toBe(true);
  expect(status.dbPath).toBe(path.join(profile, 'data', 'demo.db'));
  const pid = status.runtime.pid;
  const dbBefore = await readFile(status.dbPath);
  await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, status.dbPath);
  const protectedResult = await page.evaluate(async () => {
    try { await window.tomtraderDesktop.backup(); return 'unexpected success'; }
    catch (error) { return error.message; }
  });
  expect(protectedResult).toContain('outside the running TomTrader profile');
  expect(await readFile(status.dbPath)).toEqual(dbBefore);
  checks.push('native backup rejects replacing the running database');

  // The File menu reports a backup failure, not a service reconnect prompt.
  await application.evaluate(({ Menu, dialog }) => {
    globalThis.__backupMessages = [];
    dialog.showMessageBox = async (...args) => { globalThis.__backupMessages.push(args.at(-1)); return { response: 0 }; };
    const file = Menu.getApplicationMenu().items.find((item) => item.label === 'File');
    file.submenu.items.find((item) => item.label === 'Back up database…').click();
  });
  await expect.poll(() => application.evaluate(() => globalThis.__backupMessages.length)).toBe(1);
  expect(await application.evaluate(() => globalThis.__backupMessages[0].title)).toContain('Backup failed');
  expect(await page.evaluate(async () => (await (await fetch('/api/status')).json()).runtime.pid)).toBe(pid);
  checks.push('backup error uses a dedicated native dialog without restarting the service');

  const output = path.join(scratch, 'backup.db');
  await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, output);
  expect(await page.evaluate(() => window.tomtraderDesktop.backup())).toEqual({ ok: true });
  const backup = new DatabaseSync(output);
  expect(backup.prepare('PRAGMA quick_check').get().quick_check).toBe('ok');
  backup.close();
  const complete = await readFile(output);
  checks.push('native bridge exports a valid complete SQLite snapshot');

  await application.evaluate(() => {
    const fs = process.getBuiltinModule('node:fs');
    globalThis.__backupWrite = fs.writeFileSync;
    fs.writeFileSync = function (file, ...args) {
      if (typeof file === 'number') {
        globalThis.__backupWrite(file, Buffer.from('partial output'));
        throw new Error('Injected backup disk-full failure');
      }
      return globalThis.__backupWrite(file, ...args);
    };
  });
  try {
    const diskResult = await page.evaluate(async () => {
      try { await window.tomtraderDesktop.backup(); return 'unexpected success'; }
      catch (error) { return error.message; }
    });
    expect(diskResult).toContain('Injected backup disk-full failure');
  } finally {
    await application.evaluate(() => { process.getBuiltinModule('node:fs').writeFileSync = globalThis.__backupWrite; });
  }
  expect(await readFile(output)).toEqual(complete);
  expect((await readdir(scratch)).filter((name) => name.includes('.tmp'))).toEqual([]);
  checks.push('partial disk-write failure keeps the earlier backup intact and removes temporary output');

  if (process.platform === 'darwin') {
    // --smoke-test intentionally quits on last-window-close; exercise the
    // second-instance event with an owned closing window before that policy.
    await application.evaluate(({ app, BrowserWindow }) => {
      app.removeAllListeners('window-all-closed');
      return new Promise((resolve) => {
        const target = BrowserWindow.getAllWindows()[0];
        target.once('closed', resolve);
        target.close();
      });
    });
    const reopened = application.waitForEvent('window');
    await application.evaluate(({ app }) => app.emit('second-instance', {}, [], process.cwd(), {}));
    page = await reopened;
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(async () => (await (await fetch('/api/status')).json()).runtime.pid)).toBe(pid);
    checks.push('Mac duplicate-launch event reopens the market window without another service');
  }
  await writeFile(path.join(reportDirectory, 'acceptance.json'), JSON.stringify({ mode: 'isolated development Electron and explicitly synthetic provider; no user profile or real price claims', checks, passed: true }, null, 2));
  await rm(path.join(reportDirectory, 'failure.json'), { force: true });
  console.log(`Native backup/activation regressions passed (${checks.length} checks).`);
} catch (error) {
  await writeFile(path.join(reportDirectory, 'failure.json'), JSON.stringify({ checks, error: error.message }, null, 2));
  throw error;
} finally {
  if (application) await application.close();
  await rm(scratch, { recursive: true, force: true });
}
