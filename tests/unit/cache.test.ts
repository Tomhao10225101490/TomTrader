import {
cached,
cacheStats,
clearMemoryCache,
invalidatePrefix,
memorySize,
peek,
persistBars,
persistQuote,
pruneOldSnapshots,
put,
restoreBars,
restoreQuotes,
TTL,
} from '@/server/cache';
import { getDb,resetDbForTests } from '@/server/db';
import type { Bars,Quote } from '@/server/types';
import { beforeEach,describe,expect,it } from 'vitest';

function quote(id: string, last = 100): Quote {
  return {
    instrumentId: id,
    last,
    previousClose: 99,
    change: 1,
    changePercent: 1.01,
    dayHigh: last,
    dayLow: last,
    open: last,
    volume: 1000,
    exchangeTimestamp: Math.floor(Date.now() / 1000),
    receivedAt: Date.now(),
    tier: 'unverified',
    quality: 'delayed',
    provider: 'yahoo',
    session: 'regular',
    currency: 'USD',
  };
}

describe('memory cache', () => {
  beforeEach(() => {
    resetDbForTests();
    clearMemoryCache();
  });

  it('serves a live entry without calling the loader', async () => {
    let calls = 0;
    const loader = async () => {
      calls++;
      return 42;
    };
    const first = await cached('meta', 'k', 60_000, loader, 'test');
    const second = await cached('meta', 'k', 60_000, loader, 'test');
    expect(first.value).toBe(42);
    expect(second.fromCache).toBe(true);
    expect(calls).toBe(1);
  });

  it('de-duplicates concurrent identical loads (single flight)', async () => {
    let calls = 0;
    const loader = () =>
      new Promise<number>((resolve) =>
        setTimeout(() => {
          calls++;
          resolve(7);
        }, 20),
      );
    const results = await Promise.all([
      cached('meta', 'same', 60_000, loader, 'test'),
      cached('meta', 'same', 60_000, loader, 'test'),
      cached('meta', 'same', 60_000, loader, 'test'),
    ]);
    expect(calls).toBe(1);
    expect(results.map((r) => r.value)).toEqual([7, 7, 7]);
  });

  it('answers an expired entry immediately and refreshes behind it', async () => {
    put('quote', 'x', 1, -1, 'test');
    let refreshed = 0;
    const r = await cached(
      'quote',
      'x',
      1_000,
      async () => {
        refreshed++;
        return 2;
      },
      'test',
      { staleOk: true },
    );
    expect(r.value).toBe(1);
    expect(r.stale).toBe(true);
    await new Promise((res) => setTimeout(res, 30));
    expect(refreshed).toBe(1);
  });

  it('expires by TTL', () => {
    put('meta', 'a', 1, 10, 'test');
    expect(peek('meta', 'a')?.expiresAt).toBeGreaterThan(Date.now() - 1);
    const expired = put('meta', 'b', 1, -5, 'test');
    expect(expired.expiresAt).toBeLessThan(Date.now());
  });

  it('invalidates by prefix', () => {
    put('bars', 'id|1D|5m', 1, 1000, 'test');
    put('bars', 'id|3M|1d', 2, 1000, 'test');
    expect(memorySize()).toBe(2);
    invalidatePrefix('bars:id|1D');
    expect(peek('bars', 'id|1D|5m')).toBeNull();
    expect(peek('bars', 'id|3M|1d')).not.toBeNull();
  });

  it('reports per-kind statistics for the settings panel', () => {
    put('quote', 'q1', 1, 1000, 'test');
    put('meta', 'm1', 1, 1000, 'test');
    const stats = cacheStats();
    expect(stats.entries).toBe(2);
    expect(stats.byKind.quote).toBe(1);
    expect(stats.byKind.meta).toBe(1);
  });

  it('keeps session-aware TTLs, so a closed market is not polled every 15s', () => {
    expect(TTL.quoteOpen).toBeLessThan(TTL.quoteClosed);
    expect(TTL.barsDailyClosed).toBeGreaterThan(TTL.barsDailyOpen);
    expect(TTL.searchMiss).toBeLessThan(TTL.search);
  });
});

describe('sqlite snapshot layer', () => {
  beforeEach(() => {
    resetDbForTests();
    clearMemoryCache();
  });

  it('persists and restores quotes so a cold start can paint', () => {
    persistQuote(quote('equity:US:AAPL', 342.37));
    persistQuote(quote('equity:US:NVDA', 186.64));
    clearMemoryCache();
    const restored = restoreQuotes(['equity:US:AAPL', 'equity:US:NVDA', 'equity:US:MISSING']);
    expect(restored.size).toBe(2);
    expect(restored.get('equity:US:AAPL')?.value.last).toBe(342.37);
    expect(restored.get('equity:US:MISSING')).toBeUndefined();
  });

  it('overwrites a stored quote for the same instrument rather than duplicating', () => {
    persistQuote(quote('a', 1));
    persistQuote(quote('a', 2));
    expect(restoreQuotes(['a']).get('a')?.value.last).toBe(2);
    const count = getDb().prepare('SELECT COUNT(*) n FROM quote_cache').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('round-trips bar series keyed by instrument, range and interval', () => {
    const bars: Bars = {
      instrumentId: 'x',
      range: '3M',
      interval: '1d',
      adjusted: true,
      adjustment: 'split-only',
      bars: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
      meta: { currency: 'USD', exchangeTimezone: 'UTC', lastBarAt: 1, receivedAt: Date.now(), tier: 'unverified', provider: 'yahoo' },
    };
    persistBars(bars);
    clearMemoryCache();
    const back = restoreBars('x', '3M', '1d');
    expect(back?.value.bars[0].close).toBe(1.5);
    expect(restoreBars('x', '1Y', '1d')).toBeNull();
  });

  it('prunes snapshots past their retention window', () => {
    getDb()
      .prepare('INSERT INTO quote_cache (instrument_id, payload, exchange_ts, received_at, provider) VALUES (?,?,?,?,?)')
      .run('old', '{}', 0, Date.now() - 40 * 86_400_000, 'yahoo');
    persistQuote(quote('fresh'));
    pruneOldSnapshots(30);
    expect(restoreQuotes(['old', 'fresh']).size).toBe(1);
  });
});
