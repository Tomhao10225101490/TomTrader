import { EXCHANGES } from '../exchanges';
import { raw } from '../http';
import { utcFromLocalDate } from '../marketstatus';
import type {
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

export class TencentProvider implements MarketDataProvider {
  readonly id = 'tencent' as const;
  readonly label = 'Tencent quote feed (public web endpoint)';
  readonly markets: MarketCode[] = ['US', 'CN', 'HK', 'GB'];
  readonly capabilities = {
    quotes: true,
    historicalBars: false,
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
        if (quote) out.push(quote);
      }
    }
    return ok(out);
  }

  async getHistoricalBars(instrument: Instrument, _range: BarRange, _interval: BarInterval): Promise<CapabilityResult<Bars>> {
    if (!publicFeedsEnabled()) return err('unsupported', 'Public adapter disabled; confirm data rights before enabling TOMTRADER_PUBLIC_FEEDS.');
    return err('unsupported', `Tencent history is not wired into TomTrader (${instrument.id}); use Yahoo or Eastmoney`);
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
