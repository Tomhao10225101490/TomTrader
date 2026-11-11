import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { writeBackup, isProtectedBackupPath } = require('../../desktop/runtime.cjs');
const directories: string[] = [];
function directory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomtrader-backup-'));
  directories.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('native backup destination safety', () => {
  it('refuses active profile files through literal and symlinked directories', () => {
    const root = directory();
    const profile = path.join(root, 'profile');
    fs.mkdirSync(path.join(profile, 'data'), { recursive: true });
    const alias = path.join(root, 'alias');
    fs.symlinkSync(profile, alias, process.platform === 'win32' ? 'junction' : 'dir');
    for (const relative of ['data/tomtrader.db', 'data/tomtrader.db-wal', 'data/demo.db', 'desktop-settings.json']) {
      expect(isProtectedBackupPath(path.join(profile, relative), profile)).toBe(true);
      expect(isProtectedBackupPath(path.join(alias, relative), profile)).toBe(true);
    }
    expect(isProtectedBackupPath(path.join(root, 'profile-copy.db'), profile)).toBe(false);
    expect(isProtectedBackupPath(path.join(root, 'backup.db'), profile)).toBe(false);
  });

  it('completes a private snapshot before replacing the chosen backup', () => {
    const dir = directory();
    const target = path.join(dir, 'backup.db');
    fs.writeFileSync(target, 'earlier complete backup');
    writeBackup(target, Buffer.from('new complete snapshot'));
    expect(fs.readFileSync(target, 'utf8')).toBe('new complete snapshot');
    expect(fs.readdirSync(dir)).toEqual(['backup.db']);
    if (process.platform !== 'win32') expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  it('retains the earlier backup and cleans partial output after a disk write failure', () => {
    const dir = directory();
    const target = path.join(dir, 'backup.db');
    fs.writeFileSync(target, 'earlier complete backup');
    const original = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((file, _bytes) => {
      original(file, 'partial snapshot');
      throw new Error('simulated disk full');
    });
    expect(() => writeBackup(target, Buffer.from('new complete snapshot'))).toThrow('simulated disk full');
    expect(fs.readFileSync(target, 'utf8')).toBe('earlier complete backup');
    expect(fs.readdirSync(dir)).toEqual(['backup.db']);
  });

  it('retains the earlier backup if destination replacement fails', () => {
    const dir = directory();
    const target = path.join(dir, 'backup.db');
    fs.writeFileSync(target, 'earlier complete backup');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('simulated permission denial'); });
    expect(() => writeBackup(target, Buffer.from('new complete snapshot'))).toThrow('simulated permission denial');
    expect(fs.readFileSync(target, 'utf8')).toBe('earlier complete backup');
    expect(fs.readdirSync(dir)).toEqual(['backup.db']);
  });
});
