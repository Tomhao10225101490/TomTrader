import { UNIVERSE } from '@/server/instruments';
import { getMetadata,getSnapshots,resolveInstrument } from '@/server/service';
import type { DetailResponse } from '@/shared/api';
import type { NextRequest } from 'next/server';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

/** Everything the stock page needs in one round trip. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  return guarded(async () => {
    const instrument = id ? resolveInstrument(id) : null;
    if (!instrument) {
      return { error: 'unknown-instrument', id, httpStatus: 404 };
    }
    const [snapshot] = await getSnapshots([instrument.id], { mode: 'await' });
    const { meta, issue } = await getMetadata(instrument.id, { mode: 'stale' });
    // "Same market" means comparable securities: for a stock, other stocks of
    // that market — not its FX pairs or futures, which share the market code.
    const pool = UNIVERSE.filter(
      (i) => i.market === instrument.market && i.assetType === instrument.assetType && i.id !== instrument.id,
    );
    const fallbackPool = UNIVERSE.filter(
      (i) => i.market === instrument.market && i.id !== instrument.id && i.assetType !== 'currency',
    );
    const relatedIds = (pool.length >= 4 ? pool : fallbackPool).slice(0, 6).map((i) => i.id);
    const related = await getSnapshots(relatedIds, { mode: 'stale' });
    return {
      instrument,
      snapshot,
      metadata: meta,
      metadataIssue: issue,
      related: related.filter((r) => r.instrument.market === instrument.market).slice(0, 6),
    } satisfies DetailResponse;
  }, 'detail');
}
