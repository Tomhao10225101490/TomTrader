import type {
BarInterval,
BarRange,
Bars,
DataQuality,
ExchangeCode,
FeedTier,
Instrument,
InstrumentMetadata,
MarketCode,
MarketStatus,
NewsItem,
Quote,
} from '../server/types';

/** Wire shapes shared by the API routes and the client. One definition, no drift. */

export interface QuoteSnapshot {
  instrument: Instrument;
  quote: Quote | null;
  status: MarketStatus;
  /** Populated when the last fetch for this instrument failed. */
  issue?: {
    provider: string;
    reason: string;
    message: string;
    at: number;
  } | null;
  sparkline?: number[] | null;
}

export interface OverviewResponse {
  generatedAt: number;
  groups: {
    market: MarketCode;
    snapshots: QuoteSnapshot[];
  }[];
  commodities: QuoteSnapshot[];
  currencies: QuoteSnapshot[];
  clock: ClockRow[];
  sources: SourceHealth[];
  /** True when the first paint came from disk rather than a live fetch. */
  servedFromCache: boolean;
}

export interface ClockRow {
  exchange: ExchangeCode;
  status: MarketStatus;
  localTime: number;
  /** UTC ms of the open of the current or next session segment. */
  sessionOpenAt: number | null;
  sessionCloseAt: number | null;
  /** Segments for the exchange-local day that contains "now", plus the next day. */
  timeline: { openAt: number; closeAt: number; date: string; earlyClose: boolean; holiday: string | null }[];
  headline: { instrumentId: string; changePercent: number | null } | null;
}

export interface SourceHealth {
  provider: string;
  label: string;
  ok: boolean;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  consecutiveErrors: number;
  cooldownMs: number;
  tier: FeedTier;
  note: string;
}

export interface DetailResponse {
  instrument: Instrument;
  snapshot: QuoteSnapshot;
  metadata: InstrumentMetadata | null;
  metadataIssue: string | null;
  related: QuoteSnapshot[];
}

export interface BarsResponse {
  /** The vendor series; null when nothing could be fetched or restored. */
  series: Bars | null;
  issue: string | null;
  /** Chart-axis encoding applied server-side so the axis reads exchange-local time. */
  axisTimezone: string;
  axisOffsetMinutes: number;
}

export interface SearchResponse {
  query: string;
  results: {
    instrument: Instrument;
    matchedOn: string;
    quote: Quote | null;
    status: MarketStatus | null;
  }[];
  source: 'local' | 'local+vendor' | 'vendor';
  tookMs: number;
  issue: string | null;
}

export interface HeatmapCell {
  instrumentId: string;
  name: string;
  nameZh: string | null;
  market: MarketCode;
  sector: string;
  changePercent: number | null;
  last: number | null;
  marketCap: number | null;
  /** Weight actually used to size the tile, and what it came from. */
  weight: number;
  weightSource: 'market-cap' | 'equal';
  quality: DataQuality;
}

export interface HeatmapResponse {
  pool: string;
  period: 'intraday' | '5d' | '1m';
  cells: HeatmapCell[];
  /** Present when the pool could only be partly filled. */
  coverage: { requested: number; withData: number; note: string };
  generatedAt: number;
}

export interface MoversResponse {
  gainers: QuoteSnapshot[];
  losers: QuoteSnapshot[];
  mostActive: QuoteSnapshot[];
  generatedAt: number;
}

export interface PortfolioPosition {
  id: string;
  instrument: Instrument;
  quantity: number;
  averageCost: number;
  currency: CurrencyCodeAlias;
  purchasedAt: string;
  quote: QuoteSnapshot | null;
  marketValue: number | null;
  /** Cost basis restated in the valuation currency; null when no rate exists. */
  costInValuation: number | null;
  costBasis: number;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  weight: number | null;
  /** Set when valuation needs an FX rate we do not have. */
  blockedReason: string | null;
}

export type CurrencyCodeAlias = 'USD' | 'CNY' | 'HKD' | 'JPY' | 'EUR' | 'GBP' | 'KRW' | 'TWD' | 'INR' | 'AUD' | 'BRL';

export interface PortfolioSummary {
  positions: PortfolioPosition[];
  totalValue: number | null;
  totalCost: number;
  totalPnl: number | null;
  totalPnlPercent: number | null;
  valuationCurrency: CurrencyCodeAlias;
  fx: { rate: number; at: number; source: string; tier: FeedTier } | null;
  /** Total value if the missing-rate positions were excluded, and why. */
  partialCoverage: { covered: number; uncovered: number; note: string | null };
  byCountry: { market: MarketCode; value: number; weight: number }[];
  bySector: { sector: string; value: number; weight: number }[];
  byCurrency: { currency: string; value: number; weight: number }[];
  generatedAt: number;
  issue: string | null;
}

export interface AlertEvaluation {
  alertId: string;
  instrumentId: string;
  fired: boolean;
  price: number | null;
  detail: string | null;
  skippedReason?: 'cooldown' | 'no-data' | 'disabled' | 'not-armed';
}

export interface SseFrame {
  type: 'quotes' | 'status' | 'alert' | 'heartbeat' | 'state';
  at: number;
  quotes?: QuoteSnapshot[];
  alerts?: { alertId: string; instrumentId: string; name: string; detail: string; price: number }[];
  state?: {
    connectedAt: number | null;
    clients?: number;
    pollingIntervalMs: number;
    subscribed: number;
    paused: boolean;
    lastRefreshAt: number | null;
    lastErrorAt: number | null;
    lastError: string | null;
  };
}

export type { BarInterval,BarRange,Instrument,InstrumentMetadata,MarketCode,MarketStatus,NewsItem,QuoteSnapshot as Q,Quote };
