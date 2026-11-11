import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { GET } from '../../src/app/api/desktop-health/route';
const require = createRequire(import.meta.url);
const { reservePort, serverEnvironment, isInternalUrl, isExternalUrl } = require('../../desktop/runtime.cjs');

describe('desktop runtime boundaries', () => {
  it('allocates a loopback port', async () => {
    const port = await reservePort();
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThan(65536);
  });
  it('isolates desktop data and does not inherit web credentials or demo overrides', () => {
    const env = serverEnvironment({
      PATH: '/usr/bin', FINNHUB_API_KEY: 'private', TOMTRADER_DB: '/developer/private.db',
      TOMTRADER_DEMO: '1', NODE_OPTIONS: '--inspect', NEXT_PRIVATE_FOO: 'override',
    }, { port: 12345, dataDir: '/profile/data', mode: 'personal', token: 'nonce' });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.FINNHUB_API_KEY).toBeUndefined();
    expect(env.TOMTRADER_DB).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.NEXT_PRIVATE_FOO).toBeUndefined();
    expect(env.TOMTRADER_DATA_DIR).toBe('/profile/data');
    expect(env.HOSTNAME).toBe('127.0.0.1');
    expect(env.TOMTRADER_PUBLIC_FEEDS).toBe('1');
    expect(env.TOMTRADER_DEMO).toBe('0');
  });
  it('disables public feeds in demo mode', () => {
    const env = serverEnvironment({}, { port: 12345, dataDir: '/profile/data', mode: 'demo', token: 'nonce' });
    expect(env.TOMTRADER_PUBLIC_FEEDS).toBe('0');
    expect(env.TOMTRADER_DEMO).toBe('1');
  });
  it('allows only the actual app origin internally and HTTP(S) links externally', () => {
    expect(isInternalUrl('http://127.0.0.1:12345/stocks/test', 'http://127.0.0.1:12345')).toBe(true);
    for (const url of ['http://127.0.0.1:3100', 'https://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'invalid']) {
      expect(isInternalUrl(url, 'http://127.0.0.1:12345')).toBe(false);
    }
    expect(isExternalUrl('https://example.com')).toBe(true);
    for (const url of ['file:///tmp/a', 'javascript:alert(1)', 'data:text/html,x', 'ms-settings:test', 'invalid']) {
      expect(isExternalUrl(url)).toBe(false);
    }
  });
  it('does not expose the startup handshake on ordinary web installs', async () => {
    const original = process.env.TOMTRADER_DESKTOP_TOKEN;
    try {
      delete process.env.TOMTRADER_DESKTOP_TOKEN;
      expect(GET(new Request('http://localhost/api/desktop-health')).status).toBe(404);
      process.env.TOMTRADER_DESKTOP_TOKEN = 'nonce';
      expect(GET(new Request('http://localhost/api/desktop-health')).status).toBe(404);
      const response = GET(new Request('http://localhost/api/desktop-health', { headers: { 'x-tomtrader-token': 'nonce' } }));
      expect(await response.json()).toMatchObject({ pid: process.pid, node: process.versions.node });
    } finally {
      if (original === undefined) delete process.env.TOMTRADER_DESKTOP_TOKEN;
      else process.env.TOMTRADER_DESKTOP_TOKEN = original;
    }
  });
});
