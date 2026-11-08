import { instrumentById } from '@/server/instruments';
import { getSnapshots,resolveInstrument } from '@/server/service';
import {
addToGroup,
createGroup,
deleteGroup,
listGroups,
removeFromGroup,
renameGroup,
reorderGroup,
togglePinned,
} from '@/server/userdata';
import type { NextRequest } from 'next/server';
import { fail,guarded,mutationAllowed } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * Watchlists are stored server-side in the local SQLite file rather than in
 * localStorage: the same list must survive a browser profile reset, and the
 * server needs the membership anyway to decide what to poll.
 */
export async function GET() {
  return guarded(async () => {
    const groups = listGroups();
    const ids = [...new Set(groups.flatMap((g) => g.instrumentIds))];
    const snapshots = await getSnapshots(ids, { mode: 'stale' });
    return { groups, snapshots, generatedAt: Date.now() };
  }, 'watchlist');
}

type Body = {
  op?: string;
  groupId?: string;
  name?: string;
  instrumentId?: string;
  ids?: string[];
  position?: number;
};

export async function POST(req: NextRequest) {
  if (!mutationAllowed(req)) return fail('Cross-origin mutations are not allowed', 403);
  const raw: unknown = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Expected a JSON object', 400);
  const body = raw as Body;
  for (const key of ['op', 'id', 'instrumentId', 'groupId', 'name', 'currency', 'purchasedAt', 'note'] as const) {
    if (key in raw && typeof (raw as Record<string, unknown>)[key] !== 'string') return fail(`${key} must be a string`, 400);
  }
  if (body.name !== undefined && (!body.name.trim() || body.name.length > 80)) return fail('name must contain 1 to 80 characters', 400);
  if (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.length > 400 || body.ids.some((id) => typeof id !== 'string'))) return fail('ids must be an array of up to 400 strings', 400);
  switch (body.op) {
    case 'create':
      return guarded(() => Promise.resolve({ group: createGroup(body.name ?? 'New list') }), 'watchlist');
    case 'rename':
      if (!body.groupId) return fail('groupId required', 400);
      return guarded(() => Promise.resolve(renameGroup(body.groupId!, body.name ?? '')), 'watchlist');
    case 'delete':
      if (!body.groupId) return fail('groupId required', 400);
      return guarded(() => Promise.resolve(deleteGroup(body.groupId!)), 'watchlist');
    case 'add': {
      if (!body.groupId || !body.instrumentId) return fail('groupId and instrumentId required', 400);
      if (!resolveInstrument(body.instrumentId)) return fail('unknown instrument', 404);
      return guarded(() => Promise.resolve(addToGroup(body.groupId!, body.instrumentId!, body.position)), 'watchlist');
    }
    case 'remove':
      if (!body.groupId || !body.instrumentId) return fail('groupId and instrumentId required', 400);
      return guarded(() => Promise.resolve(removeFromGroup(body.groupId!, body.instrumentId!)), 'watchlist');
    case 'reorder':
      if (!body.groupId || !Array.isArray(body.ids)) return fail('groupId and ids required', 400);
      return guarded(() => Promise.resolve(reorderGroup(body.groupId!, body.ids!)), 'watchlist');
    case 'pin':
      if (!body.groupId || !body.instrumentId) return fail('groupId and instrumentId required', 400);
      return guarded(() => Promise.resolve(togglePinned(body.groupId!, body.instrumentId!)), 'watchlist');
    default:
      return fail(`unknown op ${body.op ?? '(none)'}`, 400);
  }
}

/** Used by the import path: validate every id before anything is written. */
export function validateIds(ids: string[]): string[] {
  return ids.filter((id) => instrumentById(id) || resolveInstrument(id));
}
