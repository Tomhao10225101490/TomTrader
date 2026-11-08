import { CooldownError,fetchJson,hostHealthSnapshot,queueDepth,raw,request,resetHostStatesForTests } from '@/server/http';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';

/**
 * A throwaway origin so retry, timeout and rate-limit behaviour can be
 * asserted without touching a real vendor.
 */
let server: http.Server;
let base = '';
let hits: Record<string, number> = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const key = url.pathname;
    hits[key] = (hits[key] ?? 0) + 1;
    switch (key) {
      case '/ok':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, n: 1 }));
        return;
      case '/gbk':
        res.writeHead(200, { 'content-type': 'text/plain; charset=gbk' });
        res.end(Buffer.from([0xcc, 0xda, 0xd1, 0xb6]));
        return;
      case '/text':
        res.writeHead(200);
        res.end('plain body');
        return;
      case '/bad-json':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('not json at all {');
        return;
      case '/not-found':
        res.writeHead(404);
        res.end('nope');
        return;
      case '/throttled':
        res.writeHead(429, { 'retry-after': '1' });
        res.end('slow down');
        return;
      case '/flaky':
        if (hits['/flaky'] < 3) {
          res.writeHead(503);
          res.end('busy');
        } else {
          res.writeHead(200);
          res.end('recovered');
        }
        return;
      case '/slow':
        setTimeout(() => {
          res.writeHead(200);
          res.end('late');
        }, 2_000);
        return;
      default:
        res.writeHead(200);
        res.end('default');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('outbound http', () => {
  beforeEach(() => {
    resetHostStatesForTests();
    hits = {};
  });

  it('returns a parsed body on success', async () => {
    const res = await fetchJson<{ ok: boolean }>(`${base}/ok`);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.ok).toBe(true);
  });

  it('treats a 4xx as a real answer, not a feed failure', async () => {
    const res = await request(`${base}/not-found`, { retries: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('http');
      expect(res.error.status).toBe(404);
      expect(hostHealthSnapshot()[new URL(base).host].coolingDownMs).toBe(0);
    }
  });

  it('reports malformed JSON as a parse error', async () => {
    const res = await fetchJson(`${base}/bad-json`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('parse');
  });

  it('gives up immediately on a 429 instead of retrying into a hole', async () => {
    const before = hits['/throttled'] ?? 0;
    const res = await request(`${base}/throttled`, { retries: 3, timeoutMs: 4_000 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('rate-limit');
      expect(res.error.retryAfterMs).toBeGreaterThan(0);
    }
    expect(hits['/throttled'] - before).toBe(1);
  });

  it('applies a host cooldown after throttling', async () => {
    await request(`${base}/throttled`, { retries: 1 });
    const snap = hostHealthSnapshot()[`${new URL(base).host}`];
    expect(snap.coolingDownMs).toBeGreaterThan(0);
  });

  it('retries a 5xx and succeeds when the origin recovers', async () => {
    hits['/flaky'] = 0;
    const res = await request(`${base}/flaky`, { retries: 4, timeoutMs: 4_000 });
    expect(res.ok).toBe(true);
    expect(hits['/flaky']).toBeGreaterThanOrEqual(3);
  });

  it('aborts at its own deadline', async () => {
    const started = Date.now();
    const res = await request(`${base}/slow`, { retries: 1, timeoutMs: 400 });
    expect(Date.now() - started).toBeLessThan(1_600);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('timeout');
  });

  it('de-duplicates two simultaneous identical requests', async () => {
    hits = {};
    const [a, b] = await Promise.all([request(`${base}/ok`), request(`${base}/ok`)]);
    expect(a.ok && b.ok).toBe(true);
    expect(hits['/ok']).toBe(1);
  });

  it('exposes a queue depth the pre-warm can watch before barging in', async () => {
    expect(queueDepth()).toBeGreaterThanOrEqual(0);
  });

  it('exports a typed cooldown error for callers that need it', () => {
    const e = new CooldownError('example', 500);
    expect(e.waitMs).toBe(500);
    expect(e.message).toContain('example');
  });
});


describe('free-feed request scheduling regressions', () => {
  it('drains multiple queued histories without waiters blocking one another', async () => {
    resetHostStatesForTests();
    const results = await Promise.all(Array.from({ length: 6 }, (_, n) => request(`${base}/ok?queue=${n}`, { timeoutMs: 2500, retries: 1 })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(queueDepth()).toBe(0);
  });
  it('decodes GBK public quote payloads correctly', async () => {
    resetHostStatesForTests();
    const result = await raw(`${base}/gbk`, { responseEncoding: 'gb18030', retries: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.res.body).toBe('腾讯');
  });
  it('honors refusals in raw feeds instead of treating an error page as quotes', async () => {
    resetHostStatesForTests();
    const result = await raw(`${base}/throttled`, { retries: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('rate-limit');
  });
});
