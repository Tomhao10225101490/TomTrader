import type { CurrencyCode,Instrument,Quote } from '../server/types';

/**
 * Presentation rules for prices, percentages, volumes and times.
 *
 * Two rules drive everything here, and both come from the product's data
 * honesty requirements rather than taste:
 *
 *  1. A missing value is never rendered as `0`. `null`, `undefined` and `NaN`
 *     all become an explicit em dash, and callers get `null` back so they can
 *     show a "no data" state instead of a fake number.
 *  2. Currency and locale are explicit inputs. Nothing here reads the browser
 *     clock or the browser locale implicitly — the caller passes the user's
 *     preferences, which is what makes screenshots and tests reproducible.
 */

export const EMPTY = '—';

/** ISO-4217 zero-decimal currencies. Indices are exempt (they are computed). */
const ZERO_DECIMAL = new Set<CurrencyCode>(['JPY', 'KRW']);

export type LocaleTag = 'en' | 'zh';

export function decimalsFor(instrument: Pick<Instrument, 'assetType' | 'currency'>, value: number): number {
  const { assetType, currency } = instrument;
  if (!Number.isFinite(value)) return 2;
  switch (assetType) {
    case 'currency':
      // FX convention: JPY pairs three places, most others four, big numbers two.
      if (currency === 'JPY' || value >= 200) return value >= 1000 ? 2 : 3;
      if (value >= 100) return 3;
      if (value >= 10) return 4;
      return 4;
    case 'index':
      return 2;
    case 'commodity':
      return value >= 100 ? 2 : 3;
    default:
      if (ZERO_DECIMAL.has(currency)) return 0;
      if (value < 1) return 4;
      if (value < 10) return 3;
      return 2;
  }
}

/** Price with grouping, currency symbol and explicit empty state. */
export function formatPrice(
  value: number | null | undefined,
  instrument: Pick<Instrument, 'assetType' | 'currency'>,
  locale: LocaleTag,
  opts: { symbol?: boolean; decimals?: number } = {},
): { text: string; changedFrom?: string } | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const decimals = opts.decimals ?? decimalsFor(instrument, value);
  const num = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  const symbol = opts.symbol === false || !showSymbol(instrument.assetType) ? '' : `${currencySymbol(instrument.currency)}`;
  return { text: symbol ? `${symbol} ${num}` : num };
}

function showSymbol(assetType: Instrument['assetType']): boolean {
  // FX pairs and futures are already named by their pair code; a "$" prefix
  // on EURUSD would be actively wrong.
  return assetType !== 'currency' && assetType !== 'commodity';
}

export function formatValue(value: number | null | undefined, locale: LocaleTag, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPlain(value: number | null | undefined, locale: LocaleTag, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Signed percent. The sign is always present so colour is never the only cue. */
export function formatPercent(
  value: number | null | undefined,
  locale: LocaleTag,
  opts: { decimals?: number; plus?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  const magnitude = Math.abs(value);
  const decimals = opts.decimals ?? (magnitude >= 1000 ? 1 : 2);
  const num = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(magnitude);
  const sign = value > 0 ? (opts.plus ? '+' : '+') : value < 0 ? '−' : '';
  return `${sign}${num}%`;
}

/** Signed absolute change, magnitude-only digits with a leading sign. */
export function formatChange(value: number | null | undefined, locale: LocaleTag, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  const num = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${num}`;
}

export function formatVolume(value: number | null | undefined, locale: LocaleTag): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatVolumePrecise(value: number | null | undefined, locale: LocaleTag): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(value);
}

export function formatMarketCap(value: number | null | undefined, currency: CurrencyCode, locale: LocaleTag): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return EMPTY;
  const compact = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
  // Chinese grouping already produced 亿/万; latin grouping produced M/B.
  return `${currencySymbol(currency)}${compact}`;
}

export function currencySymbol(code: CurrencyCode | string): string {
  const map: Record<string, string> = {
    USD: '$',
    CNY: '¥',
    JPY: 'JP¥',
    HKD: 'HK$',
    EUR: '€',
    GBP: '£',
    KRW: '₩',
    TWD: 'NT$',
    INR: '₹',
    AUD: 'A$',
    BRL: 'R$',
  };
  return map[code] ?? `${code} `;
}

/* ---------------------------------------------------------------- time */

export type TimeZoneMode = 'local' | 'exchange' | 'utc' | 'newyork' | 'shanghai';

export const FIXED_ZONES: Record<Exclude<TimeZoneMode, 'local' | 'exchange'>, string> = {
  utc: 'UTC',
  newyork: 'America/New_York',
  shanghai: 'Asia/Shanghai',
};

export function zoneFor(mode: TimeZoneMode, exchangeZone: string | undefined): string {
  if (mode === 'local') return Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (mode === 'exchange') return exchangeZone ?? 'UTC';
  return FIXED_ZONES[mode];
}

export function formatClock(ms: number | null | undefined, zone: string, locale: LocaleTag, opts: { seconds?: boolean; date?: boolean } = {}): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return EMPTY;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    timeZone: zone,
    year: opts.date ? 'numeric' : undefined,
    month: opts.date ? 'short' : undefined,
    day: opts.date ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    second: opts.seconds ? '2-digit' : undefined,
    hour12: locale === 'en' ? true : false,
  }).format(new Date(ms));
}

/** "4 minutes ago" / "4 分钟前", clamped to a human useful range. */
export function formatAgo(ms: number, now: number, locale: LocaleTag): string {
  const delta = Math.max(0, now - ms);
  const sec = Math.round(delta / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { numeric: 'always' });
  if (sec < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  return rtf.format(-day, 'day');
}

/** Duration in minutes rendered as "1h 20m" / "1 小时 20 分". */
export function formatDuration(minutes: number | null, locale: LocaleTag): string {
  if (minutes === null || !Number.isFinite(minutes)) return EMPTY;
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return locale === 'zh' ? `${m} 分钟` : `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return locale === 'zh' ? `${h} 小时 ${rest} 分` : `${h}h ${rest}m`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return locale === 'zh' ? `${d} 天 ${hh} 小时` : `${d}d ${hh}h`;
}

/** Bar timestamp for a chart legend, in the venue's own clock. */
export function formatBarTime(seconds: number, zone: string, locale: LocaleTag, intraday: boolean): string {
  const d = new Date(seconds * 1000);
  if (!intraday) {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(d);
  }
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/* ------------------------------------------------------- direction helpers */

export type Direction = 'up' | 'down' | 'flat';

export function directionOf(quote: Pick<Quote, 'change' | 'changePercent'> | null | undefined): Direction {
  if (!quote) return 'flat';
  const v = quote.changePercent ?? quote.change;
  if (v === null || v === undefined || !Number.isFinite(v)) return 'flat';
  if (v > 0) return 'up';
  if (v < 0) return 'down';
  return 'flat';
}

export function directionGlyph(dir: Direction, convention: 'intl' | 'cn'): string {
  // The glyph carries meaning independent of hue, which is what colour-blind
  // users and black-and-white screenshots rely on.
  if (dir === 'flat') return '–';
  const rising = dir === 'up';
  void convention;
  return rising ? '▲' : '▼';
}

/**
 * Split a formatted price into the digits that stayed and the digits that
 * moved, so only the moved part is tinted.
 */
export function digitDiff(prev: string | null, next: string): { stable: string; changed: string } {
  if (!prev) return { stable: '', changed: next };
  let i = 0;
  while (i < prev.length && i < next.length && prev[i] === next[i]) i++;
  return { stable: next.slice(0, i), changed: next.slice(i) };
}
