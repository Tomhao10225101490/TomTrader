import { getSnapshots } from '@/server/service';
import type { NextRequest } from 'next/server';
import { guarded,idsFromRequest } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ids = await idsFromRequest(req, req.nextUrl.searchParams);
  if (!ids.length) return guarded(async () => ({ snapshots: [], generatedAt: Date.now() }), 'quotes');
  const mode = req.nextUrl.searchParams.get('mode') === 'await' ? 'await' : ids.length > 6 ? 'stale' : 'await';
  return guarded(async () => ({ snapshots: await getSnapshots(ids, { mode }), generatedAt: Date.now() }), 'quotes');
}

export async function POST(req: Request) {
  const ids = await idsFromRequest(req, new URLSearchParams(''));
  return guarded(async () => ({ snapshots: await getSnapshots(ids, { mode: 'stale' }), generatedAt: Date.now() }), 'quotes');
}
