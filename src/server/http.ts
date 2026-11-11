/**
 * Outbound HTTP for market-data vendors.
 *
 * Every vendor call in TomTrader goes through this module, which gives us:
 *  - a hard timeout per request (with abort propagation)
 *  - a per-host concurrency + minimum-interval limiter, so we cannot storm a
 *    free tier into a 429 or breach a published rate policy by accident
 *  - a single shared retry policy that honours Retry-After
 *  - single-flight de-duplication of identical in-flight requests
 *  - a health record per host that the Settings page surfaces
 */

export interface HttpOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Max attempts. 1 = no retry. */
  retries?: number;
  /** Skip the limiter queue (used for bulk background refreshes). */
  priority?: boolean;
  query?: Record<string, string | number | undefined>;
  /** Explicit decoding for public feeds such as Tencent's GBK payload. */
  responseEncoding?: 'utf-8' | 'gb18030';
}

export interface HttpOk {
  status: number;
  body: string;
  json: <T = unknown>() => T;
  headers: Headers;
}

export type HttpError = {
  kind: 'timeout' | 'network' | 'http' | 'rate-limit' | 'parse';
  status?: number;
  message: string;
  retryAfterMs?: number;
  attempts: number;
};

export type HttpResult = { ok: true; res: HttpOk } | { ok: false; error: HttpError };

export interface RawResponse {
  status: number;
  headers: Headers;
  body: string;
}
export type RawResult = { ok: true; res: RawResponse } | { ok: false; error: HttpError };

interface HostPolicy {
  /** Parallel requests allowed to this host. */
  maxConcurrent: number;
  /** Minimum spacing between the *start* of successive requests. */
  minIntervalMs: number;
  /** Backoff applied after a rate-limit, doubled per consecutive hit. */
  penaltyBaseMs: number;
  /** Ceiling on any single penalty window. */
  penaltyCapMs?: number;
}

const DEFAULT_PENALTY_CAP_MS = 15_000;

const POLICIES: Record<string, HostPolicy> = {
  // Yahoo's unofficial endpoints publish no quota. We stay at roughly one
  // request every 350ms with 2 in flight, which has held up under load.
  'query1.finance.yahoo.com': { maxConcurrent: 2, minIntervalMs: 350, penaltyBaseMs: 4_000 } as HostPolicy,
  'query2.finance.yahoo.com': { maxConcurrent: 2, minIntervalMs: 350, penaltyBaseMs: 4_000 },
  'quoteapi.finance.yahoo.com': { maxConcurrent: 2, minIntervalMs: 400, penaltyBaseMs: 4_000 },
  'finance.yahoo.com': { maxConcurrent: 2, minIntervalMs: 400, penaltyBaseMs: 4_000 },
  // Eastmoney's public web endpoints tolerate a batch every request; we keep
  // them serial and spaced so we never look like a scraper.
  'push2.eastmoney.com': { maxConcurrent: 1, minIntervalMs: 1_000, penaltyBaseMs: 30_000 },
  'push2his.eastmoney.com': { maxConcurrent: 1, minIntervalMs: 1_000, penaltyBaseMs: 30_000 },
  'open.er-api.com': { maxConcurrent: 1, minIntervalMs: 200, penaltyBaseMs: 5_000 },
  'fc.yahoo.com': { maxConcurrent: 1, minIntervalMs: 1_000, penaltyBaseMs: 3_000, penaltyCapMs: 8_000 },
  'web.ifzq.gtimg.cn': { maxConcurrent: 1, minIntervalMs: 1_000, penaltyBaseMs: 30_000 },
  'qt.gtimg.cn': { maxConcurrent: 1, minIntervalMs: 1_000, penaltyBaseMs: 30_000 },
  'finnhub.io': { maxConcurrent: 1, minIntervalMs: 2_100, penaltyBaseMs: 60_000, penaltyCapMs: 60_000 },
  default: { maxConcurrent: 2, minIntervalMs: 200, penaltyBaseMs: 3_000, penaltyCapMs: 12_000 },
};

interface PendingAcquisition {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface HostState {
  running: number;
  lastStart: number;
  /**
   * Two queues. Interactive work (a request a person is waiting on) drains
   * before background work (the sparkline pre-warm, the poller's own refresh).
   * With one FIFO queue, boot-time pre-warming 25 index histories on a
   * single-lane feed put every user request behind six seconds of queue —
   * which is exactly what this fix came from.
   */
  high: PendingAcquisition[];
  low: PendingAcquisition[];
  wakeTimer: ReturnType<typeof setTimeout> | null;
  penaltyUntil: number;
  consecutivePenalties: number;
}

const hostStates = new Map<string, HostState>();

function stateFor(host: string): HostState {
  let s = hostStates.get(host);
  if (!s) {
    s = { running: 0, lastStart: 0, high: [], low: [], wakeTimer: null, penaltyUntil: 0, consecutivePenalties: 0 };
    hostStates.set(host, s);
  }
  return s;
}

/** One FIFO queue per priority; a granted waiter owns its slot before it wakes. */
async function acquire(host: string, priority: boolean, deadlineMs = 10_000): Promise<void> {
  const state = stateFor(host);
  return new Promise<void>((resolve, reject) => {
    const queue = priority ? state.high : state.low;
    const pending: PendingAcquisition = {
      resolve, reject,
      timer: setTimeout(() => {
        const index = queue.indexOf(pending);
        if (index < 0) return;
        queue.splice(index, 1);
        reject(new CooldownError(host, Math.max(0, state.penaltyUntil - Date.now())));
        drainHost(host);
      }, deadlineMs),
    };
    queue.push(pending);
    drainHost(host);
  });
}

function drainHost(host: string): void {
  const state = stateFor(host);
  const policy = POLICIES[host] ?? POLICIES.default;
  if (state.wakeTimer) { clearTimeout(state.wakeTimer); state.wakeTimer = null; }
  while (state.running < policy.maxConcurrent && (state.high.length || state.low.length)) {
    const now = Date.now();
    const wait = Math.max(0, state.penaltyUntil - now, state.lastStart + policy.minIntervalMs - now);
    if (wait > 0) {
      state.wakeTimer = setTimeout(() => { state.wakeTimer = null; drainHost(host); }, wait);
      return;
    }
    const next = state.high.shift() ?? state.low.shift();
    if (!next) return;
    clearTimeout(next.timer);
    state.running++;
    state.lastStart = Date.now();
    next.resolve();
  }
}

function release(host: string): void {
  const state = stateFor(host);
  state.running = Math.max(0, state.running - 1);
  drainHost(host);
}

function penalise(host: string, retryAfterMs: number | undefined): number {
  const policy = POLICIES[host] ?? POLICIES.default;
  const state = stateFor(host);
  state.consecutivePenalties += 1;
  const backoff = Math.max(retryAfterMs ?? 0, policy.penaltyBaseMs * 2 ** (state.consecutivePenalties - 1));
  // A penalty longer than a request budget is a lie: the caller has already
  // given up waiting, so cap it and let the next caller see the cooldown.
  const capped = Math.max(retryAfterMs ?? 0, Math.min(backoff, policy.penaltyCapMs ?? DEFAULT_PENALTY_CAP_MS));
  state.penaltyUntil = Date.now() + capped;
  return capped;
}

export function hostHealthSnapshot(): Record<string, { running: number; queued: number; coolingDownMs: number }> {
  const out: Record<string, { running: number; queued: number; coolingDownMs: number }> = {};
  const now = Date.now();
  for (const [host, s] of hostStates) {
    out[host] = {
      running: s.running,
      queued: s.high.length + s.low.length,
      coolingDownMs: Math.max(0, s.penaltyUntil - now),
    };
  }
  return out;
}

export function noteSuccess(host: string): void {
  const s = stateFor(host);
  if (s.penaltyUntil <= Date.now()) { s.consecutivePenalties = 0; s.penaltyUntil = 0; }
}

/* ------------------------------------------------------------ single-flight */

const inflight = new Map<string, Promise<HttpResult>>();

/* ------------------------------------------------------------------ request */

/**
 * Requests that a person is waiting for pass `priority: true`; the poller and
 * the boot pre-warm do not. The flag is also propagated through the single-
 * flight key so a background flight cannot make an interactive caller wait on
 * a low-priority queue position it inherited.
 */
export async function request(url: string, opts: HttpOptions = {}): Promise<HttpResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: { kind: 'parse', message: `invalid url: ${url}`, attempts: 0 } };
  }
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      // Empty values are meaningful to some vendors (Eastmoney's news list
      // requires `sortEnd=` to be *present*), so only undefined/null is skipped.
      if (v === undefined || v === null) continue;
      parsed.searchParams.set(k, String(v));
    }
  }
  const finalUrl = parsed.toString();
  const host = parsed.host;
  const key = finalUrl;

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = run(finalUrl, host, opts).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Request that reports the response even when the status is an error.
 * Needed for the Yahoo cookie handshake, where a 404 from fc.yahoo.com is the
 * documented way to obtain the consent cookie that the crumb endpoint wants.
 */
export async function raw(url: string, opts: HttpOptions = {}): Promise<RawResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: { kind: 'parse', message: `invalid url: ${url}`, attempts: 0 } };
  }
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      parsed.searchParams.set(k, String(v));
    }
  }
  const host = parsed.host;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxAttempts = Math.max(1, opts.retries ?? 2);
  let lastError: HttpError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await acquire(host, opts.priority === true, timeoutMs);
    } catch (e) {
      if (e instanceof CooldownError) return { ok: false, error: { kind: e.waitMs > 0 ? 'rate-limit' : 'timeout', message: e.waitMs > 0 ? `${host} is cooling down` : `${host} request queue exceeded its deadline`, retryAfterMs: e.waitMs, attempts: attempt } };
      throw e;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(parsed.toString(), {
        signal: ac.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Accept: '*/*',
          ...opts.headers,
        },
      });
      const body = opts.responseEncoding ? new TextDecoder(opts.responseEncoding).decode(await res.arrayBuffer()) : await res.text();
      if (res.status === 429 || res.status === 403) {
        const wait = penalise(host, parseRetryAfter(res.headers.get('retry-after')));
        return { ok: false, error: { kind: 'rate-limit', status: res.status, message: `${res.status} from ${host}`, retryAfterMs: wait, attempts: attempt } };
      }
      noteSuccess(host);
      return { ok: true, res: { status: res.status, headers: res.headers, body } };
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      lastError = {
        kind: aborted ? 'timeout' : 'network',
        message: aborted ? `timed out after ${timeoutMs}ms on ${host}` : String((e as Error)?.message ?? e),
        attempts: attempt,
      };
      if (aborted) penalise(host, undefined);
    } finally {
      clearTimeout(timer);
      release(host);
    }
  }
  return { ok: false, error: lastError ?? { kind: 'network', message: 'unreachable', attempts: maxAttempts } };
}

async function run(url: string, host: string, opts: HttpOptions): Promise<HttpResult> {
  const maxAttempts = Math.max(1, opts.retries ?? 3);
  const timeoutMs = opts.timeoutMs ?? 12_000;
  let lastError: HttpError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await acquire(host, opts.priority === true, timeoutMs);
    } catch (e) {
      if (e instanceof CooldownError) {
        return { ok: false, error: { kind: e.waitMs > 0 ? 'rate-limit' : 'timeout', message: e.waitMs > 0 ? `${host} is cooling down` : `${host} request queue exceeded its deadline`, retryAfterMs: e.waitMs, attempts: attempt } };
      }
      throw e;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
          ...opts.headers,
        },
      });
      const body = opts.responseEncoding ? new TextDecoder(opts.responseEncoding).decode(await res.arrayBuffer()) : await res.text();

      if (res.status === 429 || res.status === 403) {
        // Rate limited: penalise the host and return at once. Retrying inside
        // the same call is what turned a throttled vendor into a 60-second
        // request; the cooldown now lives on the host, not in a sleep loop.
        const ra = parseRetryAfter(res.headers.get('retry-after'));
        const wait = penalise(host, ra);
        return {
          ok: false,
          error: {
            kind: 'rate-limit',
            status: res.status,
            message: `${res.status} ${res.statusText} from ${host}`,
            retryAfterMs: wait,
            attempts: attempt,
          },
        };
      }

      if (res.status >= 500) {
        // A 5xx is the origin having a bad day, not us being too fast: retry
        // with our own backoff, but do NOT penalise the host. Doing that turned
        // one transient error into a cooldown that starved every later caller.
        lastError = {
          kind: 'http',
          status: res.status,
          message: `${res.status} ${res.statusText} from ${host}`,
          attempts: attempt,
        };
        if (attempt < maxAttempts) await sleep(Math.min(300 * 2 ** (attempt - 1), 1_500));
        continue;
      }

      if (!res.ok) {
        noteSuccess(host); // a clean 4xx is a real answer, not a feed problem
        return {
          ok: false,
          error: { kind: 'http', status: res.status, message: `${res.status} from ${host}`, attempts: attempt },
        };
      }

      noteSuccess(host);
      const headers = res.headers;
      return {
        ok: true,
        res: {
          status: res.status,
          body,
          headers,
          json: <T,>() => JSON.parse(body) as T,
        },
      };
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      lastError = {
        kind: aborted ? 'timeout' : 'network',
        message: aborted ? `timed out after ${timeoutMs}ms on ${host}` : String((e as Error)?.message ?? e),
        attempts: attempt,
      };
      if (aborted) penalise(host, undefined);
      if (attempt < maxAttempts) await sleep(Math.min(400 * 2 ** (attempt - 1), 4_000));
    } finally {
      clearTimeout(timer);
      release(host);
    }
  }

  return { ok: false, error: lastError ?? { kind: 'network', message: 'unreachable', attempts: maxAttempts } };
}

export async function fetchJson<T>(url: string, opts: HttpOptions = {}): Promise<{ ok: true; data: T } | { ok: false; error: HttpError }> {
  const r = await request(url, opts);
  if (!r.ok) return { ok: false, error: r.error };
  try {
    return { ok: true, data: r.res.json<T>() };
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'parse', message: `bad JSON from ${new URL(url).host}: ${String((e as Error).message)}`, attempts: 1 },
    };
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/** Thrown when a host's cooldown would outlast the caller's own budget. */
export class CooldownError extends Error {
  readonly waitMs: number;
  constructor(host: string, waitMs: number) {
    super(`${host} cooling down for ${waitMs}ms`);
    this.name = 'CooldownError';
    this.waitMs = waitMs;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Drops limiter state. Tests that exercise throttling would otherwise poison
 * every later request to the same origin within the worker.
 */
export function resetHostStatesForTests(): void {
  for (const state of hostStates.values()) {
    if (state.wakeTimer) clearTimeout(state.wakeTimer);
    for (const pending of [...state.high, ...state.low]) { clearTimeout(pending.timer); pending.reject(new Error('HTTP limiter reset')); }
  }
  hostStates.clear();
  inflight.clear();
}

/** Number of requests currently waiting or running, for tests and diagnostics. */
export function queueDepth(): number {
  let n = 0;
  for (const s of hostStates.values()) n += s.running + s.high.length + s.low.length;
  return n;
}
