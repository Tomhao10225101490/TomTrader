import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.TOMTRADER_DB = ':memory:';
  process.env.TOMTRADER_DEMO = '1';
  process.env.TOMTRADER_PUBLIC_FEEDS = '0';
});
import { clearMemoryCache, put, TTL } from '@/server/cache';
import { demo } from '@/server/providers/demo';
import { getBars, getSnapshots, refreshQuotes, resolveInstrument } from '@/server/service';

const id = 'equity:CN:600519';
const instrument = resolveInstrument(id)!;

beforeEach(() => {
  clearMemoryCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T01:20:00Z')); // 09:20 before Shanghai open
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('cache refresh across trading-session transitions', () => {
  it.each(['await', 'stale'] as const)('refreshes a pre-open quote after the market opens (%s mode)', async (mode) => {
    const fixture = await demo.getQuotes([instrument]);
    if (!fixture.ok) throw new Error('fixture unavailable');
    put('quote', id, fixture.data[0], TTL.quoteClosed, 'demo');
    const spy = vi.spyOn(demo, 'getQuotes');
    await getSnapshots([id], { mode });
    expect(spy).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-11-11T01:30:01Z'));
    await getSnapshots([id], { mode });
    expect(spy).toHaveBeenCalledTimes(1);
    // Wait for stale-mode background work before the next test resets its cache.
    await getSnapshots([id], { mode: 'await' });
  });

  it('does not retain a six-hour closed-market history TTL into trading', async () => {
    const fixture = await demo.getHistoricalBars(instrument, '1M', '1d');
    if (!fixture.ok) throw new Error('fixture unavailable');
    put('bars', `${id}|1M|1d`, fixture.data, TTL.barsDailyClosed, 'demo');
    const spy = vi.spyOn(demo, 'getHistoricalBars');
    await getBars(id, '1M', '1d', { await: true });
    expect(spy).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-11-11T01:30:01Z'));
    const refreshed = await getBars(id, '1M', '1d', { await: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(refreshed.bars?.meta.receivedAt).toBe(Date.now());
  });
});


it('a successful cold first-run batch is fetched only once', async () => {
  const spy = vi.spyOn(demo, 'getQuotes');
  const snapshots = await getSnapshots(['equity:US:NVDA'], { mode: 'first-run' });
  expect(snapshots[0].quote?.provider).toBe('demo');
  expect(spy).toHaveBeenCalledTimes(1);
});

it('a vendor response completing after the request budget clears its obsolete timeout', async () => {
  const target = 'equity:US:AAPL';
  const fixture = await demo.getQuotes([resolveInstrument(target)!]);
  let finish!: (value: typeof fixture) => void;
  const response = new Promise<typeof fixture>((resolve) => { finish = resolve; });
  vi.spyOn(demo, 'getQuotes').mockReturnValue(response);
  try {
    const timedOut = await getSnapshots([target], { mode: 'await', deadlineMs: 1 });
    expect(timedOut[0].issue?.reason).toBe('timeout');
    const completion = refreshQuotes([target]);
    finish(fixture);
    await completion;
    const recovered = await getSnapshots([target], { mode: 'stale' });
    expect(recovered[0].quote?.provider).toBe('demo');
    expect(recovered[0].issue).toBeNull();
  } finally { finish(fixture); }
});
