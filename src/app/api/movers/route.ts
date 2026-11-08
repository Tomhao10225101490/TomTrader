import { HEATMAP_POOLS } from '@/server/instruments';
import { getSnapshots,movers } from '@/server/service';
import type { MoversResponse } from '@/shared/api';
import type { NextRequest } from 'next/server';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const pool = req.nextUrl.searchParams.get('pool') ?? 'US';
  return guarded(async () => {
    const ids = HEATMAP_POOLS.find((p) => p.key === pool)?.ids ?? HEATMAP_POOLS[0].ids;
    await getSnapshots(ids, { mode: 'stale' });
    const result = movers(ids);
    return { ...result, generatedAt: Date.now() } satisfies MoversResponse;
  }, 'movers');
}
