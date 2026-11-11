import { EXCHANGES } from '../exchanges';
import { fetchJson } from '../http';
import { utcFromLocalDate, zoned } from '../marketstatus';
import type {
Bar,
BarInterval,
BarRange,
Bars,
CapabilityResult,
FeedTier,
Instrument,
MarketCode,
Quote,
} from '../types';
import { err,ok } from '../types';
import { publicFeedsEnabled } from './access';
import { symbolFor,type MarketDataProvider } from './provider';

/**
 * Eastmoney (东方财富) adapter — curated A-shares, Hong Kong, US and global indices.
 *
 * These are the same public JSON endpoints the Eastmoney web client uses.
 * Used as a keyless source with per-session timestamps. Notes on accuracy:
 *
 *  - A-share volume from `ulist.np` and `kline` is quoted in 手 (lots of 100
 *    shares); HK volume is quoted in shares. Both are normalised to shares here
 *    and cross-checked against a second source in `tools/verify-universe.ts`.
 *  - `fqt=1` returns 前复权 (forward-adjusted) prices, which fold in dividends
 *    as well as splits. That is declared on the Bars object, never hidden.
 *  - No documented latency ⇒ tier `unverified` ⇒ no "Real-time" badge.
 */

const ULIST = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const KLINE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const TRENDS = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get';

const QUOTE_FIELDS = 'f1,f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18,f20,f124';
const KLINE_FIELDS1 = 'f1,f2,f3,f6,f8';
const KLINE_FIELDS2 = 'f51,f52,f53,f54,f55,f56,f57';

interface EmRow {
  f1?: number;
  f2?: number | string;
  f3?: number | string;
  f4?: number | string;
  f5?: number | string;
  f6?: number | string;
  f12?: string;
  f13?: number;
  f14?: string;
  f15?: number | string;
  f16?: number | string;
  f17?: number | string;
  f18?: number | string;
  f20?: number | string;
  f124?: number;
}

export class EastmoneyProvider implements MarketDataProvider {
  readonly id = 'eastmoney' as const;
  readonly label = 'Eastmoney (public web endpoints)';
  /**
   * Verified live on 2026-11-07: China (`0`/`1`), Hong Kong (`116`), United
   * States (`105` Nasdaq, `106` NYSE) and global indices (`100`). Listed here
   * because that is what the adapter can actually serve, so failover routing
   * does not send markets it cannot answer for.
   */
  readonly markets: MarketCode[] = ['CN', 'HK', 'US', 'EU', 'DE', 'FR', 'GB', 'AU', 'TW', 'KR', 'IN', 'BR', 'NL', 'JP'];
  readonly capabilities = {
    quotes: true,
    historicalBars: true,
    search: false,
    metadata: false,
    push: false,
    news: false,
  };

  declaredTier(_market: MarketCode): FeedTier {
    return 'unverified';
  }

  /** Eastmoney's own composite key, e.g. `1.600519`, `0.399001`, `116.00700`. */
  static secid(instrument: Instrument): string | null {
    return symbolFor(instrument, 'eastmoney');
  }

  async getQuotes(instruments: Instrument[]): Promise<CapabilityResult<Quote[]>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    const wanted = instruments
      .map((i) => ({ i, secid: EastmoneyProvider.secid(i) }))
      .filter((x): x is { i: Instrument; secid: string } => Boolean(x.secid));
    if (wanted.length === 0) return ok([]);

    const out: Quote[] = [];
    for (let start = 0; start < wanted.length; start += 50) {
      const chunk = wanted.slice(start, start + 50);
      const res = await fetchJson<{ data?: { diff?: EmRow[] | Record<string, EmRow> } }>(ULIST, {
        query: {
          fltt: 2,
          invt: 2,
          fields: QUOTE_FIELDS,
          secids: chunk.map((c) => c.secid).join(','),
        },
        retries: 2,
        timeoutMs: 12_000,
        priority: true,
      });
      if (!res.ok) {
        return out.length
          ? ok(out)
          : err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
      }
      const raw = res.data.data?.diff;
      // push2 returns a keyed object when a single secid is asked for, an array otherwise.
      const rows: EmRow[] = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];
      for (const row of rows) {
        const hit = chunk.find((c) => c.secid.split('.')[1] === row.f12 && c.secid.startsWith(`${row.f13}.`));
        const instrument = hit?.i;
        if (!instrument || !row.f12) continue;
        const num = parseEastmoneyNumber;
        const last = num(row.f2);
        const prev = num(row.f18);
        const volumeLots = num(row.f5);
        if (last === null || (last <= 0 && instrument.assetType !== 'commodity')) continue;
        const isCn = instrument.market === 'CN';
        out.push({
          instrumentId: instrument.id,
          last,
          previousClose: prev,
          change: num(row.f4) ?? (last !== null && prev !== null ? last - prev : null),
          changePercent: num(row.f3),
          dayHigh: num(row.f15),
          dayLow: num(row.f16),
          open: num(row.f17),
          // Only the A-share feeds quote volume in 手 (100 shares); HK and US
          // listings on the same endpoint are already shares.
          volume: volumeLots === null || (volumeLots === 0 && instrument.assetType === 'index') ? null : isCn ? volumeLots * 100 : volumeLots,
          exchangeTimestamp: typeof row.f124 === 'number' && row.f124 > 0 && Number.isFinite(row.f124) ? row.f124 : null,
          receivedAt: Date.now(),
          tier: this.declaredTier(instrument.market),
          quality: 'cached',
          provider: 'eastmoney',
          session: sessionFor(instrument, row.f124),
          currency: instrument.currency,
          // f20 is total market value in the listing currency for securities.
          // For an index it is the constituent aggregate, so it is dropped.
          marketCap:
            instrument.assetType === 'index'
              ? null
              : (() => {
                  const v = row.f20;
                  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '-' ? Number(v) : NaN;
                  return Number.isFinite(n) && n > 0 ? n : null;
                })(),
          vendorName: typeof row.f14 === 'string' ? row.f14 : null,
        });
      }
    }
    return ok(out);
  }

  async getHistoricalBars(instrument: Instrument, range: BarRange, interval: BarInterval): Promise<CapabilityResult<Bars>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    const secid = EastmoneyProvider.secid(instrument);
    if (!secid) return err('unsupported', `Eastmoney has no mapping for ${instrument.id}`);

    const tz = EXCHANGES[instrument.exchange].timezone;

    if (interval === '1m' && range === '1D') {
      const res = await fetchJson<{ data?: { preClose?: number; trends?: string[] } }>(TRENDS, {
        query: {
          secid,
          fields1: 'f1,f2,f3,f7,f8',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
          ndays: 1,
          iscr: 0,
        },
        retries: 2,
        timeoutMs: 15_000,
      });
      if (!res.ok) return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
      const trends = res.data.data?.trends ?? [];
      const bars: Bar[] = [];
      for (const line of trends) {
        const [stamp, open, close, high, low, vol] = line.split(',');
        const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(stamp ?? '');
        if (!m) continue;
        const [, y, mo, d, hh, mi] = m;
        // utcFromLocalDate answers in ms; Bar.time is epoch seconds UTC.
        const time = Math.round(utcFromLocalDate(tz, `${y}-${mo}-${d}`, Number(hh) * 60 + Number(mi)) / 1000);
        const bar = parseBar(time, open, close, high, low, vol, instrument.market === 'CN');
        if (bar) bars.push(bar);
      }
      const selected = normalizeBars(bars);
      if (selected.length < 2) return err('not-found', `${instrument.id}: no valid intraday trend data`);
      return ok({
        instrumentId: instrument.id,
        range,
        interval,
        adjusted: false,
        adjustment: 'raw',
        bars: selected,
        meta: {
          currency: instrument.currency,
          exchangeTimezone: tz,
          lastBarAt: selected[selected.length - 1].time,
          receivedAt: Date.now(),
          tier: this.declaredTier(instrument.market),
          provider: 'eastmoney',
        },
      });
    }

    const kltMap: Record<BarInterval, string> = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '1d': '101', '1wk': '102', '1mo': '103' };
    const lmt = range === '1D' ? 250 : range === '5D' ? 250 : range === 'MAX' ? 4000 : { '1M': 30, '3M': 70, '6M': 130, YTD: 260, '1Y': 260, '5Y': 300 }[range];
    const useAdjusted = interval === '1d' || interval === '1wk' || interval === '1mo';

    const res = await fetchJson<{ data?: { klines?: string[]; name?: string } }>(KLINE, {
      query: {
        secid,
        klt: kltMap[interval],
        // 前复权 for daily+ series; intraday must never be adjusted.
        fqt: useAdjusted ? 1 : 0,
        lmt,
        end: '20500101',
        fields1: KLINE_FIELDS1,
        fields2: KLINE_FIELDS2,
      },
      retries: 2,
      timeoutMs: 15_000,
    });
    if (!res.ok) return err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);

    const lines = res.data.data?.klines ?? [];
    const bars: Bar[] = [];
    for (const line of lines) {
      const [stamp, open, close, high, low, vol] = line.split(',');
      const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(stamp ?? '');
      if (!day) continue;
      const local = `${day[1]}-${day[2]}-${day[3]}`;
      const intradayStamp = /\ (\d{2}):(\d{2})/.exec(stamp ?? '');
      const time = Math.round(
        utcFromLocalDate(tz, local, intradayStamp ? Number(intradayStamp[1]) * 60 + Number(intradayStamp[2]) : 0) / 1000,
      );
      const bar = parseBar(time, open, close, high, low, vol, instrument.market === 'CN');
      if (bar) bars.push(bar);
    }
    if (bars.length < 2) return err('not-found', `${instrument.id}: insufficient history`);
    const valid = normalizeBars(bars);
    const selected = selectHistoryWindow(valid, range, interval, Date.now(), tz);
    if (selected.length < 2) return err('not-found', `${instrument.id}: insufficient valid bars for ${range}`);

    return ok({
      instrumentId: instrument.id,
      range,
      interval,
      // 前复权 folds dividends and splits into the daily series.
      adjusted: useAdjusted,
      adjustment: useAdjusted ? 'dividend-adjusted' : 'raw',
      bars: selected,
      meta: {
        currency: instrument.currency,
        exchangeTimezone: tz,
        lastBarAt: selected[selected.length - 1].time,
        receivedAt: Date.now(),
        tier: this.declaredTier(instrument.market),
        provider: 'eastmoney',
      },
    });
  }
}

/**
 * Eastmoney does not send an explicit session flag, so we infer the regular
 * session from the print time against the venue's own clock. Used only to
 * populate `Quote.session`; freshness never relies on it.
 */
function sessionFor(instrument: Instrument, tsSec: number | undefined): Quote['session'] {
  if (!tsSec) return null;
  const info = EXCHANGES[instrument.exchange];
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: info.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(tsSec * 1000));
  const hour = Number(local.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(local.find((p) => p.type === 'minute')?.value ?? '0');
  const mins = hour * 60 + minute;
  const first = info.sessions[0];
  const last = info.sessions[info.sessions.length - 1];
  if (mins < first.openMin && mins >= (first.preOpenMin ?? first.openMin)) return 'pre';
  if (mins > last.closeMin && mins <= (last.afterCloseMin ?? last.closeMin)) return 'post';
  return 'regular';
}

export const eastmoney = new EastmoneyProvider();


export function parseEastmoneyNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && ['', '-'].includes(value.trim()))) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseBar(time: number, open: string | undefined, close: string | undefined, high: string | undefined, low: string | undefined, volume: string | undefined, lots: boolean): Bar | null {
  const o = parseEastmoneyNumber(open), c = parseEastmoneyNumber(close), h = parseEastmoneyNumber(high), l = parseEastmoneyNumber(low);
  if (o === null || c === null || h === null || l === null) return null;
  const v = parseEastmoneyNumber(volume);
  const bar: Bar = { time, open: o, close: c, high: h, low: l, volume: v !== null && v >= 0 ? v * (lots ? 100 : 1) : null };
  return validBar(bar) ? bar : null;
}

/** Chart libraries require strictly ordered, unique instants. */
function normalizeBars(bars: Bar[]): Bar[] {
  return [...new Map(bars.filter(validBar).map((bar) => [bar.time, bar])).values()].sort((a, b) => a.time - b.time);
}

function validBar(bar: Bar): boolean {
  return [bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)
    && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close);
}

export function selectHistoryWindow(bars: Bar[], range: BarRange, _interval: BarInterval, nowMs = Date.now(), timezone = 'UTC'): Bar[] {
  if (!bars.length) return [];
  if (range === '1D' || range === '5D') {
    const dates = [...new Set(bars.map((b) => zoned(b.time * 1000, timezone).date))];
    const keep = new Set(dates.slice(-(range === '1D' ? 1 : 5)));
    return bars.filter((b) => keep.has(zoned(b.time * 1000, timezone).date));
  }
  if (range === 'MAX') return bars;
  const local = zoned(nowMs, timezone);
  const start = new Date(Date.UTC(local.year, local.month - 1, 1));
  if (range === 'YTD') start.setUTCMonth(0);
  else if (range === '1Y' || range === '5Y') start.setUTCFullYear(start.getUTCFullYear() - (range === '1Y' ? 1 : 5));
  else start.setUTCMonth(start.getUTCMonth() - ({ '1M': 1, '3M': 3, '6M': 6 }[range] ?? 1));
  if (range !== 'YTD') {
    const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(local.day, monthEnd));
  }
  const date = start.toISOString().slice(0, 10);
  const cutoff = Math.floor(utcFromLocalDate(timezone, date, 0) / 1000);
  return bars.filter((b) => b.time >= cutoff && b.time <= nowMs / 1000);
}
