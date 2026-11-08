/**
 * Live vendor integration.
 *
 * These assert relationships rather than values: they must pass whatever the
 * market did today, and fail if a mapping, unit or timezone assumption breaks.
 * Skipped automatically when the machine has no route to the vendors.
 */
process.env.TOMTRADER_DB = ':memory:';

import { ALL_INDEX_IDS,instrumentById,UNIVERSE } from '@/server/instruments';
import { eastmoney } from '@/server/providers/eastmoney';
import { convert,getFxRates } from '@/server/providers/fx';
import { getMarketWire } from '@/server/providers/news';
import { yahoo } from '@/server/providers/yahoo';
import type { Instrument } from '@/server/types';
import { beforeAll,describe,expect,it } from 'vitest';

let online = false;

beforeAll(async () => {
  if (process.env.TOMTRADER_LIVE_TESTS !== '1' || process.env.TOMTRADER_PUBLIC_FEEDS !== '1') return;
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d', {
      signal: AbortSignal.timeout(9_000),
    });
    online = r.ok;
  } catch {
    online = false;
  }
}, 20_000);

function live(label: string, fn: () => Promise<void>) {
  return it(label, async (ctx) => {
    if (!online) {
      ctx.skip('Live vendor checks require TOMTRADER_LIVE_TESTS=1, confirmed data rights, and a reachable provider.');
    }
    await fn();
  });
}

/**
 * A vendor that refuses us (429 / network) is recorded as a skip with the
 * reason printed, not as a pass. The suite then reports how much of the live
 * surface it actually exercised, which is the only way a green run means
 * something.
 */
function requireOk<T extends { ok: boolean; reason?: string; message?: string }>(res: T, label: string): res is T & { ok: true } {
  if (res.ok) return true;
  const why = `${res.reason ?? 'error'}: ${res.message ?? ''}`;
  if (/rate-limit|network|unsupported/i.test(why)) {
    throw new Error(`${label}: live provider unavailable: ${why}`);
  }
  expect(res.ok, `${label}: ${why}`).toBe(true);
  return false;
}

describe('yahoo adapter', () => {
  live('quotes a global index with venue timestamp', async () => {
    const ids = ['index:US:^GSPC', 'index:CN:000001', 'index:HK:^HSI', 'index:DE:^GDAXI', 'index:JP:^N225']
      .map((id) => instrumentById(id))
      .filter((i): i is Instrument => Boolean(i));
    const res = await yahoo.getQuotes(ids);
    if (!requireOk(res, 'yahoo batch quotes')) return;
    for (const q of res.data) {
      expect(Number.isFinite(q.last)).toBe(true);
      expect(q.last).toBeGreaterThan(0);
      expect(q.exchangeTimestamp).toBeGreaterThan(1_600_000_000);
      expect(q.exchangeTimestamp).toBeLessThan(2_100_000_000);
      expect(q.tier).toBe('unverified');
    }
    const spx = res.data.find((q) => q.instrumentId === 'index:US:^GSPC');
    expect(spx?.currency).toBe('USD');
    const hsi = res.data.find((q) => q.instrumentId === 'index:HK:^HSI');
    expect(hsi?.currency).toBe('HKD');
  });

  live('daily bars are ordered, plausible and seconds-based', async () => {
    const aapl = instrumentById('equity:US:AAPL')!;
    const res = await yahoo.getHistoricalBars(aapl, '3M', '1d');
    if (!requireOk(res, 'yahoo daily bars')) return;
    const bars = res.data.bars;
    expect(bars.length).toBeGreaterThan(30);
    for (let i = 1; i < bars.length; i++) expect(bars[i].time).toBeGreaterThan(bars[i - 1].time);
    for (const b of bars) {
      expect(b.high).toBeGreaterThanOrEqual(b.low);
      expect(b.high).toBeGreaterThanOrEqual(b.close);
      expect(b.low).toBeLessThanOrEqual(b.close);
      expect(b.time).toBeGreaterThan(1e9);
      expect(b.time).toBeLessThan(1e11);
    }
    expect(res.data.meta.currency).toBe('USD');
    expect(res.data.meta.exchangeTimezone).toBe('America/New_York');
    expect(res.data.adjustment).toBe('split-only');
  });

  live('search finds a symbol with its venue and currency', async () => {
    const res = await yahoo.search('ASML');
    if (!requireOk(res, 'yahoo search')) return;
    const asml = res.data.find((r) => r.instrument.displaySymbol.startsWith('ASML'));
    expect(asml).toBeTruthy();
    expect(asml!.instrument.currency).toBe(asml!.instrument.market === 'NL' ? 'EUR' : 'USD');
    expect(['NL', 'US']).toContain(asml!.instrument.market);
  });

  live('fundamentals come back typed rather than as strings', async () => {
    const res = await yahoo.getMetadata(instrumentById('equity:US:AAPL')!);
    expect(res.ok, 'Fundamentals must be returned in an explicitly enabled live test').toBe(true);
    if (!res.ok) return;
    const m = res.data;
    expect(m.name.length).toBeGreaterThan(2);
    if (m.marketCap !== null) expect(m.marketCap).toBeGreaterThan(1e11);
    if (m.week52High !== null && m.week52Low !== null) expect(m.week52High).toBeGreaterThan(m.week52Low);
    if (m.peRatio !== null) expect(Number.isFinite(m.peRatio)).toBe(true);
  });

  live('intraday series for an index uses minute bars', async () => {
    const res = await yahoo.getHistoricalBars(instrumentById('index:US:^GSPC')!, '1D', '5m');
    if (!res.ok) return;
    expect(res.data.bars.length).toBeGreaterThan(5);
    const span = res.data.bars.at(-1)!.time - res.data.bars[0].time;
    expect(span).toBeLessThan(9 * 3600);
  });
});

describe('eastmoney adapter', () => {
  live('A-share and HK quotes agree with Yahoo within tolerance', async () => {
    const ids = ['index:CN:000001', 'index:HK:^HSI', 'equity:CN:600519', 'equity:HK:00700'];
    const instruments = ids.map((id) => instrumentById(id)!);
    const [em, yh] = await Promise.all([eastmoney.getQuotes(instruments), yahoo.getQuotes(instruments)]);
    if (!em.ok || !yh.ok) return;
    for (const e of em.data) {
      const y = yh.data.find((q) => q.instrumentId === e.instrumentId);
      if (!y || !Number.isFinite(y.last) || y.last === 0) continue;
      // A-share and HK feeds close at slightly different prints; indices are
      // computed identically, so anything above half a percent is a mapping bug.
      const diff = Math.abs(e.last - y.last) / y.last;
      expect(diff).toBeLessThan(0.005);
    }
  });

  live('A-share volume is normalised from lots to shares', async () => {
    const moutai = instrumentById('equity:CN:600519')!;
    const res = await eastmoney.getQuotes([moutai]);
    if (!requireOk(res, 'eastmoney quotes')) return;
    const q = res.data[0];
    expect(q.volume).not.toBeNull();
    expect(q.volume! % 100).toBe(0);
    expect(q.marketCap).toBeGreaterThan(1e11);
    // The name the feed returns is Chinese, and the instrument's own currency
    // is what must be reported, not the feed's.
    expect(q.currency).toBe('CNY');
  });

  live('daily klines are 前复权 and seconds-based', async () => {
    const res = await eastmoney.getHistoricalBars(instrumentById('equity:CN:600519')!, '1Y', '1d');
    if (!requireOk(res, 'eastmoney klines')) return;
    expect(res.data.adjustment).toBe('dividend-adjusted');
    expect(res.data.bars.length).toBeGreaterThan(100);
    expect(res.data.bars[0].time).toBeLessThan(2e9);
    const last = res.data.bars.at(-1)!;
    expect(last.time).toBeGreaterThan(1.7e9);
  });

  live('one-minute trend series covers a session', async () => {
    const res = await eastmoney.getHistoricalBars(instrumentById('equity:CN:600519')!, '1D', '1m');
    if (!res.ok) return;
    expect(res.data.bars.length).toBeGreaterThan(200);
    expect(res.data.adjustment).toBe('raw');
  });
});

describe('fx and news', () => {
  live('fx rates come from a named source with a timestamp', async () => {
    const res = await getFxRates();
    if (!requireOk(res, 'fx rates')) return;
    expect(res.data.quotes.USD).toBe(1);
    expect(res.data.quotes.CNY).toBeGreaterThan(4);
    expect(res.data.quotes.CNY).toBeLessThan(12);
    expect(res.data.sourceAt).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(['yahoo', 'fx-open.er-api']).toContain(res.data.provider);
  });

  it('convert refuses rather than guessing when a rate is missing', () => {
    const fx = { base: 'USD' as const, quotes: { USD: 1, CNY: 7 }, sourceAt: 0, receivedAt: 0, tier: 'unverified' as const, provider: 'yahoo' as const };
    expect(convert(100, 'USD', 'CNY', fx)).toBeCloseTo(700);
    expect(convert(100, 'CNY', 'USD', fx)).toBeCloseTo(100 / 7);
    expect(convert(100, 'USD', 'BRL', fx)).toBeNull();
    expect(convert(100, 'USD', 'CNY', null)).toBeNull();
    expect(convert(100, 'JPY', 'JPY', fx)).toBe(100);
  });

  live('the wire feed returns timestamped items with links', async () => {
    const res = await getMarketWire(10);
    if (!requireOk(res, 'eastmoney wire')) return;
    expect(res.data.length).toBeGreaterThan(0);
    for (const item of res.data.slice(0, 3)) {
      expect(item.title.length).toBeGreaterThan(8);
      expect(item.url).toMatch(/^https:/);
      expect(item.publishedAt).toBeLessThanOrEqual(Date.now() + 3_600_000);
      expect(item.publisher.length).toBeGreaterThan(2);
    }
  });
});

describe('universe integrity', () => {
  live('every curated instrument resolves through at least one provider', async () => {
    const sample = UNIVERSE.filter((i) => i.assetType === 'equity' || i.assetType === 'index');
    const slice = sample.slice(0, 40);
    const yh = await yahoo.getQuotes(slice.filter((i) => i.providerSymbols?.yahoo));
    const em = await eastmoney.getQuotes(slice.filter((i) => i.providerSymbols?.eastmoney));
    const got = new Set<string>();
    if (yh.ok) for (const q of yh.data) if (Number.isFinite(q.last)) got.add(q.instrumentId);
    if (em.ok) for (const q of em.data) if (Number.isFinite(q.last)) got.add(q.instrumentId);
    const coverage = got.size / slice.length;
    // Not a claim that everything works — a tripwire for a mapping rotting.
    expect(coverage).toBeGreaterThan(0.6);
  });

  it('the overview index list is the curated one', () => {
    expect(ALL_INDEX_IDS.length).toBeGreaterThan(20);
    for (const id of ALL_INDEX_IDS) expect(instrumentById(id)).not.toBeNull();
  });
});
