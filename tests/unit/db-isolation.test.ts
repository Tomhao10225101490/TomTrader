import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('honors an explicit database filename instead of touching the default user database', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tomtrader-db-'));
  const file = path.join(dir, 'nested', 'isolated.db');
  try {
    const script = "import {getDb,dbPath} from './src/server/db.ts'; getDb(); console.log(dbPath());";
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: process.cwd(), env: { ...process.env, TOMTRADER_DB: file }, encoding: 'utf8', timeout: 10000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(file);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
