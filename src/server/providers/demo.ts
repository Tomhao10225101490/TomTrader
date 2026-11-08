import type {
BarInterval,
BarRange,
Bars,
CapabilityResult,
FeedTier,
Instrument,
InstrumentMetadata,
MarketCode,
NewsItem,
Quote,
SearchResult,
} from '../types';
import { err,ok } from '../types';
import type { MarketDataProvider } from './provider';

/**
 * Demo provider — synthetic data, unmistakably labelled.
 *
 * Enabled only with `TOMTRADER_DEMO=1`. Its job is to let the app, its tests
 * and its screenshots run with no network at all. Every value produced here
 * carries `tier: 'demo'`, which the freshness classifier renders as the
 * `DEMO` badge, and the app shell paints a full-width DEMO banner whenever a
 * snapshot comes from this provider. Nothing here is, or claims to be, a
 * market price.
 *
 * The generator is deterministic: a hash of the instrument id seeds a
 * Mulberry32 walk, so the same instrument shows the same series across reloads
 * and screenshots.
 */

export class DemoProvider implements MarketDataProvider {
  readonly id = 'demo' as const;
  readonly label = 'Demo generator (not market data)';
  readonly markets: MarketCode[] = ['US', 'CN', 'HK', 'JP', 'KR', 'TW', 'IN', 'AU', 'DE', 'FR', 'GB', 'EU', 'BR', 'NL', 'FX'];
  readonly capabilities = {
    quotes: true,
    historicalBars: true,
    search: false,
    metadata: true,
    push: false,
    news: false,
  };

  declaredTier(_market: MarketCode): FeedTier {
    return 'demo';
  }

  async getQuotes(instruments: Instrument[]): Promise<CapabilityResult<Quote[]>> {
    const now = Date.now();
    const quotes = instruments.map((instrument) => {
      const daily = this.dailySeries(instrument, 30);
      const last = daily[daily.length - 1].close;
      const prev = daily[daily.length - 2].close;
      return {
        instrumentId: instrument.id,
        last,
        previousClose: prev,
        change: last - prev,
        changePercent: ((last - prev) / prev) * 100,
        dayHigh: last * 1.004,
        dayLow: last * 0.996,
        open: prev * 1.001,
        volume: Math.round(1e6 + rand(seed(instrument.id) + 7)() * 5e7),
        exchangeTimestamp: Math.floor(now / 1000),
        receivedAt: now,
        tier: 'demo' as const,
        quality: 'demo' as const,
        provider: 'demo' as const,
        session: 'regular' as const,
        currency: instrument.currency,
        marketCap: instrument.assetType === 'equity' ? last * 2e9 : null,
      } satisfies Quote;
    });
    return ok(quotes);
  }

  async getHistoricalBars(instrument: Instrument, range: BarRange, interval: BarInterval): Promise<CapabilityResult<Bars>> {
    const count = barsFor(range);
    const series = this.dailySeries(instrument, count);
    if (series.length < 2) return err('not-found', 'demo series too short');
    return ok({
      instrumentId: instrument.id,
      range,
      interval,
      adjusted: false,
      // Synthetic data has no corporate actions; say so rather than claiming
      // an adjustment policy.
      adjustment: 'unknown',
      bars: series,
      meta: {
        currency: instrument.currency,
        exchangeTimezone: 'UTC',
        lastBarAt: series[series.length - 1].time,
        receivedAt: Date.now(),
        tier: 'demo',
        provider: 'demo',
      },
    });
  }

  async getMetadata(instrument: Instrument): Promise<CapabilityResult<InstrumentMetadata>> {
    const r = rand(seed(instrument.id) + 11);
    const price = this.dailySeries(instrument, 30).at(-1)!.close;
    return ok({
      instrumentId: instrument.id,
      name: instrument.name,
      nameZh: instrument.nameZh,
      description: 'Synthetic demo instrument. Not a real company.',
      sector: instrument.sector ?? 'Unclassified',
      industry: instrument.industry ?? 'Unclassified',
      headquarters: null,
      website: null,
      founded: null,
      employees: null,
      currency: instrument.currency,
      exchange: instrument.exchange,
      fullExchangeName: 'Demo',
      marketCap: price * 2e9,
      peRatio: 8 + r() * 30,
      eps: price / (12 + r() * 20),
      dividendYield: r() * 0.04,
      week52High: price * 1.24,
      week52Low: price * 0.72,
      averageVolume: 3e6 + r() * 2e7,
      previousClose: price,
      sharesOutstanding: 2e9,
      provider: 'demo',
      receivedAt: Date.now(),
    });
  }

  async getNews(): Promise<CapabilityResult<NewsItem[]>> {
    return err('unsupported', 'Demo mode has no news source.');
  }

  async search(_query: string): Promise<CapabilityResult<SearchResult[]>> {
    return err('unsupported', 'Demo mode searches the local instrument list only.');
  }

  private dailySeries(instrument: Instrument, days: number): Bars['bars'] {
    const s = seed(instrument.id);
    const r = rand(s);
    const base = basePrice(instrument, s);
    // Warm up the walk so the visible window is not anchored to the seed.
    const warm = 400;
    let price = base;
    for (let i = 0; i < warm; i++) price = step(price, r, instrument);

    const bars: Bars['bars'] = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const open = price;
      const close = step(open, r, instrument);
      const high = Math.max(open, close) * (1 + r() * 0.006);
      const low = Math.min(open, close) * (1 - r() * 0.006);
      bars.push({
        time: Math.floor(d.getTime() / 1000),
        open: round(open, instrument),
        high: round(high, instrument),
        low: round(low, instrument),
        close: round(close, instrument),
        volume: Math.round(1e6 + r() * 5e7),
      });
      price = close;
    }
    return bars;
  }
}

function step(price: number, r: () => number, instrument: Instrument): number {
  const drift = instrument.assetType === 'index' ? 0.0002 : 0.0004;
  const vol = instrument.assetType === 'currency' ? 0.002 : instrument.assetType === 'index' ? 0.008 : 0.018;
  const shock = (r() - 0.5) * 2 * vol;
  return Math.max(0.01, price * (1 + drift + shock));
}

function round(v: number, instrument: Instrument): number {
  const digits = instrument.assetType === 'currency' ? 4 : v > 1000 ? 2 : v < 1 ? 4 : 2;
  return Number(v.toFixed(digits));
}

function barsFor(range: BarRange): number {
  switch (range) {
    case '1D':
      return 2;
    case '5D':
      return 5;
    case '1M':
      return 22;
    case '3M':
      return 64;
    case '6M':
      return 128;
    case 'YTD':
      return 160;
    case '1Y':
      return 252;
    case '5Y':
      return 260;
    case 'MAX':
      return 320;
  }
}

/**
 * Plausible magnitudes only: indices sit in the thousands, currencies near
 * their usual ratio, stocks in the tens to hundreds. A demo series must look
 * like the right *kind* of number, otherwise reviewers read the DEMO banner as
 * a joke about rounding.
 */
function basePrice(instrument: Instrument, s: number): number {
  const wobble = 0.85 + (s % 1000) / 3000;
  switch (instrument.assetType) {
    case 'index':
      return 2000 * wobble;
    case 'currency':
      return 1 * wobble;
    case 'commodity':
      return 100 * wobble;
    case 'etf':
      return 200 * wobble;
    default:
      return 120 * wobble;
  }
}

function seed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function rand(seedValue: number): () => number {
  let a = seedValue >>> 0;
  return function mulberry32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const demo = new DemoProvider();
