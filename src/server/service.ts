import type {
AlertEvaluation,
ClockRow,
HeatmapCell,
OverviewResponse,
QuoteSnapshot,
SearchResponse,
SourceHealth,
} from '../shared/api';
import {
TTL,
cacheStats,
peek,
persistAll,
persistBars,
persistFx,
persistMeta,
persistNews,
put,
restoreBars,
restoreFx,
restoreMeta,
restoreQuotes
} from './cache';
import { getDb,logProviderEvent } from './db';
import { EXCHANGES } from './exchanges';
import { classifyFreshness } from './freshness';
import { hostHealthSnapshot,queueDepth } from './http';
import {
ALL_INDEX_IDS,
BY_ID,
FEATURED_IDS,
HEATMAP_POOLS,
OVERVIEW_GROUPS,
UNIVERSE,
} from './instruments';
import { addDaysToLocalDate,getMarketStatus,planDay,zoned } from './marketstatus';
import { publicFeedsEnabled } from './providers/access';
import { demo } from './providers/demo';
import { eastmoney } from './providers/eastmoney';
import { finnhub } from './providers/finnhub';
import { getFxRates } from './providers/fx';
import { getMarketWire,getPolicyNews } from './providers/news';
import { RANGE_PLAN,symbolFor,type MarketDataProvider } from './providers/provider';
import { tencent,tencentCode } from './providers/tencent';
import { yahoo } from './providers/yahoo';
import type {
BarInterval,
BarRange,
Bars,
CapabilityResult,
CurrencyCode,
ExchangeCode,
FxRate,
Instrument,
InstrumentMetadata,
MarketCode,
MarketStatus,
NewsItem,
PriceAlert,
ProviderId,
Quote,
SearchResult,
} from './types';
import { err } from './types';
import { withDeadline } from './util';
import { assertInstrumentId,currencyForMarket,normalizeCurrency } from './vendorsymbols';

/* --------------------------------------------------------------------------
 * Provider registry and routing
 * ----------------------------------------------------------------------- */

const DEMO_MODE = process.env.TOMTRADER_DEMO === '1';

const PROVIDERS: Partial<Record<ProviderId, MarketDataProvider>> = {
  finnhub,
  yahoo,
  eastmoney,
  tencent,
  demo,
};

export function isDemoMode(): boolean {
  return DEMO_MODE;
}

/**
 * Provider order per market. The first provider that answers wins; the rest
 * are failover. Eastmoney is preferred for the markets it covers because it
 * prints fresher A-share/HK data than Yahoo's, and both are `unverified` tiers
 * so neither can claim liveness.
 */
export function route(instrument: Instrument): ProviderId[] {
  if (DEMO_MODE) return BY_ID.has(instrument.id) || readRegistry(instrument.id) ? ['demo'] : [];
  const official: ProviderId[] = process.env.FINNHUB_API_KEY && instrument.market === 'US' && ['equity', 'etf'].includes(instrument.assetType) ? ['finnhub'] : [];
  if (!publicFeedsEnabled()) return official;
  const hasEast = Boolean(symbolFor(instrument, 'eastmoney'));
  const hasTencent = Boolean(tencentCode(instrument));
  // Personal mode: use the batched source verified on this host before per-symbol Yahoo reads.
  return compactOrder([...official, hasEast ? 'eastmoney' : null, hasTencent ? 'tencent' : null, 'yahoo']);
}

/** De-duplicated provider order, dropping feeds that have no symbol for this instrument. */
function compactOrder(list: (ProviderId | null)[]): ProviderId[] {
  const out: ProviderId[] = [];
  for (const id of list) {
    if (!id) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

interface HealthRecord {
  provider: ProviderId;
  label: string;
  ok: boolean;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  consecutiveErrors: number;
  cooldownMs: number;
}

const health = new Map<ProviderId, HealthRecord>();

function healthOf(provider: ProviderId): HealthRecord {
  let h = health.get(provider);
  if (!h) {
    const p = PROVIDERS[provider];
    h = {
      provider,
      label: p?.label ?? provider,
      ok: true,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveErrors: 0,
      cooldownMs: 0,
    };
    health.set(provider, h);
  }
  return h;
}

/**
 * Provider guard: cooldown + health bookkeeping.
 *
 * Skipping a provider that just failed is not pessimism, it is what keeps the
 * page usable: while a vendor is throttling us, every remaining request is
 * better spent on the providers that still answer, and the instruments we
 * cannot refresh keep their cached values with an honest `stale`/`cached`
 * label plus the reason in `snapshot.issue`.
 */
async function callProvider<T>(
  provider: ProviderId,
  op: string,
  fn: () => Promise<CapabilityResult<T>>,
): Promise<CapabilityResult<T>> {
  const h = healthOf(provider);
  if (!h.ok && h.cooldownMs > 0 && h.lastAttemptAt && Date.now() - h.lastAttemptAt < h.cooldownMs) {
    const remaining = h.cooldownMs - (Date.now() - h.lastAttemptAt);
    // Record the reason even though this call never reached the network: the
    // Settings panel must never show a provider as unhealthy without saying why.
    h.lastError = `cooling down ${Math.ceil(remaining / 1000)}s after ${h.consecutiveErrors} failure(s) — ${h.lastError ?? 'no detail'}`;
    return err('rate-limited', h.lastError, remaining);
  }
  h.lastAttemptAt = Date.now();
  const result = await fn().catch((e): CapabilityResult<T> => err('network', String((e as Error)?.message ?? e)));
  if (!result.ok && ['unsupported', 'not-found', 'no-key'].includes(result.reason)) {
    logProviderEvent(provider, op, result.reason, result.message);
    return result;
  }
  if (result.ok) {
    h.ok = true;
    h.lastSuccessAt = Date.now();
    h.lastError = null;
    h.consecutiveErrors = 0;
    h.cooldownMs = 0;
  } else {
    h.consecutiveErrors += 1;
    h.lastError = `${result.reason}: ${result.message}`;
    h.cooldownMs = Math.max(
      result.retryAfterMs ?? 0,
      result.reason === 'rate-limited' ? 30_000 : 5_000,
      Math.min(60_000 * h.consecutiveErrors, 5 * 60_000),
    );
    h.ok = false;
    logProviderEvent(provider, op, result.reason, result.message);
  }
  return result;
}

export function providerHealth(): SourceHealth[] {
  const host = hostHealthSnapshot();
  const ids = Object.keys(PROVIDERS) as ProviderId[];
  return ids.map((id) => {
    const h = healthOf(id);
    const enabled = id === 'demo' ? DEMO_MODE : id === 'finnhub' ? Boolean(process.env.FINNHUB_API_KEY) : publicFeedsEnabled();
    const p = PROVIDERS[id]!;
    const queue = Object.entries(host)
      .filter(([k]) => k.includes('yahoo') && id === 'yahoo' ? true : k.includes('eastmoney') && id === 'eastmoney')
      .reduce((n, [, v]) => n + v.running + v.queued, 0);
    return {
      provider: id,
      label: p.label,
      ok: enabled && h.ok && h.lastSuccessAt !== null,
      lastAttemptAt: h.lastAttemptAt,
      lastSuccessAt: h.lastSuccessAt,
      lastError: enabled ? h.lastError : id === 'finnhub' ? 'FINNHUB_API_KEY not configured' : id === 'demo' ? 'Demo disabled' : 'Public adapter disabled; data rights not confirmed',
      consecutiveErrors: h.consecutiveErrors,
      cooldownMs: h.cooldownMs,
      tier: p.declaredTier('US'),
      note:
        id === 'finnhub' ? 'Official keyed API. US equities and ETFs only; account entitlements apply. REST polling, no upstream push. Latency unverified unless configured from account documentation.' : id === 'yahoo'
          ? `Unofficial public endpoints. No documented latency or quota. Queue depth ${queue}.`
          : id === 'eastmoney'
            ? 'Public web endpoints for China A-shares and Hong Kong. Volume normalised from 手 to shares.'
            : id === 'tencent'
          ? 'Public quote endpoint used as failover. It does not supply volume (units are not documented per market), so volume shows as “—” when Tencent is the only responder.'
          : 'Synthetic data. Nothing shown from this provider is real market data.',
    };
  });
}

/* --------------------------------------------------------------------------
 * Instrument resolution
 * ----------------------------------------------------------------------- */

const dynamic = new Map<string, Instrument>();

export function resolveInstrument(id: string): Instrument | null {
  const known = BY_ID.get(id) ?? dynamic.get(id);
  if (known) return known;
  if (!assertInstrumentId(id)) return null;
  // `equity:US:AAPL` style ids are self-describing: accept them so a symbol a
  // user searched for keeps working after a restart, even before the registry
  // row has been written.
  const parts = id.split(':');
  const assetType = parts[0] as Instrument['assetType'];
  const market = parts[1] as MarketCode;
  const symbol = parts.slice(2).join(':');
  if (!assetType || !market || !symbol || !EXCHANGES[exchangeFor(market)]) return null;
  const inferred: Instrument = {
    id,
    displaySymbol: symbol,
    vendorSymbol: symbol,
    providerSymbols: { yahoo: symbol },
    name: symbol,
    nameZh: null,
    assetType,
    market,
    exchange: exchangeFor(market),
    currency: currencyForMarket(market),
  };
  const persisted = readRegistry(id);
  const resolved = persisted ?? inferred;
  dynamic.set(id, resolved);
  return resolved;
}

function exchangeFor(market: MarketCode): ExchangeCode {
  const map: Partial<Record<MarketCode, ExchangeCode>> = {
    US: 'XNYS',
    CN: 'CNE',
    HK: 'HKEX',
    JP: 'XTKS',
    KR: 'KRX',
    TW: 'TWSE',
    IN: 'NSE',
    AU: 'ASX',
    DE: 'XETRA',
    FR: 'XPAF',
    GB: 'XLON',
    NL: 'XEUR',
    EU: 'XEUR',
    BR: 'BVMF',
    FX: 'OTC',
  };
  return map[market] ?? 'OTC';
}

function readRegistry(id: string): Instrument | null {
  try {
    const row = getDb().prepare('SELECT payload FROM instrument_registry WHERE id = ?').get(id) as { payload: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.payload) as Instrument;
  } catch {
    return null;
  }
}

/** Remember a vendor-discovered instrument so watchlists survive restarts. */
export function registerInstrument(instrument: Instrument): void {
  if (!assertInstrumentId(instrument.id)) return;
  dynamic.set(instrument.id, instrument);
  try {
    getDb()
      .prepare(
        `INSERT INTO instrument_registry (id, payload, created_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      )
      .run(instrument.id, JSON.stringify(instrument), Date.now());
  } catch (e) {
    logProviderEvent('calendar', 'register-instrument', 'parse-error', String((e as Error).message));
  }
}

/**
 * Enrich an instrument from a quote we already have — carefully.
 *
 * Vendor feeds return the trading name *in their own locale*: Eastmoney sends
 * 苹果 for Apple, Yahoo sends "Apple". Neither is wrong, but overwriting the
 * curated English name with a Chinese one (or the reverse) would make the
 * interface language a side effect of which feed happened to answer. So the
 * vendor name only fills a gap, and it lands in the field for its own script.
 */
function enrichFromQuote(instrument: Instrument, quote: Quote): Instrument {
  const vendor = quote.vendorName?.trim();
  if (!vendor) return instrument;
  const cjk = /[\u3400-\u9fff]/.test(vendor);
  // A pure number or ticker-shaped string is not a name (some feeds put the
  // previous close in the name field).
  if (/^[\d.,%\-]+$/.test(vendor)) return instrument;

  if (cjk && !instrument.nameZh) {
    const merged = { ...instrument, nameZh: vendor };
    dynamic.set(instrument.id, merged);
    return merged;
  }
  if (!cjk && (instrument.name === instrument.displaySymbol || !instrument.name)) {
    const merged = { ...instrument, name: vendor };
    dynamic.set(instrument.id, merged);
    return merged;
  }
  return instrument;
}

/* --------------------------------------------------------------------------
 * Snapshots: quote + venue status + honest freshness
 * ----------------------------------------------------------------------- */

const statusCache = new Map<string, { at: number; status: MarketStatus }>();

export function marketStatusFor(exchange: ExchangeCode, nowMs: number): MarketStatus {
  const bucket = Math.floor(nowMs / 30_000);
  const key = `${exchange}@${bucket}`;
  const hit = statusCache.get(key);
  if (hit) return hit.status;
  const status = getMarketStatus(exchange, nowMs);
  if (statusCache.size > 400) statusCache.clear();
  statusCache.set(key, { at: nowMs, status });
  return status;
}

export function snapshotOf(instrument: Instrument, quote: Quote | null, nowMs = Date.now()): QuoteSnapshot {
  const status = marketStatusFor(instrument.exchange, nowMs);
  if (!quote) {
    return { instrument, quote: null, status, issue: null };
  }
  const freshness = classifyFreshness({
    tier: quote.tier,
    receivedAt: quote.receivedAt,
    exchangeTimestamp: quote.exchangeTimestamp,
    marketOpen: status.state === 'open',
    // A midday break keeps today's prints "delayed"; only a finished session
    // turns them into "cached".
    inSessionWindow: venueInSessionWindow(instrument.exchange, nowMs),
    nowMs,
  });
  const enriched = enrichFromQuote(instrument, quote);
  return {
    instrument: enriched,
    quote: { ...quote, quality: freshness.quality },
    status,
    issue: null,
  };
}

/* --------------------------------------------------------------------------
 * Quote fetching
 * ----------------------------------------------------------------------- */

export interface QuoteIssue {
  provider: string;
  reason: string;
  message: string;
  at: number;
}

interface RefreshResult {
  quotes: Map<string, Quote>;
  issues: Map<string, QuoteIssue>;
}

const quoteRefreshListeners = new Set<() => void>();
/** Notify the stream after a background vendor response has actually reached the cache. */
export function onQuotesRefreshed(listener: () => void): () => void {
  quoteRefreshListeners.add(listener);
  return () => { quoteRefreshListeners.delete(listener); };
}

const groupFlights = new Map<string, Promise<RefreshResult>>();

/**
 * Fetch a batch of quotes, splitting by provider so one HTTP call covers as
 * many instruments as possible. Failover: if the preferred provider for a
 * market fails, the next one in `route()` is tried for those instruments only.
 */
/**
 * Does this provider have a key for this instrument? Yahoo and Eastmoney are
 * mapped explicitly in `instruments.ts`; Tencent derives its code from the
 * market and symbol, so it needs its own predicate rather than a symbol map.
 */
function canServe(instrument: Instrument, providerId: ProviderId): boolean {
  if (providerId === 'finnhub') return instrument.market === 'US' && ['equity', 'etf'].includes(instrument.assetType);
  if (providerId === 'tencent') return Boolean(tencentCode(instrument));
  return Boolean(symbolFor(instrument, providerId));
}

/** `interactive` marks a fetch that a rendered page is waiting on. */
export async function refreshQuotes(ids: string[], opts: { interactive?: boolean } = {}): Promise<RefreshResult> {
  void opts;
  const key = ids.slice().sort().join(',');
  const existing = groupFlights.get(key);
  if (existing) return existing;

  const p = (async (): Promise<RefreshResult> => {
    const quotes = new Map<string, Quote>();
    const issues = new Map<string, QuoteIssue>();
    const instruments = ids.map(resolveInstrument).filter((i): i is Instrument => Boolean(i));

    // Group every instrument by its first-choice provider.
    const byProvider = new Map<ProviderId, Instrument[]>();
    for (const instrument of instruments) {
      const [first] = route(instrument);
      if (!first) { issues.set(instrument.id, { provider: 'configuration', reason: 'no-key', message: 'No authorized provider configured for this market. Cached data may be shown; configure a provider in .env.local.', at: Date.now() }); continue; }
      const list = byProvider.get(first) ?? [];
      list.push(instrument);
      byProvider.set(first, list);
    }

    const leftovers: Instrument[] = [];

    // Provider groups run concurrently. Sequentially, one throttled feed would
    // starve every other market on the page and the request budget would be
    // spent waiting on a vendor we already know is refusing us.
    const groupResults = await Promise.all(
      [...byProvider.entries()].map(async ([providerId, list]) => {
        const provider = PROVIDERS[providerId];
        if (!provider?.capabilities.quotes) return { providerId, list, quotes: [] as Quote[], issue: null as QuoteIssue | null };
        const res = await callProvider(providerId, 'getQuotes', () => provider.getQuotes(list));
        if (res.ok) {
          const got = res.data.filter((q) => Number.isFinite(q.last));
          return { providerId, list, quotes: got, issue: null };
        }
        return {
          providerId,
          list,
          quotes: [] as Quote[],
          issue: { provider: providerId, reason: res.reason, message: res.message, at: Date.now() } as QuoteIssue,
        };
      }),
    );

    for (const group of groupResults) {
      for (const q of group.quotes) quotes.set(q.instrumentId, q);
      if (group.issue) {
        for (const instrument of group.list) {
          if (!quotes.has(instrument.id)) {
            leftovers.push(instrument);
            issues.set(instrument.id, group.issue);
          }
        }
      } else {
        const covered = new Set(group.quotes.map((q) => q.instrumentId));
        for (const instrument of group.list) if (!covered.has(instrument.id)) leftovers.push(instrument);
      }
    }

    // Failover pass — batched per fallback provider, not per instrument.
    // Looping one request per symbol turned a throttled primary into 30
    // sequential calls, which is how a heatmap panel could take 20 seconds.
    const outstanding = dedupeInstruments(leftovers).filter((i) => !quotes.has(i.id));
    for (const providerId of ['eastmoney', 'tencent', 'yahoo'] as ProviderId[]) {
      const pending = outstanding.filter((i) => !quotes.has(i.id) && route(i).includes(providerId) && route(i)[0] !== providerId && canServe(i, providerId));
      if (!pending.length) continue;
      const provider = PROVIDERS[providerId];
      if (!provider?.capabilities.quotes) continue;
      const res = await callProvider(providerId, 'getQuotes:failover', () => provider.getQuotes(pending));
      if (res.ok) {
        for (const q of res.data) {
          if (Number.isFinite(q.last)) {
            quotes.set(q.instrumentId, q);
            issues.delete(q.instrumentId);
          }
        }
      } else {
        for (const instrument of pending) {
          if (!quotes.has(instrument.id)) issues.set(instrument.id, { provider: providerId, reason: res.reason, message: res.message, at: Date.now() });
        }
      }
    }

    if (quotes.size) {
      persistAll([...quotes.values()]);
      const tradingNow = new Set(
        instruments.filter((i) => marketStatusFor(i.exchange, Date.now()).state === 'open').map((i) => i.id),
      );
      for (const q of quotes.values()) {
        put('quote', q.instrumentId, q, tradingNow.has(q.instrumentId) ? quoteTtl(q, true) : quoteTtl(q, false), q.provider);
      }
      for (const listener of quoteRefreshListeners) { try { listener(); } catch { /* a client cannot fail vendor persistence */ } }
    }
    return { quotes, issues };
  })().finally(() => groupFlights.delete(key));

  groupFlights.set(key, p);
  return p;
}

/** Is the venue between the first open and the last close of its own today? */
export function venueInSessionWindow(exchange: ExchangeCode, nowMs: number): boolean {
  const info = EXCHANGES[exchange];
  if (!info) return false;
  const today = zoned(nowMs, info.timezone).date;
  for (const date of [shiftLocalDate(today, -1), today, shiftLocalDate(today, 1)]) {
    const plan = planDay(exchange, date);
    if (plan.closure !== 'none' || !plan.segments.length) continue;
    if (nowMs >= plan.segments[0].openAt && nowMs < plan.segments[plan.segments.length - 1].closeAt) return true;
  }
  return false;
}

function quoteTtl(q: Quote, open: boolean): number {
  if (!open) return TTL.quoteClosed;
  return q.provider === 'eastmoney' ? TTL.quoteOpenCn : TTL.quoteOpen;
}

function dedupeInstruments(list: Instrument[]): Instrument[] {
  const seen = new Set<string>();
  const out: Instrument[] = [];
  for (const i of list) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}

export interface SnapshotOptions {
  /**
   * `await` blocks on the vendor (detail pages, small batches).
   * `stale` answers immediately from memory/disk and refreshes in the
   * background, which is what the overview and watchlist need for fast paint.
   */
  mode: 'await' | 'stale' | 'first-run';
  /** Request budget for the vendor round trip. */
  deadlineMs?: number;
}

const inFlightStale = new Set<string>();

export async function getSnapshots(ids: string[], opts: SnapshotOptions): Promise<QuoteSnapshot[]> {
  const now = Date.now();
  const out = new Map<string, QuoteSnapshot>();
  const needsNetwork: string[] = [];

  if (opts.mode === 'stale' || opts.mode === 'first-run') {
    let freshCount = 0;
    const persisted = ids.every((id) => peek('quote', id)) ? null : restoreQuotes(ids);
    for (const id of ids) {
      const instrument = resolveInstrument(id);
      if (!instrument) continue;
      const fresh = peek<Quote>('quote', id);
      if (fresh && fresh.expiresAt > now) {
        out.set(id, snapshotOf(instrument, fresh.value, now));
        continue;
      }
      const stored = fresh?.value ?? persisted?.get(id)?.value ?? null;
      if (stored) {
        freshCount++;
        // Serve the known value immediately, marked stale/cached by the
        // classifier, and refresh behind the response.
        out.set(id, snapshotOf(instrument, stored, now));
      } else {
        out.set(id, { instrument, quote: null, status: marketStatusFor(instrument.exchange, now), issue: null });
      }
      needsNetwork.push(id);
    }
    // On a genuinely cold start there is nothing to show, so a short wait for
    // the vendor is better than an empty board: the UI then paints real values
    // and every later navigation is served from cache.
    if (opts.mode === 'first-run' && freshCount === 0 && needsNetwork.length) {
      const { value } = await withDeadline(refreshQuotes(needsNetwork), opts.deadlineMs ?? 3_500, { quotes: new Map(), issues: new Map() });
      for (const [id, q] of value.quotes) out.set(id, snapshotOf(resolveInstrument(id)!, q, Date.now()));
      for (const [id, issue] of value.issues) lastIssues.set(id, issue);
    }

    if (needsNetwork.length && !inFlightStale.has(needsNetwork.join(','))) {
      const group = needsNetwork.join(',');
      inFlightStale.add(group);
      void refreshQuotes(needsNetwork)
        .then((r) => {
          for (const [id, issue] of r.issues) lastIssues.set(id, issue);
          for (const q of r.quotes.values()) lastIssues.delete(q.instrumentId);
        })
        .finally(() => inFlightStale.delete(group));
    }
    // Attach the most recent failure so the UI can explain a frozen number.
    for (const [id, issue] of lastIssues) {
      const snap = out.get(id);
      if (snap) snap.issue = issue;
    }
    return ids.map((id) => out.get(id)).filter((s): s is QuoteSnapshot => Boolean(s));
  }

  // await mode — bounded, because a throttled vendor must not turn into a
  // 60-second page. Whatever arrived by the deadline is returned, and the
  // refresh keeps running behind it.
  const freshIds = ids.filter((id) => {
    const hit = peek<Quote>('quote', id);
    return !(hit && hit.expiresAt > now);
  });
  if (freshIds.length) {
    const { value: r, timedOut } = await withDeadline(refreshQuotes(freshIds), opts.deadlineMs ?? 4_500, {
      quotes: new Map<string, Quote>(),
      issues: new Map<string, QuoteIssue>(),
    });
    for (const [id, issue] of r.issues) lastIssues.set(id, issue);
    for (const q of r.quotes.values()) lastIssues.delete(q.instrumentId);
    if (timedOut) {
      for (const id of freshIds) {
        if (!r.quotes.has(id)) {
          lastIssues.set(id, { provider: 'pipeline', reason: 'timeout', message: 'vendor did not answer inside the request budget', at: Date.now() });
        }
      }
    }
  }
  const map = restoreQuotes(ids);
  for (const id of ids) {
    const instrument = resolveInstrument(id);
    if (!instrument) continue;
    const hit = peek<Quote>('quote', id)?.value ?? map.get(id)?.value ?? null;
    const snap = snapshotOf(instrument, hit, now);
    snap.issue = lastIssues.get(id) ?? null;
    out.set(id, snap);
  }
  return ids.map((id) => out.get(id)).filter((s): s is QuoteSnapshot => Boolean(s));
}

const lastIssues = new Map<string, QuoteSnapshot['issue']>();

/* --------------------------------------------------------------------------
 * History
 * -------------------------------------------------------------------------- */

export async function getBars(
  id: string,
  range: BarRange,
  interval?: BarInterval,
  opts: { await?: boolean } = {},
): Promise<{ bars: Bars | null; issue: string | null }> {
  const instrument = resolveInstrument(id);
  if (!instrument) return { bars: null, issue: 'unknown-instrument' };
  const plan = RANGE_PLAN[range];
  const useInterval = interval ?? plan.yahooInterval;
  const key = `${id}|${range}|${useInterval}`;

  const hit = peek<Bars>('bars', key);
  if (hit && hit.expiresAt > Date.now() && hit.value.interval === useInterval) {
    // Guarded on the read path as well, because rows written before the unit
    // fix are still on disk and would keep drawing a 59th-century axis.
    return { bars: assertBarTimesAreSeconds(hit.value, hit.provider as never), issue: null };
  }
  if (hit && opts.await !== true) {
    void fetchAndCacheBars(instrument, range, useInterval, key);
    return { bars: hit.value, issue: null };
  }
  const persisted = restoreBars(id, range, useInterval);
  if (persisted && opts.await !== true && Date.now() - persisted.storedAt < 6 * 3_600_000) {
    const repaired = assertBarTimesAreSeconds(persisted.value, persisted.provider as never);
    put('bars', key, repaired, 0, persisted.provider, persisted.storedAt);
    void fetchAndCacheBars(instrument, range, useInterval, key);
    return { bars: repaired, issue: null };
  }
  return fetchAndCacheBars(instrument, range, useInterval, key);
}

/**
 * Unit invariant: `Bar.time` is epoch *seconds* — the type says so, but two of
 * these vendors answer in milliseconds and one answers in seconds, and a
 * 1000× error silently moves a chart into the 59th century rather than
 * throwing. So the boundary checks it, corrects what it can recognise, and
 * logs what it had to fix.
 */
export function assertBarTimesAreSeconds(series: Bars, provider: ProviderId): Bars {
  const sample = series.bars[series.bars.length - 1]?.time ?? 0;
  // Anything above ~1e12 is a millisecond stamp for dates after 1973.
  const looksMs = Math.abs(sample) > 1e12;
  if (!looksMs) return series;
  logProviderEvent(provider, 'bar-times', 'corrected-ms-to-s', `last bar ${sample}`);
  const divisor = 1000;
  const bars = series.bars.map((b) => ({ ...b, time: Math.round(b.time / divisor) }));
  return { ...series, bars, meta: { ...series.meta, lastBarAt: bars.length ? Math.round((series.meta.lastBarAt ?? 0) / divisor) : null } };
}

function intradayTtl(interval: BarInterval, instrument: Instrument): number {
  const open = marketStatusFor(instrument.exchange, Date.now()).state === 'open';
  if (interval === '1d' || interval === '1wk' || interval === '1mo') return open ? TTL.barsDailyOpen : TTL.barsDailyClosed;
  return open ? TTL.barsIntradayOpen : TTL.barsIntradayClosed;
}

const barFlights = new Map<string, Promise<{ bars: Bars | null; issue: string | null }>>();

async function fetchAndCacheBars(instrument: Instrument, range: BarRange, interval: BarInterval, key: string) {
  const existing = barFlights.get(key);
  if (existing) return existing;
  const p = (async () => {
    for (const providerId of route(instrument)) {
      const provider = PROVIDERS[providerId];
      if (!provider?.capabilities.historicalBars) continue;
      const res = await callProvider(providerId, 'getHistoricalBars', () =>
        provider.getHistoricalBars(instrument, range, interval),
      );
      if (res.ok && res.data.bars.length >= 2) {
        const checked = assertBarTimesAreSeconds(res.data, providerId);
        put('bars', key, checked, intradayTtl(interval, instrument), providerId);
        persistBars(checked);
        return { bars: checked, issue: null };
      }
    }
    const stale = peek<Bars>('bars', key)?.value ?? restoreBars(instrument.id, range, interval)?.value ?? null;
    if (stale) return { bars: assertBarTimesAreSeconds(stale, 'yahoo'), issue: 'refresh-failed' };
    return { bars: stale, issue: stale ? 'refresh-failed' : 'unavailable' };
  })().finally(() => barFlights.delete(key));
  barFlights.set(key, p);
  return p;
}

/** Cheap trend line for index cards: last 30 daily closes from cache only. */
export function sparklineFromCache(id: string, points = 30): number[] | null {
  for (const key of [`${id}|3M|1d`, `${id}|1M|1d`, `${id}|6M|1d`, `${id}|1Y|1d`]) {
    const [barsId, range, interval] = key.split('|');
    const hit = peek<Bars>('bars', key)?.value ?? restoreBars(barsId, range, interval)?.value;
    if (!hit) continue;
    const closes = hit.bars.slice(-points).map((b) => b.close);
    if (closes.length >= 5) return closes;
  }
  return null;
}

/**
 * Background trend-line warm-up.
 *
 * Deliberately low-intensity: a burst of 25 history fetches on a feed that
 * allows one request per 250 ms would otherwise sit in front of every user
 * request for six seconds. So this walks the list in small batches on a timer
 * and stops as soon as the queue in front of it grows.
 */
export async function ensureSparklines(ids: string[], opts: { batchSize?: number; gapMs?: number } = {}): Promise<void> {
  const batchSize = opts.batchSize ?? 4;
  const gapMs = opts.gapMs ?? 1_200;
  const pending = ids.filter((id) => resolveInstrument(id) && !sparklineFromCache(id));
  for (let i = 0; i < pending.length; i += batchSize) {
    // Back off if interactive traffic is queued on any host.
    while (queueDepth() > 3) await new Promise((r) => setTimeout(r, 400));
    const slice = pending.slice(i, i + batchSize);
    await Promise.all(slice.map((id) => getBars(id, '3M', '1d', { await: false })));
    if (i + batchSize < pending.length) await new Promise((r) => setTimeout(r, gapMs));
  }
}

/* --------------------------------------------------------------------------
 * Metadata
 * ----------------------------------------------------------------------- */

export async function getMetadata(id: string): Promise<{ meta: InstrumentMetadata | null; issue: string | null }> {
  const instrument = resolveInstrument(id);
  if (!instrument) return { meta: null, issue: 'unknown-instrument' };
  const hit = peek<InstrumentMetadata>('meta', id);
  if (hit && hit.expiresAt > Date.now()) return { meta: hit.value, issue: null };

  for (const providerId of route(instrument)) {
    const provider = PROVIDERS[providerId];
    if (!provider?.getMetadata) continue;
    const res = await callProvider(providerId, 'getMetadata', () => provider.getMetadata!(instrument));
    if (res.ok) {
      put('meta', id, res.data, TTL.meta, providerId);
      persistMeta(res.data);
      if (res.data.sector || res.data.industry) {
        registerInstrument({ ...instrument, sector: res.data.sector ?? instrument.sector, industry: res.data.industry ?? instrument.industry });
      }
      return { meta: res.data, issue: null };
    }
  }
  const persisted = restoreMeta(id);
  return { meta: persisted?.value ?? null, issue: persisted ? 'refresh-failed' : 'unavailable' };
}

/* --------------------------------------------------------------------------
 * Search
 * ----------------------------------------------------------------------- */

const ALIAS_INDEX = buildAliasIndex();

function buildAliasIndex(): Map<string, string> {
  const map = new Map<string, string>();
  for (const instrument of UNIVERSE) {
    for (const key of [instrument.displaySymbol, instrument.vendorSymbol, ...(instrument.aliases ?? []), instrument.name, instrument.nameZh]) {
      if (!key) continue;
      map.set(normalizeKey(key), instrument.id);
    }
  }
  return map;
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\.us$/, '').replace(/[^a-z0-9一-龥]/g, '');
}

export async function search(queryRaw: string, limit = 12): Promise<SearchResponse> {
  const started = Date.now();
  const query = queryRaw.trim();
  if (!query) return { query, results: [], source: 'local', tookMs: 0, issue: null };

  const local = localSearch(query, limit);
  const seen = new Set(local.map((r) => r.instrument.id));
  let source: SearchResponse['source'] = 'local';
  let issue: string | null = null;

  // Ask the vendor when the local universe is thin for this query. A keyless
  // search endpoint is the only place TomTrader discovers new instruments.
  if (local.length < limit && !DEMO_MODE && publicFeedsEnabled() && !local.some((r) => r.instrument.displaySymbol.toLowerCase() === query.toLowerCase() || r.instrument.aliases?.some((a) => a.toLowerCase() === query.toLowerCase()))) {
    const provider = PROVIDERS.yahoo!;
    const { value: res } = await withDeadline(callProvider('yahoo', 'search', () => provider.search!(query)), 1_500, err<SearchResult[]>('network', 'Symbol discovery timed out; local matches shown.'));
    if (res.ok) {
      source = local.length ? 'local+vendor' : 'vendor';
      for (const found of res.data) {
        const instrument = toRegisteredInstrument(found);
        if (!instrument || seen.has(instrument.id)) continue;
        seen.add(instrument.id);
        local.push({ instrument, matchedOn: found.matchedOn, lastQuoteAt: null });
        if (local.length >= limit) break;
      }
    } else {
      issue = `${res.reason}: ${res.message}`;
    }
  }

  const top = local.slice(0, limit);
  const snapshots = await getSnapshots(
    top.map((r) => r.instrument.id),
    { mode: top.length > 4 ? 'stale' : 'await' },
  );
  const byId = new Map(snapshots.map((s) => [s.instrument.id, s]));

  return {
    query,
    results: top.map((r) => {
      const snap = byId.get(r.instrument.id);
      return {
        instrument: snap?.instrument ?? r.instrument,
        matchedOn: r.matchedOn,
        quote: snap?.quote ?? null,
        status: snap?.status ?? marketStatusFor(r.instrument.exchange, Date.now()),
      };
    }),
    source,
    tookMs: Date.now() - started,
    issue,
  };
}

function toRegisteredInstrument(found: SearchResult): Instrument | null {
  if (found.instrument.market === 'CN' || found.instrument.market === 'HK') {
    // Vendor search gives a Yahoo spelling; we also want the Eastmoney key so
    // Chinese listings route to the fresher feed.
    const east = eastmoneyKeyFor(found.instrument);
    if (east) found.instrument.providerSymbols = { ...found.instrument.providerSymbols, eastmoney: `em:${east}` };
  }
  if (found.instrument.assetType === 'index' && !BY_ID.has(found.instrument.id)) return null;
  registerInstrument(found.instrument);
  return found.instrument;
}

function eastmoneyKeyFor(instrument: Instrument): string | null {
  const y = symbolFor(instrument, 'yahoo');
  if (!y) return null;
  if (instrument.market === 'CN') {
    if (y.endsWith('.SS')) return `1.${y.slice(0, -3)}`;
    if (y.endsWith('.SZ')) return `0.${y.slice(0, -3)}`;
    return null;
  }
  if (instrument.market === 'HK') {
    const digits = y.split('.')[0];
    if (!/^\d+$/.test(digits)) return null;
    return `116.${digits.padStart(5, '0')}`;
  }
  return null;
}

export function localSearch(query: string, limit: number): SearchResult[] {
  const key = normalizeKey(query);
  if (!key) return [];
  const scored: { instrument: Instrument; score: number; matchedOn: SearchResult['matchedOn'] }[] = [];

  for (const instrument of UNIVERSE) {
    let score = 0;
    let matchedOn: SearchResult['matchedOn'] = 'name';
    const display = normalizeKey(instrument.displaySymbol);
    const vendor = instrument.vendorSymbol ? normalizeKey(instrument.vendorSymbol) : '';
    const name = normalizeKey(instrument.name);
    const nameZh = instrument.nameZh ? normalizeKey(instrument.nameZh) : '';

    if (display === key || vendor === key) {
      score = 100;
      matchedOn = 'symbol';
    } else if (ALIAS_INDEX.get(key) === instrument.id) {
      score = 90;
      matchedOn = 'alias';
    } else if (display.startsWith(key) || vendor.startsWith(key)) {
      score = 70;
      matchedOn = 'symbol';
    } else if (name.startsWith(key) || nameZh.startsWith(key)) {
      score = 55;
      matchedOn = 'name';
    } else if (name.includes(key) || nameZh.includes(key)) {
      score = 35;
      matchedOn = 'name';
    } else if (normalizeKey(EXCHANGES[instrument.exchange].name).startsWith(key) || normalizeKey(instrument.market).startsWith(key)) {
      score = 20;
      matchedOn = 'exchange';
    }
    if (!score) continue;
    // Indices and large caps should not lose to an obscure match on the same word.
    if (instrument.assetType === 'index') score += 6;
    if (instrument.assetType === 'commodity' || instrument.assetType === 'currency') score -= 4;
    scored.push({ instrument, score, matchedOn });
  }

  scored.sort((a, b) => b.score - a.score || a.instrument.displaySymbol.localeCompare(b.instrument.displaySymbol));
  return scored.slice(0, limit).map((s) => ({ instrument: s.instrument, matchedOn: s.matchedOn, lastQuoteAt: null }));
}

/* --------------------------------------------------------------------------
 * Overview / clock / movers
 * ----------------------------------------------------------------------- */

export async function buildOverview(opts: { mode: SnapshotOptions['mode']; deadlineMs?: number }): Promise<OverviewResponse> {
  const now = Date.now();
  const ids = [...ALL_INDEX_IDS, ...FEATURED_IDS];

  /**
   * A cold database has nothing to show, so the first request of a fresh
   * install waits briefly for the vendor instead of painting a board full of
   * "Unavailable" cells. Once anything is stored, the same request becomes
   * cache-first again and the poller owns the refresh.
   */
  const mode: SnapshotOptions['mode'] = opts.mode === 'stale' && !hasAnyStoredQuote() ? 'first-run' : opts.mode;
  const snapshots = await getSnapshots(ids, { mode, deadlineMs: opts.deadlineMs });
  const byId = new Map(snapshots.map((s) => [s.instrument.id, s]));

  // Currency cards fall back to the FX reference table when the quote feed is
  // unavailable. The pair then carries the FX source's own tier (usually
  // end-of-day) and timestamp, so it is visibly a different kind of number
  // from a ticked FX quote — it is not presented as live.
  await backfillCurrencies(byId, now);

  const groups = OVERVIEW_GROUPS.map((g) => ({
    market: g.market,
    snapshots: g.instrumentIds.map((id) => withSparkline(byId.get(id))).filter((s): s is QuoteSnapshot => Boolean(s)),
  }));

  const commodities = FEATURED_IDS.filter((id) => id.startsWith('commodity:')).map((id) => withSparkline(byId.get(id)));
  const currencies = FEATURED_IDS.filter((id) => id.startsWith('currency:')).map((id) => withSparkline(byId.get(id)));

  const servedFromCache = snapshots.some((s) => s.quote?.quality === 'cached' || s.quote?.quality === 'stale');

  return {
    generatedAt: now,
    groups,
    commodities: commodities.filter((s): s is QuoteSnapshot => Boolean(s)),
    currencies: currencies.filter((s): s is QuoteSnapshot => Boolean(s)),
    clock: buildClock(now),
    sources: providerHealth(),
    servedFromCache,
  };
}

function hasAnyStoredQuote(): boolean {
  try {
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM quote_cache').get() as { n: number };
    return Number(row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Derives an FX pair's quote from the stored rate table. Only pairs of the
 * form USD/XXX and XXX/USD are derivable; anything else stays unavailable,
 * because inventing a cross from rates we do not have would be exactly the
 * kind of silent approximation this project rules out.
 */
async function backfillCurrencies(byId: Map<string, QuoteSnapshot>, nowMs: number): Promise<void> {
  const missing = [...byId.values()].filter(
    (s) => s.instrument.assetType === 'currency' && (!s.quote || !Number.isFinite(s.quote.last)),
  );
  if (!missing.length) return;
  const { rate } = await fx();
  if (!rate) return;
  for (const snap of missing) {
    const pair = (snap.instrument.displaySymbol || '').replace('=X', '');
    const from = pair.slice(0, 3);
    const to = pair.slice(3, 6);
    const rFrom = rate.quotes[from as CurrencyCode] ?? (from === 'USD' ? 1 : null);
    const rTo = rate.quotes[to as CurrencyCode] ?? (to === 'USD' ? 1 : null);
    if (!rFrom || !rTo) continue;
    const value = rTo / rFrom;
    const quote: Quote = {
      instrumentId: snap.instrument.id,
      last: value,
      previousClose: null,
      change: null,
      changePercent: null,
      dayHigh: null,
      dayLow: null,
      open: null,
      volume: null,
      exchangeTimestamp: Math.round(rate.sourceAt / 1000),
      receivedAt: rate.receivedAt,
      tier: rate.tier,
      quality: 'cached',
      provider: rate.provider,
      session: null,
      currency: snap.instrument.currency,
    };
    byId.set(snap.instrument.id, snapshotOf(snap.instrument, quote, nowMs));
  }
}

function withSparkline(snap: QuoteSnapshot | undefined): QuoteSnapshot | null {
  if (!snap) return null;
  if (snap.instrument.assetType !== 'index' && snap.instrument.assetType !== 'commodity' && snap.instrument.assetType !== 'currency') {
    return snap;
  }
  return { ...snap, sparkline: sparklineFromCache(snap.instrument.id) };
}

export function buildClock(now = Date.now(), exchanges?: ExchangeCode[]): ClockRow[] {
  const list = exchanges ?? (Object.keys(EXCHANGES) as ExchangeCode[]).filter((e) => e !== 'OTC');
  return list.map((exchange) => {
    const info = EXCHANGES[exchange];
    const status = marketStatusFor(exchange, now);
    const today = zoned(now, info.timezone).date;
    const timeline = [shiftLocalDate(today, -1), today, shiftLocalDate(today, 1)]
      .map((date) => {
        const plan = planDay(exchange, date);
        return plan.segments.map((seg) => ({
          openAt: seg.openAt,
          closeAt: seg.closeAt,
          date,
          earlyClose: seg.earlyClose,
          holiday: plan.reason,
        }));
      })
      .flat();

    // The index that represents this venue, for the clock's headline number.
    const group = OVERVIEW_GROUPS.find((g) => g.market === inferMarketFor(exchange));
    const headlineId = group?.instrumentIds[0] ?? null;
    const head = headlineId ? peek<Quote>('quote', headlineId)?.value ?? restoreQuotes([headlineId]).get(headlineId)?.value ?? null : null;

    const todaysPlan = planDay(exchange, today);
    const segment = todaysPlan.segments.find((s) => s.openAt <= now && s.closeAt > now) ?? null;

    return {
      exchange,
      status,
      localTime: now,
      sessionOpenAt: segment?.openAt ?? null,
      sessionCloseAt: segment?.closeAt ?? null,
      timeline,
      headline: headlineId ? { instrumentId: headlineId, changePercent: head?.changePercent ?? null } : null,
    };
  });
}

function inferMarketFor(exchange: ExchangeCode): MarketCode {
  const map: Partial<Record<ExchangeCode, MarketCode>> = {
    XNYS: 'US',
    XNAS: 'US',
    ARCX: 'US',
    CNE: 'CN',
    XSHE: 'CN',
    HKEX: 'HK',
    XTKS: 'JP',
    KRX: 'KR',
    TWSE: 'TW',
    NSE: 'IN',
    BSE: 'IN',
    ASX: 'AU',
    XETRA: 'DE',
    XEUR: 'EU',
    XLON: 'GB',
    XPAF: 'FR',
    BVMF: 'BR',
  };
  return map[exchange] ?? 'US';
}

/** Local calendar arithmetic, independent of any zone. */
export function shiftLocalDate(date: string, days: number): string {
  return addLocalDays(date, days);
}

function addLocalDays(date: string, days: number): string {
  return addDaysToLocalDate(date, days);
}

export function movers(poolIds: string[]): { gainers: QuoteSnapshot[]; losers: QuoteSnapshot[]; mostActive: QuoteSnapshot[] } {
  const snaps = poolIds
    .map((id) => {
      const instrument = resolveInstrument(id);
      const quote = peek<Quote>('quote', id)?.value ?? restoreQuotes([id]).get(id)?.value ?? null;
      if (!instrument || !quote || quote.changePercent === null) return null;
      return snapshotOf(instrument, quote);
    })
    .filter((s): s is QuoteSnapshot => Boolean(s));

  const sorted = [...snaps].sort((a, b) => (b.quote!.changePercent ?? 0) - (a.quote!.changePercent ?? 0));
  const byVolume = [...snaps].sort((a, b) => (b.quote!.volume ?? 0) - (a.quote!.volume ?? 0));
  return {
    gainers: sorted.slice(0, 6),
    losers: sorted.slice(-6).reverse(),
    mostActive: byVolume.slice(0, 6),
  };
}

/* --------------------------------------------------------------------------
 * Heatmap
 * ----------------------------------------------------------------------- */

export async function buildHeatmap(poolKey: string, period: 'intraday' | '5d' | '1m'): Promise<{
  cells: HeatmapCell[];
  coverage: { requested: number; withData: number; note: string };
}> {
  const pool = HEATMAP_POOLS.find((p) => p.key === poolKey) ?? HEATMAP_POOLS[0];
  // The intraday view is made of quotes the poller already keeps warm, so it
  // paints from cache. Only the multi-day views need history and may wait.
  const snapshots = await getSnapshots(pool.ids, { mode: period === 'intraday' ? 'stale' : 'await' });

  const changes = new Map<string, number | null>();
  if (period !== 'intraday') {
    const range: BarRange = period === '5d' ? '5D' : '1M';
    await Promise.all(
      pool.ids.slice(0, 40).map(async (id) => {
        const { bars } = await getBars(id, range, '1d');
        if (!bars || bars.bars.length < 2) return;
        const first = bars.bars[0].close;
        const last = bars.bars[bars.bars.length - 1].close;
        if (first) changes.set(id, ((last - first) / first) * 100);
      }),
    );
  }

  const cells: HeatmapCell[] = [];
  let missingMarketCap = 0;
  for (const snap of snapshots) {
    const quote = snap.quote;
    if (!quote) continue;
    const change = period === 'intraday' ? quote.changePercent : changes.get(snap.instrument.id) ?? null;
    if (change === null || change === undefined) continue;
    const cap = quote.marketCap ?? snap.instrument.marketCap ?? null;
    if (cap === null) missingMarketCap += 1;
    cells.push({
      instrumentId: snap.instrument.id,
      name: snap.instrument.name,
      nameZh: snap.instrument.nameZh,
      market: snap.instrument.market,
      sector: snap.instrument.sector ?? 'Unclassified',
      changePercent: change,
      last: Number.isFinite(quote.last) ? quote.last : null,
      marketCap: cap,
      weight: cap ?? 1,
      weightSource: cap ? 'market-cap' : 'equal',
      quality: quote.quality,
    });
  }

  if (missingMarketCap > 0) for (const cell of cells) { cell.weight = 1; cell.weightSource = 'equal'; }

  const note =
    missingMarketCap > 0
      ? `Equal-area tiles: ${missingMarketCap} of ${cells.length} instruments lack market cap. Coverage ${cells.length}/${pool.ids.length}.`
      : cells.length < pool.ids.length
        ? `Pool covers ${cells.length} of ${pool.ids.length} listed instruments; the rest had no change data.`
        : `Curation note: this pool is a liquid large- and mid-cap sample, not the whole exchange.`;

  return { cells, coverage: { requested: pool.ids.length, withData: cells.length, note } };
}

/* --------------------------------------------------------------------------
 * Alerts
 * ----------------------------------------------------------------------- */

/**
 * Threshold crossing with arming and a cooldown.
 *
 * Arming means a price-above alert only re-arms once the price has come back
 * below the threshold, so a market that hovers on the line fires once, not
 * once per poll. The cooldown is a second, independent guard.
 */
export function evaluateAlert(alert: PriceAlert, snap: QuoteSnapshot, now = Date.now()): AlertEvaluation {
  const base = { alertId: alert.id, instrumentId: alert.instrumentId };
  if (!alert.enabled) return { ...base, fired: false, price: snap.quote?.last ?? null, detail: null, skippedReason: 'disabled' };
  const quote = snap.quote;
  if (!quote || !Number.isFinite(quote.last)) return { ...base, fired: false, price: null, detail: null, skippedReason: 'no-data' };

  if (quote.quality === 'stale' || quote.quality === 'unavailable') return { ...base, fired: false, price: quote.last, detail: null, skippedReason: 'no-data' };
  const price = quote.last;
  const crossed = crossesThreshold(alert, quote);
  const detail = describeCrossing(snap, alert, quote);
  if (detail === null) {
    // Conditions that need data we do not have must never fire silently.
    return { ...base, fired: false, price, detail: null, skippedReason: 'no-data' };
  }

  if (!crossed) {
    // Coming back through the level re-arms the alert.
    return { ...base, fired: false, price, detail: null, skippedReason: 'not-armed' };
  }
  if (!alert.armed) return { ...base, fired: false, price, detail, skippedReason: 'not-armed' };
  if (alert.lastTriggeredAt && now - alert.lastTriggeredAt < alert.cooldownMinutes * 60_000) {
    return { ...base, fired: false, price, detail, skippedReason: 'cooldown' };
  }
  return { ...base, fired: true, price, detail };
}

/** Pure threshold predicate — shared by the fire path and the re-arm path. */
export function crossesThreshold(alert: PriceAlert, quote: Quote): boolean {
  const c = alert.condition;
  switch (c.type) {
    case 'price-above':
      return Number.isFinite(quote.last) && quote.last >= c.threshold;
    case 'price-below':
      return Number.isFinite(quote.last) && quote.last <= c.threshold;
    case 'change-percent-above':
      return (quote.changePercent ?? -Infinity) >= c.threshold;
    case 'change-percent-below':
      return (quote.changePercent ?? Infinity) <= -Math.abs(c.threshold);
    default:
      return false;
  }
}

/** Human-readable trigger description, or null when the condition is unsupported. */
export function describeCrossing(snap: QuoteSnapshot, alert: PriceAlert, quote: Quote): string | null {
  const c = alert.condition;
  const symbol = snap.instrument.displaySymbol;
  switch (c.type) {
    case 'price-above':
      return `${symbol} ${fmtRaw(quote.last)} ≥ ${fmtRaw(c.threshold)}`;
    case 'price-below':
      return `${symbol} ${fmtRaw(quote.last)} ≤ ${fmtRaw(c.threshold)}`;
    case 'change-percent-above':
      return `${symbol} day change ${fmtRaw(quote.changePercent ?? 0)}% ≥ ${fmtRaw(c.threshold)}%`;
    case 'change-percent-below':
      return `${symbol} day change ${fmtRaw(quote.changePercent ?? 0)}% ≤ −${fmtRaw(Math.abs(c.threshold))}%`;
    case 'five-two-week-high':
    case 'five-two-week-low':
      return null;
  }
}

function fmtRaw(n: number): string {
  return Math.abs(n) >= 1000 ? n.toFixed(2) : n.toFixed(Math.abs(n) < 1 ? 4 : 2);
}

/* --------------------------------------------------------------------------
 * FX
 * ----------------------------------------------------------------------- */

export async function fx(): Promise<{ rate: FxRate | null; issue: string | null }> {
  const hit = peek<FxRate>('fx', 'USD');
  if (hit && hit.expiresAt > Date.now()) return { rate: hit.value, issue: null };
  if (hit) {
    void fetchFx();
    return { rate: hit.value, issue: null };
  }
  const persisted = restoreFx('USD');
  if (persisted) {
    put('fx', 'USD', persisted.value, 0, persisted.provider, persisted.storedAt);
    void fetchFx();
    return { rate: persisted.value, issue: null };
  }
  return fetchFx();
}

let fxFight: Promise<{ rate: FxRate | null; issue: string | null }> | null = null;

function fetchFx() {
  if (!fxFight) {
    fxFight = (async () => {
      const res = await callProvider('fx-open.er-api', 'getFxRates', () => getFxRates());
      if (res.ok) {
        put('fx', 'USD', res.data, TTL.fx, res.data.provider);
        persistFx(res.data);
        return { rate: res.data, issue: null };
      }
      return { rate: peek<FxRate>('fx', 'USD')?.value ?? null, issue: res.message };
    })().finally(() => {
      fxFight = null;
    });
  }
  return fxFight;
}

/* --------------------------------------------------------------------------
 * News
 * ----------------------------------------------------------------------- */

export async function getNews(instrumentId: string | null, limit = 24): Promise<{ items: NewsItem[]; issue: string | null }> {
  const key = instrumentId ?? 'market';
  const hit = peek<NewsItem[]>('news', key);
  if (hit && hit.expiresAt > Date.now()) return { items: hit.value, issue: null };

  const problems: string[] = [];
  let items: NewsItem[] = [];

  if (!DEMO_MODE) {
    // 1. per-symbol headlines, when the vendor news feed answers.
    if (instrumentId && publicFeedsEnabled()) {
      const instrument = resolveInstrument(instrumentId);
      if (instrument) {
        const res = await callProvider('yahoo', 'getNews', () => yahoo.getNews!(instrument, 10));
        if (res.ok) items = res.data;
        else problems.push(`symbol feed: ${res.reason}`);
      }
    }

    // 2. the wire, always.
    const wire = publicFeedsEnabled() ? await callProvider('eastmoney', 'getMarketWire', () => getMarketWire(24)) : err<NewsItem[]>('unsupported', 'Wire requires data rights confirmation');
    if (wire.ok) items = items.concat(wire.data);
    else problems.push(`wire: ${wire.reason}`);

    // 3. official policy releases.
    const policy = await callProvider('calendar', 'getPolicyNews', () => getPolicyNews());
    if (policy.ok) items = items.concat(policy.data);
    else problems.push(`policy: ${policy.reason}`);
  } else {
    return { items: [], issue: 'unsupported-in-demo' };
  }

  const seen = new Set<string>();
  const deduped = items
    .filter((n) => {
      const k = normalizeKey(n.title).slice(0, 60);
      if (!k || seen.has(k) || !Number.isFinite(n.publishedAt) || !/^https?:\/\//.test(n.url)) return false;
      if (instrumentId) { const symbol = resolveInstrument(instrumentId)?.displaySymbol; if (!symbol || !n.symbols.some((s) => s.toLowerCase() === symbol.toLowerCase() || s === instrumentId)) return false; }
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit);

  put('news', key, deduped, deduped.length ? TTL.news : 30_000, 'mixed');
  persistNews(key, deduped);
  return { items: deduped, issue: deduped.length === 0 ? problems.join('; ') || 'empty' : problems.length ? problems.join('; ') : null };
}

/* --------------------------------------------------------------------------
 * Diagnostics
 * ----------------------------------------------------------------------- */

export function diagnostics() {
  return {
    cache: cacheStats(),
    providers: providerHealth(),
    universe: { size: UNIVERSE.length, featured: FEATURED_IDS.length, heatmapPools: HEATMAP_POOLS.map((p) => ({ key: p.key, size: p.ids.length })) },
    demoMode: DEMO_MODE,
    currencyOf: (id: string) => resolveInstrument(id)?.currency ?? null,
  };
}

export function normalizeCurrencyPublic(raw: string | undefined, market: MarketCode) {
  return normalizeCurrency(raw, currencyForMarket(market));
}
