import { buildOverview } from '@/server/service';
import type { NextRequest } from 'next/server';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * First-paint endpoint. `?mode=stale` (default) answers from memory or disk and
 * refreshes in the background, which is what keeps the opening screen under a
 * second; `?mode=await` blocks until the vendor replies and is used by tests
 * that need to assert against live numbers.
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') === 'await' ? 'await' : 'stale';
  return guarded(() => buildOverview({ mode }), 'overview');
}
