import { hubState,setPaused,subscribe } from '@/server/realtime';
import type { NextRequest } from 'next/server';
import { guarded } from '../../_lib';

export const dynamic = 'force-dynamic';

/**
 * Subscription control for an attached stream client.
 * `{ client, ids?, paused? }` — the client sends this on mount, on route
 * change, and whenever the tab's visibility flips.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { client?: string; ids?: string[]; paused?: boolean };
  if (!body.client) return guarded(() => Promise.resolve({ error: 'client required' }), 'stream-state');
  return guarded(() => {
    if (Array.isArray(body.ids)) subscribe(body.client!, body.ids);
    if (typeof body.paused === 'boolean') setPaused(body.client!, body.paused);
    return Promise.resolve({ ok: true, state: hubState() });
  }, 'stream-state');
}
