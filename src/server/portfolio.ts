import type { PortfolioPosition,PortfolioSummary } from '../shared/api';
import { convert } from './providers/fx';
import { fx,getSnapshots,resolveInstrument } from './service';
import type { CurrencyCode } from './types';
import { listHoldings } from './userdata';

type Positioned = PortfolioPosition & { costInValuation: number | null };

/**
 * Portfolio valuation rules (read-only, honest-by-construction).
 *
 *  1. Every position is valued in its own trading currency first, then
 *     converted with the FX table. If the rate for a position's currency is
 *     missing, the position is reported as unvalued and excluded from the
 *     total — never silently summed with the others.
 *  2. The total is labelled with the currency it is expressed in, the FX
 *     source, and the FX timestamp, so a reader can tell exactly how the
 *     number was produced.
 *  3. Market value and recorded cost are both translated at the same current
 *     reference FX rate. The result measures price return at current FX and
 *     excludes historical currency return; the UI states this valuation rule.
 *  4. Currency of the holding is validated against the instrument's trading
 *     currency at read time and a mismatch is surfaced as a warning rather
 *     than being quietly "fixed".
 */

export interface PortfolioBuildOptions {
  valuationCurrency: CurrencyCode;
  now?: number;
}

export async function buildPortfolio(opts: PortfolioBuildOptions): Promise<PortfolioSummary> {
  const nowMs = opts.now ?? Date.now();
  const holdings = listHoldings();
  const instruments = holdings
    .map((h) => ({ h, instrument: resolveInstrument(h.instrument_id) }))
    .filter((x): x is { h: (typeof holdings)[number]; instrument: NonNullable<typeof x.instrument> } => Boolean(x.instrument));

  const snapshots = await getSnapshots(instruments.map((x) => x.instrument.id), { mode: 'stale' });
  const snapById = new Map(snapshots.map((s) => [s.instrument.id, s]));
  const { rate: fxRate, issue: fxIssue } = await fx();

  const positions: Positioned[] = instruments.map(({ h, instrument }) => {
    const snapshot = snapById.get(instrument.id) ?? null;
    const quote = snapshot?.quote ?? null;
    const currency = h.currency as CurrencyCode;
    const costBasis = h.quantity * h.average_cost;

    const blocked: string | null = !quote || !Number.isFinite(quote.last)
      ? 'no-price'
      : currency !== instrument.currency
        ? `currency-mismatch:${currency}!=${instrument.currency}`
        : null;

    // A position counts toward the totals only when both legs (market value and
    // cost basis) can be expressed in the valuation currency. Half-valuing a
    // position is how a portfolio silently reports a wrong P/L.
    const marketValue: number | null =
      quote && Number.isFinite(quote.last) && !blocked
        ? convert(quote.last * h.quantity, currency, opts.valuationCurrency, fxRate)
        : null;
    const costInValuation: number | null = blocked
      ? null
      : convert(costBasis, currency, opts.valuationCurrency, fxRate);

    const pnl = marketValue !== null && costInValuation !== null ? marketValue - costInValuation : null;

    return {
      id: h.id,
      instrument,
      quantity: h.quantity,
      averageCost: h.average_cost,
      currency,
      purchasedAt: h.purchased_at,
      quote: snapshot,
      marketValue,
      costBasis,
      unrealizedPnl: pnl,
      unrealizedPnlPercent: pnl !== null && costInValuation ? (pnl / costInValuation) * 100 : null,
      weight: null,
      blockedReason: blocked ?? (marketValue === null || costInValuation === null ? `fx-missing:${currency}` : null),
      /** Cost basis restated in the valuation currency, used for the totals. */
      costInValuation,
    };
  });

  const valued = positions.filter((p) => p.marketValue !== null && p.costInValuation !== null);
  const totalValue = valued.length ? valued.reduce((sum, p) => sum + (p.marketValue as number), 0) : null;
  const totalCost = valued.reduce((sum, p) => sum + (p.costInValuation as number), 0);
  const totalPnl = totalValue === null ? null : totalValue - totalCost;

  for (const p of positions) {
    p.weight = p.marketValue !== null && totalValue ? (p.marketValue / totalValue) * 100 : null;
  }

  const distribution = (pick: (p: PortfolioPosition) => string) => {
    const acc = new Map<string, number>();
    for (const p of valued) acc.set(pick(p), (acc.get(pick(p)) ?? 0) + (p.marketValue as number));
    return [...acc.entries()]
      .map(([key, value]) => ({ key, value, weight: totalValue ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  };

  return {
    positions,
    totalValue,
    totalCost,
    totalPnl,
    totalPnlPercent: totalPnl !== null && totalCost > 0 ? (totalPnl / totalCost) * 100 : null,
    valuationCurrency: opts.valuationCurrency,
    fx: fxRate
      ? {
          rate: fxRate.quotes[opts.valuationCurrency] ?? (opts.valuationCurrency === 'USD' ? 1 : NaN),
          at: fxRate.sourceAt,
          source: fxRate.provider,
          tier: fxRate.tier,
        }
      : null,
    partialCoverage: {
      covered: valued.length,
      uncovered: positions.length - valued.length,
      note:
        positions.length !== valued.length
          ? `${positions.length - valued.length} of ${positions.length} positions could not be valued in ${opts.valuationCurrency}.`
          : null,
    },
    byCountry: distribution((p) => p.instrument.market).map((d) => ({ market: d.key as PortfolioSummary['byCountry'][number]['market'], value: d.value, weight: d.weight })),
    bySector: distribution((p) => p.instrument.sector ?? 'Unclassified').map((d) => ({ sector: d.key, value: d.value, weight: d.weight })),
    byCurrency: distribution((p) => p.currency).map((d) => ({ currency: d.key, value: d.value, weight: d.weight })),
    generatedAt: nowMs,
    issue: fxIssue,
  };
}
