import { getDb } from './db';
import type { Bars,FxRate,InstrumentMetadata,NewsItem,Quote } from './types';

/**
 * Two-tier response cache.
 *
 *  Tier 1 — memory, with a TTL. Everything goes through `singleFlight`, so two
 *           components asking for the same instrument at the same instant
 *           produce exactly one vendor request.
 *  Tier 2 — SQLite, written on every successful fetch. This is what makes the
 *           "open the app and see something within a second" requirement work:
 *           a cold start reads tier 2, labels those values `cached`, and the
 *           background poller upgrades them as soon as the vendor answers.
 */

export type CacheKind = 'quote' | 'bars' | 'meta' | 'search' | 'fx' | 'news';

interface Entry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
  /** Provider that produced it, surfaced in the data-status panel. */
  provider: string;
}

const memory = new Map<string, { kind: CacheKind; entry: Entry<unknown> }>();
const flights = new Map<string, Promise<unknown>>();

export const TTL = {
  quoteOpen: 15_000,
  quoteOpenCn: 8_000,
  quoteClosed: 30 * 60_000,
  barsIntradayOpen: 30_000,
  barsIntradayClosed: 30 * 60_000,
  barsDailyOpen: 5 * 60_000,
  barsDailyClosed: 6 * 60 * 60_000,
  meta: 12 * 60 * 60_000,
  search: 10 * 60_000,
  searchMiss: 60_000,
  fx: 24 * 60 * 60_000,
  news: 5 * 60_000,
} as const;

export function memorySize(): number {
  return memory.size;
}

export function cacheStats(): { entries: number; byKind: Record<string, number>; flights: number } {
  const byKind: Record<string, number> = {};
  for (const [, v] of memory) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
  return { entries: memory.size, byKind, flights: flights.size };
}

export function peek<T>(kind: CacheKind, key: string, _now = Date.now()): Entry<T> | null {
  const hit = memory.get(`${kind}:${key}`);
  if (!hit) return null;
  return hit.entry as Entry<T>;
}

export function put<T>(kind: CacheKind, key: string, value: T, ttlMs: number, provider: string, now = Date.now()): Entry<T> {
  const entry = { value, storedAt: now, expiresAt: now + ttlMs, provider };
  memory.set(`${kind}:${key}`, { kind, entry: entry as Entry<unknown> });
  return entry;
}

export function invalidatePrefix(prefix: string): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

export function clearMemoryCache(): void {
  memory.clear();
  flights.clear();
}

/**
 * Run `fn` at most once per key at a time, honouring a live TTL entry.
 * `staleOk` returns an expired memory entry (or the persisted one) instead of
 * waiting for the network, and schedules a refresh in the background.
 */
export async function cached<T>(
  kind: CacheKind,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  provider: string,
  opts: { staleOk?: boolean; persist?: (value: T) => void } = {},
): Promise<{ value: T; fromCache: boolean; stale: boolean }> {
  const now = Date.now();
  const existing = peek<T>(kind, key, now);

  if (existing && existing.expiresAt > now) {
    return { value: existing.value, fromCache: true, stale: false };
  }

  if (opts.staleOk && existing) {
    // Serve the old value now; refresh behind the request.
    void refreshFlight(kind, key, fn, ttlMs, provider, opts.persist);
    return { value: existing.value, fromCache: true, stale: true };
  }

  if (opts.staleOk && !existing) {
    const persisted = restore<T>(kind, key);
    if (persisted !== null) {
      put(kind, key, persisted.value, 0, persisted.provider, persisted.storedAt);
      void refreshFlight(kind, key, fn, ttlMs, provider, opts.persist);
      return { value: persisted.value, fromCache: true, stale: true };
    }
  }

  const value = await refreshFlight(kind, key, fn, ttlMs, provider, opts.persist);
  return { value, fromCache: false, stale: false };
}

async function refreshFlight<T>(
  kind: CacheKind,
  key: string,
  fn: () => Promise<T>,
  ttlMs: number,
  provider: string,
  persist?: (value: T) => void,
): Promise<T> {
  const flightKey = `${kind}:${key}`;
  const existing = flights.get(flightKey) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    const value = await fn();
    put(kind, key, value, ttlMs, provider);
    try {
      persist?.(value);
    } catch {
      /* persistence must never fail a read */
    }
    return value;
  })().finally(() => flights.delete(flightKey));

  flights.set(flightKey, p);
  return p;
}

/* ----------------------------------------------------------- persistence */

interface Persisted<T> {
  value: T;
  storedAt: number;
  provider: string;
}

/** Load the last known values for these ids straight out of SQLite. */
export function restoreQuotes(ids: string[]): Map<string, Persisted<Quote>> {
  const out = new Map<string, Persisted<Quote>>();
  if (ids.length === 0) return out;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT instrument_id, payload, received_at, provider FROM quote_cache WHERE instrument_id IN (${placeholders})`)
    .all(...ids) as { instrument_id: string; payload: string; received_at: number; provider: string }[];
  for (const row of rows) {
    if (!matchingDataMode(row.provider)) continue;
    try {
      out.set(row.instrument_id, { value: JSON.parse(row.payload) as Quote, storedAt: row.received_at, provider: row.provider });
    } catch {
      /* ignore one bad row */
    }
  }
  return out;
}

export function persistQuote(q: Quote): void {
  getDb()
    .prepare(
      `INSERT INTO quote_cache (instrument_id, payload, exchange_ts, received_at, provider)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(instrument_id) DO UPDATE SET
         payload = excluded.payload,
         exchange_ts = excluded.exchange_ts,
         received_at = excluded.received_at,
         provider = excluded.provider`,
    )
    .run(q.instrumentId, JSON.stringify(q), q.exchangeTimestamp, q.receivedAt, q.provider);
}

export function persistAll(quotes: Quote[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO quote_cache (instrument_id, payload, exchange_ts, received_at, provider)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(instrument_id) DO UPDATE SET
       payload = excluded.payload, exchange_ts = excluded.exchange_ts,
       received_at = excluded.received_at, provider = excluded.provider`,
  );
  db.exec('BEGIN');
  try {
    for (const q of quotes) {
      if (!Number.isFinite(q.last)) continue;
      stmt.run(q.instrumentId, JSON.stringify(q), q.exchangeTimestamp, q.receivedAt, q.provider);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function restoreBars(id: string, range: string, interval: string): Persisted<Bars> | null {
  const row = getDb()
    .prepare('SELECT payload, received_at, provider FROM bars_cache WHERE instrument_id = ? AND range = ? AND interval = ?')
    .get(id, range, interval) as { payload: string; received_at: number; provider: string } | undefined;
  if (!row || !matchingDataMode(row.provider)) return null;
  try {
    return { value: JSON.parse(row.payload) as Bars, storedAt: row.received_at, provider: row.provider };
  } catch {
    return null;
  }
}

export function persistBars(bars: Bars): void {
  getDb()
    .prepare(
      `INSERT INTO bars_cache (instrument_id, range, interval, payload, last_bar_at, received_at, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(instrument_id, range, interval) DO UPDATE SET
         payload = excluded.payload, last_bar_at = excluded.last_bar_at,
         received_at = excluded.received_at, provider = excluded.provider`,
    )
    .run(bars.instrumentId, bars.range, bars.interval, JSON.stringify(bars), bars.meta.lastBarAt, bars.meta.receivedAt, bars.meta.provider);
}

export function restoreMeta(id: string): Persisted<InstrumentMetadata> | null {
  const row = getDb()
    .prepare('SELECT payload, received_at, provider FROM meta_cache WHERE instrument_id = ?')
    .get(id) as { payload: string; received_at: number; provider: string } | undefined;
  if (!row || !matchingDataMode(row.provider)) return null;
  try {
    return { value: JSON.parse(row.payload) as InstrumentMetadata, storedAt: row.received_at, provider: row.provider };
  } catch {
    return null;
  }
}

export function persistMeta(meta: InstrumentMetadata): void {
  getDb()
    .prepare(
      `INSERT INTO meta_cache (instrument_id, payload, received_at, provider) VALUES (?, ?, ?, ?)
       ON CONFLICT(instrument_id) DO UPDATE SET payload = excluded.payload, received_at = excluded.received_at, provider = excluded.provider`,
    )
    .run(meta.instrumentId, JSON.stringify(meta), meta.receivedAt, meta.provider);
}

export function restoreFx(base: string): Persisted<FxRate> | null {
  const row = getDb()
    .prepare('SELECT payload, received_at FROM fx_cache WHERE base = ?')
    .get(base) as { payload: string; received_at: number } | undefined;
  if (!row) return null;
  try {
    return { value: JSON.parse(row.payload) as FxRate, storedAt: row.received_at, provider: 'fx-open.er-api' };
  } catch {
    return null;
  }
}

export function persistFx(rate: FxRate): void {
  getDb()
    .prepare('INSERT INTO fx_cache (base, payload, received_at) VALUES (?, ?, ?) ON CONFLICT(base) DO UPDATE SET payload = excluded.payload, received_at = excluded.received_at')
    .run(rate.base, JSON.stringify(rate), rate.receivedAt);
}

export function restoreNews(key: string): Persisted<NewsItem[]> | null {
  const row = getDb()
    .prepare('SELECT payload, received_at FROM search_cache WHERE query = ?')
    .get(`news:${key}`) as { payload: string; received_at: number } | undefined;
  if (!row) return null;
  try {
    return { value: JSON.parse(row.payload) as NewsItem[], storedAt: row.received_at, provider: 'yahoo' };
  } catch {
    return null;
  }
}

export function persistNews(key: string, items: NewsItem[]): void {
  getDb()
    .prepare('INSERT INTO search_cache (query, payload, received_at) VALUES (?, ?, ?) ON CONFLICT(query) DO UPDATE SET payload = excluded.payload, received_at = excluded.received_at')
    .run(`news:${key}`, JSON.stringify(items), Date.now());
}

function restore<T>(kind: CacheKind, key: string): Persisted<T> | null {
  switch (kind) {
    case 'bars': {
      const [id, range, interval] = key.split('|');
      return restoreBars(id, range, interval) as Persisted<T> | null;
    }
    case 'meta':
      return restoreMeta(key) as Persisted<T> | null;
    case 'fx':
      return restoreFx(key) as Persisted<T> | null;
    case 'news':
      return restoreNews(key) as Persisted<T> | null;
    default:
      return null;
  }
}

/** Remove SQLite rows older than `days`, called on boot. */
export function pruneOldSnapshots(days = 30): void {
  const cutoff = Date.now() - days * 86_400_000;
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM quote_cache WHERE received_at < ?').run(cutoff);
    db.prepare('DELETE FROM bars_cache WHERE received_at < ?').run(cutoff);
    db.prepare('DELETE FROM meta_cache WHERE received_at < ?').run(cutoff);
    db.prepare('DELETE FROM news_item WHERE fetched_at < ?').run(cutoff);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function matchingDataMode(provider: string): boolean { return (provider === 'demo') === (process.env.TOMTRADER_DEMO === '1'); }
