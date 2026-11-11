import { EXCHANGES } from '../exchanges';
import { fetchJson,raw } from '../http';
import { utcFromLocalDate } from '../marketstatus';
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
import type { MarketDataProvider } from './provider';
import { parseEastmoneyNumber,selectHistoryWindow } from './eastmoney';

/**
 * Tencent (qt.gtimg.cn) — third independent quote source.
 *
 * Added deliberately as a failover, and because a second number for the same
 * index is the cheapest correctness check available: `tools/verify-universe.mts`
 * compares Yahoo, Eastmoney and Tencent on the same instruments and reports the
 * spread. Two agreeing sources turn "we trust the API" into a measurement.
 *
 * What this provider does NOT claim:
 *  - **volume**: the feed's volume fields differ by market (手 for China,
 *    mixed units elsewhere) and the unit is not documented per field. Volume is
 *    therefore left null rather than guessed; the UI shows an em dash and the
 *    coverage note in Settings says so.
 *  - **latency**: undocumented ⇒ tier `unverified`.
 *
 * The payload is GBK-encoded, which Node's TextDecoder handles natively.
 */

const BASE = 'https://qt.gtimg.cn/q=';
const HISTORY_BASE = 'https://web.ifzq.gtimg.cn/appstock/app/';
// The quote supplies authoritative US listing suffixes (AAPL.OQ, SPY.P,
// BRK.B.N). Omitting one can return two unrelated points rather than history.
const historyCodes = new Map<string, string>();

export class TencentProvider implements MarketDataProvider {
  readonly id = 'tencent' as const;
  readonly label = 'Tencent quotes and daily+ history (public web endpoints)';
  readonly markets: MarketCode[] = ['US', 'CN', 'HK', 'GB'];
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

  async getQuotes(instruments: Instrument[]): Promise<CapabilityResult<Quote[]>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    const wanted = instruments
      .map((i) => ({ i, code: tencentCode(i) }))
      .filter((x): x is { i: Instrument; code: string } => Boolean(x.code));
    if (!wanted.length) return ok([]);

    const out: Quote[] = [];
    for (let start = 0; start < wanted.length; start += 50) {
      const chunk = wanted.slice(start, start + 50);
      const res = await raw(`${BASE}${chunk.map((c) => c.code).join(',')}`, { retries: 2, timeoutMs: 9_000, priority: true, responseEncoding: 'gb18030' });
      if (!res.ok) {
        return out.length ? ok(out) : err(res.error.kind === 'rate-limit' ? 'rate-limited' : 'network', res.error.message, res.error.retryAfterMs);
      }
      if (res.res.status !== 200) return out.length ? ok(out) : err('network', `Tencent returned HTTP ${res.res.status}`);
      for (const line of parseFeed(res.res.body)) {
        const hit = chunk.find((c) => c.code === line.key);
        if (!hit) continue;
        const quote = parseRow(hit.i, line);
        if (quote) {
          out.push(quote);
          const canonical = line.fields[2];
          if (hit.i.market === 'US' && canonical && /^[A-Za-z0-9./-]+\.[A-Z]{1,3}$/.test(canonical)) historyCodes.set(hit.i.id, `us${canonical}`);
        }
      }
    }
    return ok(out);
  }

  async getHistoricalBars(instrument: Instrument, range: BarRange, interval: BarInterval): Promise<CapabilityResult<Bars>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    if (!['1d', '1wk', '1mo'].includes(interval)) return err('unsupported', 'Tencent fallback supplies daily, weekly and monthly bars only; no verified intraday OHLC endpoint.');
    let code = tencentCode(instrument);
    if (!code || !['CN', 'HK', 'US'].includes(instrument.market)) return err('unsupported', `No Tencent history mapping for ${instrument.id}`);
    if (instrument.market === 'US') {
      if (!historyCodes.has(instrument.id)) {
        const quote = await this.getQuotes([instrument]);
        if (!quote.ok) return quote;
      }
      code = historyCodes.get(instrument.id) ?? null;
      if (!code) return err('unsupported', `Tencent did not supply a canonical US listing code for ${instrument.id}`);
    }
    const period = { '1d': 'day', '1wk': 'week', '1mo': 'month' }[interval as '1d'|'1wk'|'1mo'];
    const count = { '1D': 5, '5D': 10, '1M': 40, '3M': 80, '6M': 150, YTD: 320, '1Y': 320, '5Y': 320, MAX: 640 }[range];
    const endpoint = instrument.market === 'US' ? 'usfqkline/get' : instrument.market === 'HK' ? 'hkfqkline/get' : 'fqkline/get';
    const response = await fetchJson<{ code?: number; msg?: string; data?: Record<string, Record<string, unknown>> }>(HISTORY_BASE + endpoint, {
      query: { param: `${code},${period},,,${count},qfq` }, retries: 2, timeoutMs: 12_000,
    });
    if (!response.ok) return err(response.error.kind === 'rate-limit' ? 'rate-limited' : 'network', response.error.message, response.error.retryAfterMs);
    if (response.data.code !== 0) return err('not-found', response.data.msg ?? 'Tencent returned no history');
    const payload = response.data.data?.[code];
    const adjustedRows = payload?.[`qfq${period}`];
    const adjusted = Array.isArray(adjustedRows);
    const rows = adjusted ? adjustedRows : payload?.[period];
    if (!Array.isArray(rows)) return err('not-found', `${instrument.id}: Tencent returned no ${period} series`);
    const timezone = EXCHANGES[instrument.exchange].timezone;
    const volumeMultiplier = instrument.market === 'CN' ? (/^sh68[89]/.test(code) ? 1 : 100) : null;
    const parsed = parseTencentHistory(rows, timezone, volumeMultiplier);
    const bars = selectHistoryWindow(parsed, range, interval, Date.now(), timezone);
    if (bars.length < 2) return err('not-found', `${instrument.id}: insufficient valid Tencent ${range} bars`);
    return ok({ instrumentId: instrument.id, range, interval, adjusted, adjustment: adjusted ? 'dividend-adjusted' : 'raw', bars,
      meta: { provider: 'tencent', tier: 'unverified', currency: instrument.currency, exchangeTimezone: timezone, receivedAt: Date.now(), lastBarAt: bars.at(-1)!.time } });
  }
}

interface FeedLine {
  key: string;
  fields: string[];
}

/** `v_hkHSI="100~恒生指数~HSI~…";` — ~ separated, GBK, one line per code. */
export function parseFeed(text: string): FeedLine[] {
  const decoded = looksLikeUtf8(text) ? text : text;
  const lines: FeedLine[] = [];
  for (const match of decoded.matchAll(/v_([A-Za-z0-9_.\-]+)="([^"]*)"/g)) {
    if (match[1] === 'pv_none_match') continue;
    lines.push({ key: match[1], fields: match[2].split('~') });
  }
  return lines;
}

function looksLikeUtf8(text: string): boolean {
  // The raw body arrives as bytes decoded with the wrong codec if something
  // upstream changed it; replacement characters are the visible symptom.
  return !text.includes('\ufffd');
}

function parseRow(instrument: Instrument, line: FeedLine): Quote | null {
  const f = line.fields;
  const num = (i: number): number | null => {
    const v = f[i];
    if (v === undefined || v === '' || v === '-') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const last = num(3);
  if (last === null || last === 0) return null;
  const previousClose = num(4);
  const change = num(31) ?? (previousClose !== null ? last - previousClose : null);
  const changePercent = num(32) ?? (previousClose && change !== null ? (change / previousClose) * 100 : null);
  const stamp = parseStamp(f[30], instrument);

  return {
    instrumentId: instrument.id,
    last,
    previousClose,
    change,
    changePercent,
    dayHigh: num(33),
    dayLow: num(34),
    open: num(5),
    // No documented unit ⇒ null. A dash is honest; a wrong number is not.
    volume: null,
    exchangeTimestamp: stamp,
    receivedAt: Date.now(),
    tier: 'unverified',
    quality: 'cached',
    provider: 'tencent',
    session: stamp ? 'regular' : null,
    currency: instrument.currency,
    marketCap: null,
    // Field 46 is an English display name on most listings, but not all: on
    // some index rows it holds a number. Only accept something name-shaped,
    // because this value is used to relabel the instrument in the UI.
    vendorName: pickName([f[46], f[1]]),
  };
}

/**
 * The feed prints two timestamp shapes: `2026-11-06 16:37:09` and the compact
 * `20261106161401`. Both are *exchange-local* strings with no offset, so they
 * are converted with the venue's own zone — the same routine the calendar uses,
 * which is what keeps a source timestamp and a session state consistent.
 */
export function parseStamp(value: string | undefined, instrument: Instrument): number | null {
  if (!value) return null;
  const tz = EXCHANGES[instrument.exchange].timezone;
  const dashed = /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value.trim());
  const parts = dashed
    ? [dashed[1], dashed[2], dashed[3], Number(dashed[4]), Number(dashed[5]), Number(dashed[6])]
    : compact
      ? [compact[1], compact[2], compact[3], Number(compact[4]), Number(compact[5]), Number(compact[6])]
      : null;
  if (!parts) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.round(parsed / 1000) : null;
  }
  const [y, m, d, hh, mi, ss] = parts;
  // utcFromLocalDate answers in ms; the Quote contract is epoch seconds.
  const ms = utcFromLocalDate(tz, `${y}-${m}-${d}`, Number(hh) * 60 + Number(mi)) + Number(ss) * 1000;
  return Math.round(ms / 1000);
}

const NAME_SHAPE = /^[A-Za-z\u4e00-\u9fff][A-Za-z0-9 ()&.,·\-–\u4e00-\u9fff]*$/;

function pickName(candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const trimmed = c.trim();
    if (trimmed.length < 2) continue;
    if (NAME_SHAPE.test(trimmed)) return trimmed;
  }
  return null;
}

/** Vendor key for the Tencent feed, derived from the instrument mapping. */
export function tencentCode(instrument: Instrument): string | null {
  const explicit = instrument.providerSymbols?.tencent;
  if (explicit) return explicit.startsWith('tc:') ? explicit.slice(3) : explicit;
  const symbol = instrument.displaySymbol;
  switch (instrument.market) {
    case 'US':
      if (symbol.startsWith('^')) return null;
      if (symbol.includes('=')) return null;
      return `us${symbol.replace(/-/g, '.')}`;
    case 'CN':
      if (instrument.exchange === 'CNE') return `sh${symbol}`;
      if (instrument.exchange === 'XSHE') return `sz${symbol}`;
      return null;
    case 'HK':
      return /^\d+$/.test(symbol) ? `hk${symbol}` : null;
    case 'GB':
      return null;
    default:
      return null;
  }
}

export const tencent = new TencentProvider();


/** Tencent daily+ rows are [date, open, close, high, low, volume, ...]. */
export function parseTencentHistory(rows: unknown[], timezone: string, volumeMultiplier: 1 | 100 | null): Bar[] {
  const unique = new Map<number, Bar>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5 || typeof row[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row[0])) continue;
    const isoDate = new Date(`${row[0]}T00:00:00Z`);
    if (!Number.isFinite(isoDate.getTime()) || isoDate.toISOString().slice(0, 10) !== row[0]) continue;
    const [o, c, h, l] = row.slice(1, 5).map(parseEastmoneyNumber);
    if (o === null || c === null || h === null || l === null || ![o, c, h, l].every(Number.isFinite) || h < Math.max(o, c) || l > Math.min(o, c)) continue;
    const time = Math.round(utcFromLocalDate(timezone, row[0], 0) / 1000);
    const volume = parseEastmoneyNumber(row[5]);
    // AKShare documents CN lots except sh688/sh689, which already use shares.
    // HK/US volume units remain unknown instead of being guessed.
    unique.set(time, { time, open: o, close: c, high: h, low: l, volume: volumeMultiplier !== null && volume !== null && volume >= 0 ? volume * volumeMultiplier : null });
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
