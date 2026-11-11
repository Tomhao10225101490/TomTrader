import { fetchJson } from '../http';
import type { Bars,CapabilityResult,FeedTier,Instrument,MarketCode,Quote } from '../types';
import { err,ok } from '../types';
import type { MarketDataProvider } from './provider';

export interface FinnhubQuote { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number; error?: string }
const finite = (n: unknown): number | null => typeof n === 'number' && Number.isFinite(n) ? n : null;

/** Never infer coverage or exchange latency from a successful HTTP response. */
export function parseFinnhubQuote(i: Instrument, row: FinnhubQuote, tier: FeedTier, receivedAt = Date.now()): Quote | null {
  if (!finite(row.c) || row.c! <= 0 || !finite(row.t) || row.t! <= 0) return null;
  return {
    instrumentId: i.id, last: row.c!, previousClose: finite(row.pc), change: finite(row.d), changePercent: finite(row.dp),
    dayHigh: finite(row.h), dayLow: finite(row.l), open: finite(row.o), volume: null,
    exchangeTimestamp: row.t!, receivedAt, tier, quality: 'cached', provider: 'finnhub', session: null, currency: i.currency,
  };
}

export class FinnhubProvider implements MarketDataProvider {
  readonly id = 'finnhub' as const;
  readonly label = 'Finnhub API';
  readonly markets: MarketCode[] = ['US'];
  readonly capabilities = { quotes: true, historicalBars: false, search: false, metadata: false, push: false, news: false };
  declaredTier(): FeedTier {
    // Set only to the tier actually documented by the operator's account entitlement.
    const tier = process.env.FINNHUB_FEED_TIER;
    return tier === 'realtime' || tier === 'delayed-15' || tier === 'delayed-20' || tier === 'end-of-day' ? tier : 'unverified';
  }
  async getQuotes(instruments: Instrument[]): Promise<CapabilityResult<Quote[]>> {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return err('no-key', 'Configure your personal Finnhub key in desktop Settings or the web server environment.');
    const quotes: Quote[] = [];
    for (const i of instruments) {
      if (i.market !== 'US' || !['equity', 'etf'].includes(i.assetType)) continue;
      const res = await fetchJson<FinnhubQuote>('https://finnhub.io/api/v1/quote', {
        query: { symbol: i.displaySymbol }, headers: { 'X-Finnhub-Token': key }, timeoutMs: 8_000, retries: 1,
      });
      if (!res.ok) {
        if (quotes.length) return ok(quotes);
        if (res.error.status === 401) return err('no-key', 'Finnhub rejected the personal key. Check your key in Settings.');
        if (res.error.status === 403) return err('unsupported', 'Finnhub account does not permit this quote. Check account entitlements.');
        return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
      }
      if (res.data.error) return quotes.length ? ok(quotes) : err('unsupported', 'Finnhub refused this request; check account entitlements.');
      const quote = parseFinnhubQuote(i, res.data, this.declaredTier());
      if (quote) quotes.push(quote);
    }
    return quotes.length ? ok(quotes) : err('not-found', 'No entitled US stock quotes returned.');
  }
  async getHistoricalBars(): Promise<CapabilityResult<Bars>> {
    return err('unsupported', 'This adapter does not assume historical candles are included in your Finnhub plan.');
  }
}
export const finnhub = new FinnhubProvider();
