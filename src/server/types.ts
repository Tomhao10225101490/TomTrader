/**
 * TomTrader — domain model.
 *
 * Everything the UI renders is derived from these types. They are deliberately
 * provider-agnostic: no Yahoo/Eastmoney field names leak past the adapter layer.
 */

/* ------------------------------------------------------------------ identity */

export type AssetType = 'index' | 'equity' | 'etf' | 'commodity' | 'currency';

/** Markets we model explicitly. Drives provider routing and the exchange calendar. */
export type MarketCode =
  | 'US'
  | 'CN'
  | 'HK'
  | 'JP'
  | 'KR'
  | 'TW'
  | 'IN'
  | 'AU'
  | 'DE'
  | 'FR'
  | 'GB'
  | 'EU'
  | 'NL'
  | 'BR'
  | 'FX';

/**
 * Stable, collision-free instrument key.
 * Global tickers are not unique (7203 is Toyota in Tokyo; a different 7203 may
 * exist elsewhere), so identity is always (assetType, market, symbol).
 */
export interface Instrument {
  id: string;
  /** Human ticker as traders write it, e.g. AAPL, 0700.HK, 600519, 7203.T */
  displaySymbol: string;
  /** Primary provider's symbol, kept for deep links/debugging. */
  vendorSymbol: string | null;
  /**
   * Symbol each adapter should use for this instrument, keyed by provider id.
   * Same company, different vendor convention: 600519 is `600519.SS` at Yahoo
   * and `1.600519` at Eastmoney.
   */
  providerSymbols?: Partial<Record<ProviderId, string>>;
  name: string;
  nameZh: string | null;
  assetType: AssetType;
  market: MarketCode;
  exchange: ExchangeCode;
  currency: CurrencyCode;
  /** Present when the provider told us a sector (used by heatmap grouping). */
  sector?: string | null;
  industry?: string | null;
  /**
   * Alias spellings that should resolve to this instrument: local-language
   * names, former tickers, exchange-prefixed forms traders type.
   */
  aliases?: string[];
  /** Market capitalisation in the instrument's own currency. null = unknown. */
  marketCap?: number | null;
}

export type ExchangeCode =
  | 'XNYS'
  | 'XNAS'
  | 'ARCX'
  | 'CNE'
  | 'XSHE'
  | 'HKEX'
  | 'XTKS'
  | 'KRX'
  | 'TWSE'
  | 'NSE'
  | 'BSE'
  | 'ASX'
  | 'XETRA'
  | 'XEUR'
  | 'XLON'
  | 'XPAF'
  | 'BVMF'
  | 'OTC';

export type CurrencyCode = 'USD' | 'CNY' | 'HKD' | 'JPY' | 'EUR' | 'GBP' | 'KRW' | 'TWD' | 'INR' | 'AUD' | 'BRL';

/* ------------------------------------------------------------------- quotes */

/**
 * Declared freshness of a feed. Only tiers backed by a documented vendor
 * statement may use `realtime`; everything else must be honest about delay.
 */
export type FeedTier = 'realtime' | 'delayed-15' | 'delayed-20' | 'end-of-day' | 'unverified' | 'demo';

/** What the UI badge shows. Computed from tier + measured age, never guessed. */
export type DataQuality = 'realtime' | 'delayed' | 'end-of-day' | 'cached' | 'stale' | 'unavailable' | 'demo';

export interface Quote {
  instrumentId: string;
  /** Latest traded price in the instrument's own currency. */
  last: number;
  /** Reference close used for the change figures, as reported by the source. */
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  volume: number | null;
  /** Exchange-side timestamp of the trade we are showing, in epoch seconds (UTC). */
  exchangeTimestamp: number | null;
  /** Wall clock (UTC ms) when our server received this value from the vendor. */
  receivedAt: number;
  tier: FeedTier;
  quality: DataQuality;
  provider: ProviderId;
  /** Set when the feed says the session is extended-hours. */
  session: 'regular' | 'pre' | 'post' | 'closed' | null;
  currency: CurrencyCode;
  /**
   * Market cap in the instrument's own currency, when the quote feed carries
   * it. Used to size heatmap tiles; null means the tile falls back to equal
   * area and the UI says so.
   */
  marketCap?: number | null;
  /** Name as the vendor reported it, used to enrich dynamic instruments. */
  vendorName?: string | null;
}

export interface Bars {
  instrumentId: string;
  range: BarRange;
  interval: BarInterval;
  /** true when bars are adjusted for splits/dividends by the source. */
  adjusted: boolean;
  /** How adjustment was decided — surfaced in docs, never silently applied. */
  adjustment: 'split-only' | 'dividend-adjusted' | 'raw' | 'unknown';
  bars: Bar[];
  meta: {
    currency: CurrencyCode;
    exchangeTimezone: string;
    /** Exchange-side timestamp of the final bar, epoch seconds UTC. */
    lastBarAt: number | null;
    receivedAt: number;
    tier: FeedTier;
    provider: ProviderId;
  };
}

export interface Bar {
  /** Bar open time in exchange-local epoch seconds (UTC-normalised). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export type BarRange = '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';
export type BarInterval = '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo';

export interface InstrumentMetadata {
  instrumentId: string;
  name: string;
  nameZh: string | null;
  description: string | null;
  sector: string | null;
  industry: string | null;
  headquarters: string | null;
  website: string | null;
  founded: number | null;
  employees: number | null;
  currency: CurrencyCode;
  exchange: ExchangeCode;
  fullExchangeName: string | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  averageVolume: number | null;
  previousClose: number | null;
  sharesOutstanding: number | null;
  provider: ProviderId;
  receivedAt: number;
}

/* ------------------------------------------------------------ search result */

export interface SearchResult {
  instrument: Instrument;
  /** Match reason shown in the palette: ticker / name / exchange. */
  matchedOn: 'symbol' | 'name' | 'alias' | 'exchange';
  /** Populated when the hit came from the live vendor lookup, not local index. */
  lastQuoteAt: number | null;
}

/* ------------------------------------------------------------ market status */

export type MarketState =
  | 'open'
  | 'pre-market'
  | 'after-hours'
  | 'closed'
  | 'holiday'
  | 'weekend'
  | 'unavailable';

export interface MarketStatus {
  exchange: ExchangeCode;
  state: MarketState;
  /** UTC epoch ms of the next boundary in either direction. */
  nextOpenAt: number | null;
  nextCloseAt: number | null;
  /** Exchange-local label of the session we are in or heading to. */
  nextEventLabel: string | null;
  isHalfDay: boolean;
  /** Holiday name if the exchange is shut for a named reason. */
  reason: string | null;
  /** Session window we computed against, for transparency in tooltips. */
  sessionSource: 'calendar' | 'fallback';
}

export interface ExchangeInfo {
  code: ExchangeCode;
  name: string;
  nameZh: string;
  country: string;
  countryZh: string;
  timezone: string;
  city: string;
  /** Regular session in exchange-local wall clock, minutes from midnight. */
  sessions: { openMin: number; closeMin: number; preOpenMin?: number; afterCloseMin?: number }[];
  days: number[]; // 0=Sun .. 6=Sat
  currency: CurrencyCode;
  supportsExtendedHours: boolean;
}

/* --------------------------------------------------------------------- misc */

export type ProviderId = 'finnhub' | 'yahoo' | 'eastmoney' | 'tencent' | 'fx-open.er-api' | 'calendar' | 'demo';

/**
 * A capability answer is always explicit. `unsupported` is a first-class result
 * so the UI can say "this provider cannot do that" instead of silently
 * degrading and labelling the data live.
 */
export type CapabilityResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'unsupported' | 'rate-limited' | 'no-key' | 'network' | 'not-found' | 'parse-error'; message: string; retryAfterMs?: number };

export function err<T>(
  reason: Extract<CapabilityResult<T>, { ok: false }>['reason'],
  message: string,
  retryAfterMs?: number,
): CapabilityResult<T> {
  return { ok: false, reason, message, retryAfterMs };
}

export function ok<T>(data: T): CapabilityResult<T> {
  return { ok: true, data };
}

/* -------------------------------------------------------------- user domain */

export interface WatchlistGroup {
  id: string;
  name: string;
  /** Stable order; drag-and-drop rewrites this array. */
  instrumentIds: string[];
  pinned: string[];
  createdAt: number;
  builtin?: boolean;
}

export interface Holding {
  id: string;
  instrumentId: string;
  quantity: number;
  /** Average cost per unit, expressed in `currency`. */
  averageCost: number;
  currency: CurrencyCode;
  purchasedAt: string; // yyyy-mm-dd
  note?: string;
}

export type AlertCondition =
  | { type: 'price-above'; threshold: number }
  | { type: 'price-below'; threshold: number }
  | { type: 'change-percent-above'; threshold: number }
  | { type: 'change-percent-below'; threshold: number }
  | { type: 'five-two-week-high' }
  | { type: 'five-two-week-low' };

export interface PriceAlert {
  id: string;
  instrumentId: string;
  condition: AlertCondition;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
  triggeredCount: number;
  /** Suppress re-fires while the price oscillates around the threshold. */
  cooldownMinutes: number;
  /** Crossed threshold since the last check but not yet fired (arming). */
  armed: boolean;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  instrumentId: string;
  at: number;
  price: number;
  detail: string;
}

export interface FxRate {
  base: CurrencyCode;
  quotes: Partial<Record<CurrencyCode, number>>;
  /** Source-side timestamp — er-api publishes once per day. */
  sourceAt: number;
  receivedAt: number;
  tier: FeedTier;
  provider: ProviderId;
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  publishedAt: number;
  url: string;
  symbols: string[];
  category: string | null;
  thumbnail: string | null;
  provider: ProviderId;
}
