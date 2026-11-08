import { buildHeatmap } from '@/server/service';
import type { HeatmapResponse } from '@/shared/api';
import type { NextRequest } from 'next/server';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const pool = req.nextUrl.searchParams.get('pool') ?? 'US';
  const period = (req.nextUrl.searchParams.get('period') ?? 'intraday') as 'intraday' | '5d' | '1m';
  return guarded(async () => {
    const { cells, coverage } = await buildHeatmap(pool, period);
    return {
      pool,
      period,
      cells,
      coverage,
      generatedAt: Date.now(),
    } satisfies HeatmapResponse;
  }, 'heatmap');
}
