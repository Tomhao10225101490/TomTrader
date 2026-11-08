import { fetchJson,raw,sleep } from '../http';
import type {
BarInterval,
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
import {
currencyForMarket,
makeInstrumentId,
mapVendorAssetType,
normalizeCurrency,
resolveVendorExchange,
} from '../vendorsymbols';
import { publicFeedsEnabled } from './access';
import { RANGE_PLAN,symbolFor,type MarketDataProvider } from './provider';

/**
 * Yahoo Finance adapter.
 *
 * This is the free, key-less quote source most retail tools use. It is an
 * unofficial, undocumented interface: it has no published latency guarantee,
 * quota, or storage licence. Consequences built into this adapter:
 *
 *  - the declared tier is always `unverified`, so the UI can never render a
 *    "Real-time" badge on Yahoo data;
 *  - requests go through the shared limiter (≈1 req / 350 ms per host);
 *  - responses are cached server-side and never used to imply liveness.
 *
 * Endpoints used (all public, no scraping of authenticated pages):
 *   /v7/finance/quote      batched last prices (needs cookie+crumb)
 *   /v8/finance/chart/:s   intraday + daily bars, split/dividend events
 *   /v1/finance/search     symbol resolution and per-symbol news
 *   /v10/quoteSummary/:s   fundamentals and company profile
 */

const BASE = 'https://query1.finance.yahoo.com';
const API = 'https://quoteapi.finance.yahoo.com';

interface YahooSession {
  cookie: string;
  crumb: string;
  obtainedAt: number;
}

/**
 * Cookie jar for the Yahoo handshake.
 *
 * Node's fetch does not store cookies, and `getcrumb` only answers for a
 * session that already carries the consent cookie `fc.yahoo.com` sets on its
 * 404 response. Without this the crumb request returns the literal body
 * "Too Many Requests", which a naive parser accepts as a crumb and then every
 * quote request fails — so the jar and the strict shape check below are both
 * load-bearing.
 */
const jar = new Map<string, string>();

function storeCookies(headers: Headers): void {
  for (const line of headers.getSetCookie?.() ?? []) {
    const pair = line.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value && value !== '""' && value !== ';') jar.set(name, value);
  }
}

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Crumbs are short base64-ish tokens; anything else is an error page. */
const CRUMB_SHAPE = /^[A-Za-z0-9+/=._-]{6,32}$/;

let session: YahooSession | null = null;
let bootstrapping: Promise<YahooSession | null> | null = null;
let sessionFailedAt = 0;
/**
 * Hard stop after a throttle response. Without this, every component that
 * wants prices retries a 429 endpoint on every render, which turns one
 * rate-limited vendor into an unusable UI. `yahooCoolingDownMs()` lets the
 * service layer answer from cache and label it honestly instead.
 */
let coolUntil = 0;

export function yahooCoolingDownMs(now = Date.now()): number {
  return Math.max(0, coolUntil - now);
}

export function yahooCooldown(ms: number, now = Date.now()): void {
  coolUntil = Math.max(coolUntil, now + ms);
}

async function getSession(): Promise<YahooSession | null> {
  if (session && Date.now() - session.obtainedAt < 20 * 60_000) return session;
  // After a hard failure, give the endpoint a rest instead of re-handshaking
  // on every poll.
  if (Date.now() - sessionFailedAt < 60_000) return null;
  if (bootstrapping) return bootstrapping;

  bootstrapping = (async () => {
    try {
      // 1. seed cookie: fc.yahoo.com 404s on purpose while setting A1/A3.
      const seed = await raw('https://fc.yahoo.com', { retries: 1, timeoutMs: 8_000 });
      if (!seed.ok || [401, 403, 429].includes(seed.res.status)) { sessionFailedAt = Date.now(); yahooCooldown(30 * 60_000); return null; }
      storeCookies(seed.res.headers);
      const crumbRes = await raw(`${BASE}/v1/test/getcrumb`, {
        retries: 2,
        timeoutMs: 8_000,
        headers: cookieHeader() ? { Cookie: cookieHeader() } : {},
      });
      if (!crumbRes.ok || crumbRes.res.status !== 200) {
        sessionFailedAt = Date.now();
        yahooCooldown(30 * 60_000);
        return null;
      }
      storeCookies(crumbRes.res.headers);
      const crumb = crumbRes.res.body.trim();
      if (!CRUMB_SHAPE.test(crumb) || crumb.startsWith('Too Many')) {
        sessionFailedAt = Date.now();
        return null;
      }
      session = { cookie: cookieHeader(), crumb, obtainedAt: Date.now() };
      return session;
    } finally {
      bootstrapping = null;
    }
  })();
  return bootstrapping;
}

function invalidateSession(): void {
  session = null;
  sessionFailedAt = Date.now();
}

function withSession(headers: Record<string, string>): Record<string, string> {
  const cookie = cookieHeader();
  return cookie ? { ...headers, Cookie: cookie } : headers;
}

/**
 * Crumb-free quote path.
 *
 * `/v8/finance/chart` needs no session and its `meta` block carries a complete
 * last-price record. It costs one request per symbol, so it is only used for
 * small batches and as failover when the batched endpoint is unavailable.
 */
async function quotesViaChart(instruments: Instrument[], tier: FeedTier): Promise<Quote[]> {
  const out: Quote[] = [];
  for (const instrument of instruments) {
    const symbol = symbolFor(instrument, 'yahoo');
    if (!symbol) continue;
    const res = await fetchJson<YahooChartResponse>(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      query: { range: '1d', interval: '1m', includePrePost: 'false' },
      retries: 1,
      timeoutMs: 6_000,
      headers: withSession({}),
    });
    if (!res.ok) {
      if (res.error.kind === 'rate-limit') {
        yahooCooldown(Math.max(res.error.retryAfterMs ?? 0, 30 * 60_000));
        break;
      }
      continue;
    }
    const meta = res.data.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') continue;
    const prev = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : null;
    out.push({
      instrumentId: instrument.id,
      last: meta.regularMarketPrice,
      previousClose: prev,
      change: prev === null ? null : meta.regularMarketPrice - prev,
      changePercent: prev === null || prev === 0 ? null : ((meta.regularMarketPrice - prev) / prev) * 100,
      dayHigh: null,
      dayLow: null,
      open: null,
      volume: null,
      exchangeTimestamp: typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : null,
      receivedAt: Date.now(),
      tier,
      quality: 'cached',
      provider: 'yahoo',
      session: null,
      currency: instrument.currency,
      marketCap: null,
      vendorName: typeof meta.longName === 'string' ? meta.longName : null,
    });
  }
  return out;
}

export class YahooProvider implements MarketDataProvider {
  readonly id = 'yahoo' as const;
  readonly label = 'Yahoo Finance (public endpoints)';
  /** Yahoo's coverage is broad; routing decisions live in registry.ts. */
  readonly markets: MarketCode[] = ['US', 'CN', 'HK', 'JP', 'KR', 'TW', 'IN', 'AU', 'DE', 'FR', 'GB', 'EU', 'BR'];
  readonly capabilities = {
    quotes: true,
    historicalBars: true,
    search: true,
    metadata: true,
    push: false,
    news: true,
  };

  declaredTier(_market: MarketCode): FeedTier {
    // No documented latency for the public endpoints: never claim realtime.
    return 'unverified';
  }

  /* --------------------------------------------------------------- quotes */

  async getQuotes(instruments: Instrument[]): Promise<CapabilityResult<Quote[]>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    if (yahooCoolingDownMs() > 0) {
      return err('rate-limited', `Yahoo feed throttled; retrying in ${Math.ceil(yahooCoolingDownMs() / 1000)}s`, yahooCoolingDownMs());
    }
    const wanted = instruments.filter((i) => symbolFor(i, 'yahoo'));
    if (wanted.length === 0) return ok([]);
    if (process.env.TOMTRADER_DATA_MODE === 'personal') {
      const viaChart = await quotesViaChart(wanted.slice(0, 6), this.declaredTier(wanted[0]?.market ?? 'US'));
      return viaChart.length ? ok(viaChart) : err('network', 'Yahoo public chart quotes unavailable; a refusal is not retried through an authenticated endpoint.');
    }
    const out: Quote[] = [];
    const s = await getSession();

    if (!s && yahooCoolingDownMs() > 0) return err('rate-limited', 'Yahoo access refused; provider is cooling down.', yahooCoolingDownMs());
    if (!s) {
      // No crumb: the per-symbol chart endpoint is the only remaining path.
      // It is capped — the service layer labels anything beyond this untried.
      // Bounded deliberately: the chart endpoint is one request per symbol, so
      // this path can never be used to refresh a whole watchlist.
      const viaChart = await quotesViaChart(wanted.slice(0, 6), this.declaredTier(wanted[0]?.market ?? 'US'));
      if (viaChart.length) return ok(viaChart);
      // Back off as if throttled: a failed handshake is an endpoint problem,
      // and retrying it on every component render is how the page stalls.
      yahooCooldown(25_000);
      return err('network', 'Yahoo session handshake failed (cookie/crumb) and the chart fallback returned nothing');
    }

    const chunks: Instrument[][] = [];
    for (let i = 0; i < wanted.length; i += 50) chunks.push(wanted.slice(i, i + 50));

    for (let c = 0; c < chunks.length; c++) {
      const symbols = chunks[c].map((i) => symbolFor(i, 'yahoo')!).join(',');
      const res = await fetchJson<{ quoteResponse?: { result?: YahooQuoteRow[] }; quote?: YahooQuoteRow[] }>(`${BASE}/v7/finance/quote`, {
        query: { symbols, crumb: s.crumb },
        headers: withSession({}),
        retries: 2,
        timeoutMs: 12_000,
        priority: true,
      });
      if (!res.ok) {
        if (res.error.kind === 'rate-limit') yahooCooldown(Math.max(res.error.retryAfterMs ?? 0, 30 * 60_000));
        if (res.error.status === 401 || res.error.status === 403) invalidateSession();
        if (c === 0) {
          if (res.error.status === 401 || res.error.status === 403) { yahooCooldown(30 * 60_000); return err('unsupported', 'Yahoo access refused; no alternate endpoint is used to bypass the refusal.'); }
          return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
        }
        continue; // partial success is better than nothing, and is labelled
      }
      const rows = res.data.quoteResponse?.result ?? res.data.quote ?? [];
      for (const row of rows) {
        const instrument = chunks[c].find((i) => symbolFor(i, 'yahoo') === row.symbol);
        if (!instrument) continue;
        out.push(mapQuote(instrument, row, this.declaredTier(instrument.market)));
      }
      if (c < chunks.length - 1) await sleep(120);
    }
    return ok(out);
  }

  /* ----------------------------------------------------------- bar series */

  async getBars(
    instrument: Instrument,
    range: keyof typeof RANGE_PLAN,
    interval: BarInterval,
  ): Promise<CapabilityResult<Bars>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    if (yahooCoolingDownMs() > 0) return err('rate-limited', 'Yahoo is cooling down after an access/rate refusal', yahooCoolingDownMs());
    const symbol = symbolFor(instrument, 'yahoo');
    if (!symbol) return err('not-found', `no Yahoo symbol for ${instrument.id}`);
    const plan = RANGE_PLAN[range];
    const res = await fetchJson<YahooChartResponse>(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      query: {
        range: plan.yahooRange,
        interval: interval === '1wk' || interval === '1mo' ? plan.yahooInterval : interval,
        includePrePost: 'false',
        events: 'div,split',
      },
      retries: 2,
      timeoutMs: 15_000,
    });
    if (!res.ok) { if (res.error.kind === 'rate-limit') yahooCooldown(Math.max(res.error.retryAfterMs ?? 0, 30 * 60_000)); return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs); }

    const result = res.data.chart?.result?.[0];
    if (!result?.timestamp?.length) {
      const desc = res.data.chart?.error?.description ?? 'no bars returned';
      return err('not-found', `${symbol}: ${desc}`);
    }

    const ts = result.timestamp;
    const q = result.indicators?.quote?.[0] ?? {};
    const closes = q.close ?? [];
    const opens = q.open ?? [];
    const highs = q.high ?? [];
    const lows = q.low ?? [];
    const vols = q.volume ?? [];

    const bars = ts
      .map((time, i) => {
        const close = closes[i];
        if (time === undefined || close === null || close === undefined) return null;
        return {
          time,
          open: opens[i] ?? close,
          high: highs[i] ?? close,
          low: lows[i] ?? close,
          close,
          volume: vols[i] ?? null,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    if (bars.length < 2) return err('not-found', `${symbol}: insufficient history (${bars.length} bars)`);

    const meta = result.meta ?? {};
    const splits = (result.events?.splits ?? {}) as Record<string, { numerator?: number; denominator?: number }>;
    const hasSplits = Object.keys(splits).length > 0;

    return ok({
      instrumentId: instrument.id,
      range,
      interval,
      bars,
      // Yahoo's chart feed returns split-adjusted prices for the requested
      // window; dividend adjustment is NOT applied by this endpoint.
      adjusted: hasSplits || interval === '1d',
      adjustment: 'split-only',
      meta: {
        currency: (meta.currency as Quote['currency']) ?? instrument.currency,
        exchangeTimezone: meta.exchangeTimezoneName ?? 'UTC',
        lastBarAt: bars.length ? bars[bars.length - 1].time : null,
        receivedAt: Date.now(),
        tier: this.declaredTier(instrument.market),
        provider: 'yahoo',
      },
    });
  }

  async getHistoricalBars(
    instrument: Instrument,
    range: keyof typeof RANGE_PLAN,
    interval: BarInterval,
  ): Promise<CapabilityResult<Bars>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    return this.getBars(instrument, range, interval);
  }

  /* --------------------------------------------------------------- search */

  async search(query: string): Promise<CapabilityResult<SearchResult[]>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    const res = await fetchJson<YahooSearchResponse>(`${BASE}/v1/finance/search`, {
      query: { q: query, quotesCount: 12, newsCount: 0, enableFuzzy: 'true' },
      retries: 2,
      timeoutMs: 10_000,
    });
    if (!res.ok) { if (res.error.kind === 'rate-limit') yahooCooldown(Math.max(res.error.retryAfterMs ?? 0, 30 * 60_000)); return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs); }

    const rows = res.data.quotes ?? [];
    const results: SearchResult[] = [];
    for (const row of rows) {
      const assetType = mapVendorAssetType(row.quoteType);
      if (!assetType || !row.symbol) continue;
      const venue = resolveVendorExchange(row.exch ?? row.exchange, row.exchDisp ?? row.typeDisp);
      if (!venue) continue;
      const currency = normalizeCurrency(row.currency, currencyForMarket(venue.market));
      const display = prettyVendorSymbol(row.symbol);
      results.push({
        instrument: {
          id: makeInstrumentId(assetType, venue.market, display),
          displaySymbol: display,
          vendorSymbol: row.symbol,
          name: row.longname ?? row.shortname ?? row.symbol,
          nameZh: null,
          assetType,
          market: venue.market,
          exchange: venue.exchange,
          currency,
        },
        matchedOn: row.symbol.toLowerCase() === query.toLowerCase() ? 'symbol' : 'name',
        lastQuoteAt: null,
      });
    }
    return ok(results);
  }

  /* ------------------------------------------------------------ metadata */

  async getMetadata(instrument: Instrument): Promise<CapabilityResult<InstrumentMetadata>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    if (yahooCoolingDownMs() > 0) return err('rate-limited', 'Yahoo is cooling down after an access/rate refusal', yahooCoolingDownMs());
    const symbol = symbolFor(instrument, 'yahoo');
    if (!symbol) return err('not-found', `no Yahoo symbol for ${instrument.id}`);
    const s = await getSession();
    const modules = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile';
    const res = await fetchJson<YahooSummaryResponse>(`${API}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
      query: s ? { modules, crumb: s.crumb } : { modules },
      headers: withSession({}),
      retries: 2,
      timeoutMs: 12_000,
    });
    if (!res.ok) { if (res.error.kind === 'rate-limit') yahooCooldown(Math.max(res.error.retryAfterMs ?? 0, 30 * 60_000)); return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs); }

    const r = res.data.quoteSummary?.[0];
    if (!r) return err('not-found', `${symbol}: no fundamentals`);

    const num = (v: unknown): number | null => {
      const raw = (v as { raw?: unknown } | undefined)?.raw;
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    };
    const price = r.price ?? {};
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const fd = r.financialData ?? {};
    const ap = r.assetProfile ?? {};

    return ok({
      instrumentId: instrument.id,
      name: asString(price.longName) ?? instrument.name,
      nameZh: instrument.nameZh,
      description: asString(fd.businessSummary) ?? null,
      sector: asString(ap.sector) ?? null,
      industry: asString(ap.industry) ?? null,
      headquarters: asString(ap.address) ?? (asString(ap.city) ? `${asString(ap.city)}, ${asString(ap.country)}` : null),
      website: asString(ap.website) ?? null,
      founded: num(ap.founded),
      employees: num(ap.fullTimeEmployees),
      currency: (instrument.currency as Quote['currency']) ?? 'USD',
      exchange: instrument.exchange,
      fullExchangeName: asString(price.fullExchangeName) ?? null,
      marketCap: num(sd.marketCap) ?? num(fd.marketCap),
      peRatio: num(sd.trailingPE),
      eps: num(ks.trailingEps) ?? num(fd.epsTrailing),
      dividendYield: num(sd.dividendYield),
      week52High: num(sd.fiftyTwoWeekHigh) ?? num(ks.fiftyTwoWeekHigh),
      week52Low: num(sd.fiftyTwoWeekLow) ?? num(ks.fiftyTwoWeekLow),
      averageVolume: num(sd.averageVolume) ?? num(ks.averageDailyVolume3Month),
      previousClose: num(sd.previousClose) ?? num(price.chartPreviousClose),
      sharesOutstanding: num(fd.sharesOutstanding) ?? num(ks.sharesOutstanding),
      provider: 'yahoo',
      receivedAt: Date.now(),
    });
  }

  /* ---------------------------------------------------------------- news */

  async getNews(instrument: Instrument | null, limit = 12): Promise<CapabilityResult<NewsItem[]>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    const q = instrument ? instrument.name.split('(')[0].slice(0, 40) : 'stock market';
    const res = await fetchJson<YahooSearchResponse>(`${BASE}/v1/finance/search`, {
      query: { q, quotesCount: 0, newsCount: limit },
      retries: 2,
      timeoutMs: 10_000,
    });
    if (!res.ok) { if (res.error.kind === 'rate-limit') yahooCooldown(Math.max(res.error.retryAfterMs ?? 0, 30 * 60_000)); return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs); }

    const items = (res.data.news ?? [])
      .filter((n) => n.title && n.link && n.providerPublishTime)
      .map((n) => ({
        id: `yahoo-news:${n.id ?? hash(n.link ?? n.title ?? 'item')}`,
        title: n.title!,
        publisher: n.publisher ?? 'Yahoo Finance',
        publishedAt: (n.providerPublishTime ?? 0) * 1000,
        url: n.link!,
        symbols: instrument ? [instrument.id] : [],
        category: n.type ?? null,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
        provider: 'yahoo' as const,
      }));
    return ok(items);
  }
}

/* ------------------------------------------------------------------ helpers */

interface YahooQuoteRow {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  chartPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketOpen?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
  marketState?: string;
  currency?: string;
  preMarketPrice?: number;
  postMarketPrice?: number;
  marketCap?: number;
  longName?: string;
  shortName?: string;
}

function mapQuote(instrument: Instrument, row: YahooQuoteRow, tier: FeedTier): Quote {
  const last = row.regularMarketPrice ?? row.postMarketPrice ?? row.preMarketPrice ?? null;
  const prev = row.regularMarketPreviousClose ?? row.chartPreviousClose ?? null;
  const change = typeof row.regularMarketChange === 'number' ? row.regularMarketChange : last !== null && prev !== null ? last - prev : null;
  const pct =
    typeof row.regularMarketChangePercent === 'number'
      ? row.regularMarketChangePercent
      : change !== null && prev
        ? (change / prev) * 100
        : null;

  return {
    instrumentId: instrument.id,
    last: last ?? Number.NaN,
    previousClose: prev,
    change: last === null ? null : change,
    changePercent: last === null ? null : pct,
    dayHigh: row.regularMarketDayHigh ?? null,
    dayLow: row.regularMarketDayLow ?? null,
    open: row.regularMarketOpen ?? null,
    volume: row.regularMarketVolume ?? null,
    exchangeTimestamp: row.regularMarketTime ?? null,
    receivedAt: Date.now(),
    tier,
    // Set by the service layer once it knows the venue's session state.
    quality: 'cached',
    provider: 'yahoo',
    session: sessionOf(row.marketState),
    currency: instrument.currency,
    // An index has no market capitalisation. What a vendor reports for one is
    // the aggregate value of its constituents, which is a different quantity,
    // so it is not carried into a field the UI labels "market cap".
    marketCap: instrument.assetType === 'index' ? null : typeof row.marketCap === 'number' && row.marketCap > 0 ? row.marketCap : null,
    vendorName: row.longName ?? row.shortName ?? null,
  };
}

function sessionOf(state: string | undefined): Quote['session'] {
  switch (state) {
    case 'PRE':
      return 'pre';
    case 'REGULAR':
      return 'regular';
    case 'POST':
    case 'POSTPOST':
      return 'post';
    case 'CLOSED':
    case 'CLOSED_DELAYED':
      return 'closed';
    default:
      return null;
  }
}

interface YahooChartResponse {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
      meta?: {
        currency?: string;
        symbol?: string;
        longName?: string;
        exchangeTimezoneName?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        chartPreviousClose?: number;
      };
      events?: { splits?: Record<string, unknown>; dividends?: Record<string, unknown> };
    }[];
    error?: { description?: string };
  };
}

interface YahooSearchResponse {
  quotes?: {
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    exch?: string;
    exchDisp?: string;
    quoteType?: string;
    currency?: string;
    typeDisp?: string;
  }[];
  news?: {
    id?: string;
    title?: string;
    publisher?: string;
    link?: string;
    providerPublishTime?: number;
    type?: string;
    thumbnail?: { resolutions?: { url: string }[] };
  }[];
}

interface YahooSummaryResponse {
  quoteSummary?: {
    price?: Record<string, { raw?: number } | string | number | undefined> & { longName?: string; fullExchangeName?: string };
    summaryDetail?: Record<string, { raw?: number } | undefined>;
    defaultKeyStatistics?: Record<string, { raw?: number } | undefined>;
    financialData?: Record<string, { raw?: number } | string | undefined>;
    assetProfile?: Record<string, { raw?: number } | string | undefined>;
  }[];
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Yahoo's suffix style is a vendor convention, not a trading symbol.
 * Turn `0700.HK` back into the form traders write (`0700.HK` stays, `600519.SS`
 * stays, `7203.T` stays) — but drop the vendor-only `.US` noise.
 */
export function prettyVendorSymbol(symbol: string): string {
  if (symbol.startsWith('^')) return symbol;
  return symbol.endsWith('.US') ? symbol.slice(0, -3) : symbol;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export const yahoo = new YahooProvider();
