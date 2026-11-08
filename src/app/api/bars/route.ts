import { EXCHANGES } from '@/server/exchanges';
import { offsetMinutesAt } from '@/server/marketstatus';
import { RANGE_PLAN } from '@/server/providers/provider';
import { getBars,marketStatusFor,resolveInstrument } from '@/server/service';
import type { BarInterval,BarRange } from '@/server/types';
import type { NextRequest } from 'next/server';
import { fail,guarded } from '../_lib';

export const dynamic = 'force-dynamic';

const RANGES = new Set<string>(Object.keys(RANGE_PLAN));

/**
 * History endpoint.
 *
 * The `axisOffsetMinutes` field is the reason chart axes can be shown in
 * exchange time without lying: the client adds this offset to each bar's UTC
 * instant purely for display, and the offset is computed by the same Intl
 * lookup the market clock uses, so it is correct across daylight saving.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const range = (req.nextUrl.searchParams.get('range') ?? '3M') as BarRange;
  const interval = req.nextUrl.searchParams.get('interval') as BarInterval | null;
  if (interval && !['1m', '5m', '15m', '1h', '1d', '1wk', '1mo'].includes(interval)) return fail('unknown interval', 400);
  if (!id) return fail('missing id', 400);
  if (!RANGES.has(range)) return fail('unknown range', 400);
  const instrument = resolveInstrument(id);
  if (!instrument) return fail('unknown instrument', 404);

  return guarded(async () => {
    const { bars, issue } = await getBars(id, range, interval ?? undefined, { await: req.nextUrl.searchParams.get('wait') === '1' });
    const tz = EXCHANGES[instrument.exchange].timezone;
    const status = marketStatusFor(instrument.exchange, Date.now());
    void status;
    return {
      // `series` is the wire name the client's BarsResponse uses; `bars` is the
      // server-side function's name. Mixing them up silently empties the chart.
      series: bars,
      issue,
      axisTimezone: tz,
      axisOffsetMinutes: offsetMinutesAt(Date.now(), tz),
    };
  }, 'bars');
}
