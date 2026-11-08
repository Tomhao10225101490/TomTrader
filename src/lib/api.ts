import type { AlertEvent,NewsItem,PriceAlert,WatchlistGroup } from '../server/types';
import type {
BarsResponse,
ClockRow,
DetailResponse,
HeatmapResponse,
MoversResponse,
OverviewResponse,
PortfolioSummary,
QuoteSnapshot,
SearchResponse,
} from '../shared/api';

/**
 * Typed API client.
 *
 * Every call goes through `request()`, which attaches `AbortController`s,
 * applies a wall-clock timeout of its own (so a stalled server cannot hang a
 * component forever), and normalises failures into `{data:null, error}` — the
 * UI then renders a real error state instead of an empty one that looks like
 * "no data exists".
 */

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
  /** True when the payload itself reported a problem (partial data, stale feed). */
  degraded: boolean;
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<ApiResult<T>> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), init.timeoutMs ?? 20_000);
  try {
    const res = await fetch(path, { ...init, signal: ac.signal, cache: 'no-store' });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      return { data: null, error: body?.error ?? `HTTP ${res.status} on ${path}`, degraded: false };
    }
    const body = (await res.json()) as T & { error?: string };
    const degraded = Boolean(body && typeof body === 'object' && 'error' in body && (body as { error?: string }).error);
    return { data: body, error: degraded ? String((body as { error?: string }).error) : null, degraded };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return { data: null, error: aborted ? `request timed out: ${path}` : String((e as Error)?.message ?? e), degraded: false };
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  overview: (mode: 'stale' | 'await' = 'stale') => request<OverviewResponse>(`/api/overview?mode=${mode}`),

  quotes: (ids: string[]) =>
    request<{ snapshots: QuoteSnapshot[] }>(`/api/quotes?ids=${encodeURIComponent(ids.join(','))}`, {
      method: ids.length > 20 ? 'POST' : 'GET',
      ...(ids.length > 20
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) }
        : {}),
    }),

  detail: (id: string) => request<DetailResponse>(`/api/detail?id=${encodeURIComponent(id)}`),

  bars: (id: string, range: string, interval?: string) =>
    request<BarsResponse>(
      `/api/bars?id=${encodeURIComponent(id)}&range=${encodeURIComponent(range)}${interval ? `&interval=${encodeURIComponent(interval)}` : ''}`,
    ),

  sparklines: (ids: string[]) => request<{ series: Record<string, number[] | null> }>(`/api/sparkline?ids=${encodeURIComponent(ids.join(','))}`),

  search: (q: string) => request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),

  resolve: (symbol: string, market?: string) =>
    request<{ id: string | null; candidates: string[] }>(
      `/api/resolve?symbol=${encodeURIComponent(symbol)}${market ? `&market=${encodeURIComponent(market)}` : ''}`,
    ),

  heatmap: (pool: string, period: string) => request<HeatmapResponse>(`/api/heatmap?pool=${encodeURIComponent(pool)}&period=${encodeURIComponent(period)}`),

  movers: (pool: string) => request<MoversResponse>(`/api/movers?pool=${encodeURIComponent(pool)}`),

  clock: () => request<{ rows: ClockRow[]; generatedAt: number }>('/api/clock'),

  markets: () =>
    request<{
      rows: {
        code: string;
        name: string;
        nameZh: string;
        country: string;
        countryZh: string;
        timezone: string;
        city: string;
        currency: string;
        sessions: { open: string; close: string }[];
        supportsExtendedHours: boolean;
        partialCalendar: boolean;
        note: string | null;
        status: import('../server/types').MarketStatus;
        headline: { id: string; name: string; quote: QuoteSnapshot['quote'] }[];
        nextClosures: { date: string; name: string; nameZh: string; confidence: string }[];
      }[];
      calendarVersion: string;
      generatedAt: number;
    }>('/api/markets'),

  news: (id?: string | null) => request<{ items: NewsItem[]; issue: string | null }>(`/api/news${id ? `?id=${encodeURIComponent(id)}` : ''}`),

  status: () =>
    request<{
      cache: { entries: number; byKind: Record<string, number>; flights: number };
      providers: import('../shared/api').SourceHealth[];
      universe: { size: number; featured: number; heatmapPools: { key: string; size: number }[] };
      demoMode: boolean;
      configuration: { finnhubConfigured: boolean; publicFeedsEnabled: boolean };
      hub: { connectedAt: number | null; pollingIntervalMs: number; subscribed: number; lastRefreshAt: number | null; lastErrorAt: number | null; lastError: string | null; clients: number };
      calendarVersion: string;
      dbPath: string;
      recentEvents: { ts: number; provider: string; op: string; outcome: string; detail: string | null }[];
      generatedAt: number;
    }>('/api/status'),

  watchlist: {
    get: () => request<{ groups: WatchlistGroup[]; snapshots: QuoteSnapshot[] }>('/api/watchlist'),
    post: (body: Record<string, unknown>) =>
      request<unknown>('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
  },

  portfolio: {
    get: (currency: string) => request<PortfolioSummary>(`/api/portfolio?currency=${encodeURIComponent(currency)}`),
    post: (body: Record<string, unknown>) =>
      request<unknown>('/api/portfolio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
  },

  alerts: {
    get: () => request<{ alerts: PriceAlert[]; events: AlertEvent[] }>('/api/alerts'),
    post: (body: Record<string, unknown>) =>
      request<unknown>('/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
  },
};
