import { localSearch,resolveInstrument } from '@/server/service';
import type { MarketCode } from '@/server/types';
import type { NextRequest } from 'next/server';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * Turns a URL token into an instrument id.
 *
 * `/stocks/AAPL` has to decide what AAPL means when the same string is valid
 * in more than one market, so the priority is: exact id → market hint → the
 * curated universe → nothing. Ambiguous tokens return every candidate and the
 * client asks the user which one they meant.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('symbol') ?? '';
  const market = (req.nextUrl.searchParams.get('market') ?? '') as MarketCode | '';
  const asset = req.nextUrl.searchParams.get('asset') ?? '';
  return guarded(async () => {
    if (!token) return { id: null, candidates: [] };
    const direct = resolveInstrument(decodeURIComponent(token));
    if (direct && token.includes(':')) return { id: direct.id, candidates: [direct.id] };

    const hits = localSearch(token, 20);
    const filtered = hits.filter((h) => (!market || h.instrument.market === market) && (!asset || h.instrument.assetType === asset));
    const exact = filtered.filter((h) => h.instrument.displaySymbol.toLowerCase() === token.toLowerCase());
    const pool = exact.length ? exact : filtered;
    if (pool.length === 0) return { id: null, candidates: [] };
    if (pool.length > 1 && exact.length > 1) return { id: null, candidates: pool.map((p) => p.instrument.id) };
    return { id: pool[0].instrument.id, candidates: pool.map((p) => p.instrument.id) };
  }, 'resolve');
}
