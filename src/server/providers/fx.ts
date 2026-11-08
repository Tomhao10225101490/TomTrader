import { fetchJson } from '../http';
import type { CapabilityResult,CurrencyCode,FxRate,Instrument } from '../types';
import { err,ok } from '../types';
import { publicFeedsEnabled } from './access';
import { RANGE_PLAN } from './provider';
import { yahoo } from './yahoo';

/**
 * Foreign-exchange reference rates for portfolio valuation.
 *
 * Rule the module exists to enforce: never add two currencies together
 * without a rate, a rate timestamp and a stated source. `convert()` refuses
 * when the pair is unknown, and the portfolio service renders that refusal as
 * an explicit "FX unavailable" row instead of a silently wrong total.
 *
 * Primary source: the same Yahoo FX pairs the app quotes on its Overview page,
 * so the FX numbers on a portfolio card carry the same timestamp semantics as
 * every other price in the product.
 * Fallback: open.er-api.com, which publishes once per day (tier end-of-day).
 */

const FX_INSTRUMENTS: Instrument[] = [
  fxRow('USDCNY=X', 'CNY'),
  fxRow('USDHKD=X', 'HKD'),
  fxRow('USDJPY=X', 'JPY'),
  fxRow('USDKRW=X', 'KRW'),
  fxRow('USDINR=X', 'INR'),
  fxRow('USDBRL=X', 'BRL'),
  fxRow('USDTWD=X', 'TWD'),
  fxRow('EURUSD=X', 'EUR'),
  fxRow('GBPUSD=X', 'GBP'),
  fxRow('AUDUSD=X', 'AUD'),
];

function fxRow(symbol: string, _currency: CurrencyCode): Instrument {
  return {
    id: `currency:US:${symbol}`,
    displaySymbol: symbol,
    vendorSymbol: symbol,
    providerSymbols: { yahoo: symbol },
    name: symbol.replace('=X', '/'),
    nameZh: null,
    assetType: 'currency',
    market: 'US',
    exchange: 'OTC',
    currency: 'USD',
  };
}

/** Yahoo quotes EURUSD/AUDUSD/GBPUSD as "how many USD per 1 unit". */
const QUOTED_IN_USD = new Set(['EUR', 'GBP', 'AUD']);

export async function getFxRates(): Promise<CapabilityResult<FxRate>> {
  const quotesResult = publicFeedsEnabled() ? await yahoo.getQuotes(FX_INSTRUMENTS) : err<import('../types').Quote[]>('unsupported', 'Public quotes disabled');
  if (quotesResult.ok && quotesResult.data.length >= 4) {
    const quotes: Partial<Record<CurrencyCode, number>> = { USD: 1 };
    const stamps: number[] = [];
    let anyUnverified = false;

    for (const q of quotesResult.data) {
      const symbol = q.instrumentId.split(':').pop() ?? '';
      const pair = symbol.replace('=X', '');
      const code = (pair.startsWith('USD') ? pair.slice(3) : pair.slice(0, 3)) as CurrencyCode;
      if (!Number.isFinite(q.last) || q.last <= 0) continue;
      const value = QUOTED_IN_USD.has(code) ? 1 / q.last : q.last;
      quotes[code] = value;
      if (q.exchangeTimestamp) stamps.push(q.exchangeTimestamp);
      if (q.tier !== 'realtime') anyUnverified = true;
    }

    const count = Object.keys(quotes).length;
    if (count >= 5) {
      return ok({
        base: 'USD',
        quotes,
        sourceAt: stamps.length ? Math.min(...stamps) * 1000 : Date.now(),
        receivedAt: Date.now(),
        tier: anyUnverified ? 'unverified' : 'realtime',
        provider: 'yahoo',
      });
    }
  }

  // Fallback: daily reference table.
  const res = await fetchJson<ErApiResponse>('https://open.er-api.com/v6/latest/USD', { retries: 2, timeoutMs: 12_000 });
  if (!res.ok) {
    return err(
      res.error.kind === 'rate-limit' ? 'rate-limited' : 'network',
      `FX sources unavailable (yahoo: ${quotesResult.ok ? 'partial' : 'failed'}; er-api: ${res.error.message})`,
      res.error.retryAfterMs,
    );
  }
  if (res.data.result !== 'success' || !res.data.rates || !Number.isFinite(Date.parse(res.data.time_last_update_utc))) return err('parse-error', 'FX provider returned an invalid rate table or source timestamp');
  const wanted: CurrencyCode[] = ['CNY', 'HKD', 'JPY', 'EUR', 'GBP', 'KRW', 'INR', 'AUD', 'BRL', 'TWD'];
  const quotes: Partial<Record<CurrencyCode, number>> = { USD: 1 };
  for (const code of wanted) {
    const v = res.data.rates[code];
    if (typeof v === 'number' && v > 0) quotes[code] = v;
  }
  return ok({
    base: 'USD',
    quotes,
    sourceAt: Date.parse(res.data.time_last_update_utc),
    receivedAt: Date.now(),
    tier: 'end-of-day',
    provider: 'fx-open.er-api',
  });
}

interface ErApiResponse {
  result: string;
  time_last_update_utc: string;
  base_code: string;
  rates: Record<string, number>;
}

/** Convert an amount between currencies. Null = no rate, caller must show it. */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, fx: FxRate | null): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  if (!fx) return null;
  const fromRate = fx.quotes[from];
  const toRate = fx.quotes[to];
  if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return null;
  return (amount / fromRate) * toRate;
}

export function fxProviderMeta() {
  return {
    primary: 'Yahoo FX pairs (same feed as quotes)',
    fallback: 'open.er-api.com daily reference table',
    rangePlan: Object.keys(RANGE_PLAN).length,
  };
}
