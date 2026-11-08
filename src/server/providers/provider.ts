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
ProviderId,
Quote,
SearchResult,
} from '../types';

/**
 * The contract every market-data vendor adapter implements.
 *
 * Rules that apply to all implementations:
 *  1. A capability the vendor does not have returns `{ok:false, reason:'unsupported'}`.
 *     Adapters must never substitute a different endpoint and keep the label.
 *  2. Prices are returned in the instrument's own currency, unrounded.
 *  3. `receivedAt` is our clock; `exchangeTimestamp` is the venue's. They are
 *     separate fields on purpose.
 *  4. Adapters do not cache. Caching is the service layer's job so that every
 *     provider shares one TTL policy and one single-flight registry.
 */
export interface MarketDataProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Markets this adapter can serve at all. */
  readonly markets: MarketCode[];
  readonly capabilities: {
    quotes: boolean;
    historicalBars: boolean;
    search: boolean;
    metadata: boolean;
    /** Vendor push feed (websocket/stream). False means we poll within quota. */
    push: boolean;
    news: boolean;
  };
  /** Declared latency for a market, per the vendor's own documentation. */
  declaredTier(market: MarketCode): FeedTier;
  getQuotes(instruments: Instrument[]): Promise<CapabilityResult<Quote[]>>;
  getHistoricalBars(
    instrument: Instrument,
    range: BarRange,
    interval: BarInterval,
  ): Promise<CapabilityResult<Bars>>;
  search?(query: string): Promise<CapabilityResult<SearchResult[]>>;
  getMetadata?(instrument: Instrument): Promise<CapabilityResult<InstrumentMetadata>>;
  getNews?(instrument: Instrument | null, limit?: number): Promise<CapabilityResult<NewsItem[]>>;
}

/** Maps a display range to the interval we actually request. */
export const RANGE_PLAN: Record<BarRange, { yahooRange: string; yahooInterval: BarInterval; minBars: number }> = {
  '1D': { yahooRange: '1d', yahooInterval: '5m', minBars: 6 },
  '5D': { yahooRange: '5d', yahooInterval: '15m', minBars: 12 },
  '1M': { yahooRange: '1mo', yahooInterval: '1d', minBars: 20 },
  '3M': { yahooRange: '3mo', yahooInterval: '1d', minBars: 55 },
  '6M': { yahooRange: '6mo', yahooInterval: '1d', minBars: 110 },
  YTD: { yahooRange: 'ytd', yahooInterval: '1d', minBars: 20 },
  '1Y': { yahooRange: '1y', yahooInterval: '1d', minBars: 200 },
  '5Y': { yahooRange: '5y', yahooInterval: '1wk', minBars: 200 },
  MAX: { yahooRange: 'max', yahooInterval: '1mo', minBars: 60 },
};

export const EASTMONEY_KLT: Record<BarInterval, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '1d': '101',
  '1wk': '102',
  '1mo': '103',
};

/**
 * The symbol one specific adapter should use for an instrument.
 * Eastmoney keys are stored prefixed (`em:1.600519`) so a secid can never be
 * confused with a Yahoo symbol when it is written to the same row.
 */
export function symbolFor(instrument: Instrument, provider: ProviderId): string | null {
  const raw = instrument.providerSymbols?.[provider];
  if (raw) return raw.startsWith('em:') ? raw.slice(3) : raw;
  if (provider === 'yahoo') return instrument.vendorSymbol ?? null;
  return null;
}
