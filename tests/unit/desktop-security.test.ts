import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../src/proxy';
import { migrate } from '../../src/server/db';
import { redact } from '../../src/server/redact';
const require = createRequire(import.meta.url);
const { createCredentialStore } = require('../../desktop/credentials.cjs');
const directories: string[] = [];
function directory() { const dir = mkdtempSync(path.join(tmpdir(), 'tomtrader-security-')); directories.push(dir); return dir; }
afterEach(() => { vi.unstubAllEnvs(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('desktop session gate', () => {
  it('rejects unauthenticated reads, mutations, streams and static files', () => {
    vi.stubEnv('TOMTRADER_DESKTOP_TOKEN', 'random-session-secret');
    vi.stubEnv('PORT', '43123');
    for (const url of ['/api/watchlist', '/api/status', '/api/stream', '/_next/static/app.js', '/']) {
      expect(proxy(new NextRequest(`http://127.0.0.1:43123${url}`)).status).toBe(401);
      expect(proxy(new NextRequest(`http://127.0.0.1:43123${url}`, { method: 'POST', headers: { 'x-tomtrader-token': 'wrong' } })).status).toBe(401);
    }
    expect(proxy(new NextRequest('http://127.0.0.1:43123/api/watchlist', { headers: { 'x-tomtrader-token': 'random-session-secret' } })).status).toBe(200);
    expect(proxy(new NextRequest('http://127.0.0.1:43123/api/watchlist', { headers: { 'x-tomtrader-token': 'random-session-secret', origin: 'https://hostile.example' } })).status).toBe(403);
  });
  it('does not silently turn the ordinary web server into a desktop instance', () => {
    vi.stubEnv('TOMTRADER_DESKTOP_TOKEN', '');
    expect(proxy(new NextRequest('http://localhost:3100/')).status).toBe(200);
  });
});

describe('credential storage protocol fixtures (not real Finnhub verification)', () => {
  it('encrypts persisted keys and never returns them in status', async () => {
    const dir = directory();
    const secure = { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async (s: string) => Buffer.from(`encrypted:${s}`), decryptStringAsync: async (b: Buffer) => ({ result: b.toString().slice(10), shouldReEncrypt: false }) };
    const store = await createCredentialStore(dir, secure);
    await store.set('fixture-api-key-1234', true);
    expect(readFileSync(path.join(dir, 'desktop-settings.json'), 'utf8')).not.toContain('fixture-api-key-1234');
    expect(store.status()).toMatchObject({ configured: true, persistent: true });
    expect(JSON.stringify(store.status())).not.toContain('fixture-api-key-1234');
    expect((await createCredentialStore(dir, secure)).get()).toBe('fixture-api-key-1234');
    store.forget();
    expect(store.get()).toBe('');
  });
  it('public feeds and session-only keys never wait for a native Keychain permission probe', async () => {
    const probe = vi.fn(() => new Promise<boolean>(() => {}));
    const store = await createCredentialStore(directory(), { isAsyncEncryptionAvailable: probe });
    expect(store.status()).toMatchObject({ secureStorage: false, secureStorageChecked: false });
    await store.set('fixture-api-key-1234', false);
    expect(store.get()).toBe('fixture-api-key-1234');
    expect(store.status().persistent).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
  it('refuses plaintext fallback but permits session-only credentials', async () => {
    const dir = directory();
    const store = await createCredentialStore(dir, { isAsyncEncryptionAvailable: async () => false });
    await expect(store.set('fixture-api-key-1234', true)).rejects.toThrow(/Session|session/);
    await store.set('fixture-api-key-1234', false);
    expect(store.get()).toBe('fixture-api-key-1234');
    expect(readFileSync(path.join(dir, 'desktop-settings.json'), 'utf8')).not.toContain('fixture-api-key-1234');
    expect((await createCredentialStore(dir, { isAsyncEncryptionAvailable: async () => false })).get()).toBe('');
  });
  it('redacts keys and session tokens before diagnostics', () => {
    vi.stubEnv('FINNHUB_API_KEY', 'fixture-api-key-1234');
    vi.stubEnv('TOMTRADER_DESKTOP_TOKEN', 'session-nonce');
    expect(redact('fixture-api-key-1234 session-nonce token=anything')).not.toMatch(/fixture-api-key-1234|session-nonce|anything/);
  });
});

describe('non-destructive database upgrades', () => {
  it('opens version 1 without clearing lists, holdings, alerts, or ordering', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    db.exec("INSERT INTO watchlist_group VALUES ('test','saved','[\"equity:US:AAPL\"]','[]',0,0,0)");
    migrate(db);
    expect(db.prepare('SELECT name FROM watchlist_group').get()?.name).toBe('saved');
    db.exec("UPDATE kv SET value='99' WHERE key='schema_version'");
    expect(() => migrate(db)).toThrow(/Unsupported database version/);
    expect(db.prepare('SELECT name FROM watchlist_group').get()?.name).toBe('saved');
    db.close();
  });
  it('backs up existing unversioned databases before migration, including WAL state', () => {
    const filename = path.join(directory(), 'legacy.db');
    const db = new DatabaseSync(filename);
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE personal_note(value TEXT); INSERT INTO personal_note VALUES ('retained')");
    migrate(db, filename);
    expect(db.prepare('SELECT value FROM personal_note').get()?.value).toBe('retained');
    expect(db.prepare("SELECT value FROM kv WHERE key='schema_version'").get()?.value).toBe('1');
    db.close();
  });
});
