import { getBars,sparklineFromCache } from '@/server/service';
import type { NextRequest } from 'next/server';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * Card trend lines are loaded separately from the quote batch: a missing
 * sparkline must never delay a price, and one index without history should not
 * make the whole overview wait.
 */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 24);
  return guarded(async () => {
    const out: Record<string, number[] | null> = {};
    for (const id of ids) {
      const cached = sparklineFromCache(id);
      if (cached) {
        out[id] = cached;
        continue;
      }
      const { bars } = await getBars(id, '3M', '1d');
      out[id] = bars ? bars.bars.slice(-30).map((b) => b.close) : null;
    }
    return { series: out, generatedAt: Date.now() };
  }, 'sparkline');
}
