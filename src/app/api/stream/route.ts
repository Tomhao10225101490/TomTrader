import { ensureBoot } from '@/server/boot';
import { attach,detach,hubState,subscribe } from '@/server/realtime';
import type { SseFrame } from '@/shared/api';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Server-sent events, one long-lived stream per tab.
 *
 * `GET /api/stream?client=<id>&ids=<a,b,c>`
 *   → an `open` frame with the current snapshot set, then incremental `quotes`
 *     frames, `heartbeat` every 25s, and `state` frames when the pipeline
 *     changes. The client sends `HEAD`/`?pause=1` style pings to the companion
 *     endpoint when its tab goes hidden, so a backgrounded tab costs no polls.
 */
export async function GET(req: NextRequest) {
  ensureBoot();
  const clientId = req.nextUrl.searchParams.get('client') ?? crypto.randomUUID();
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean);

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: SseFrame) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        } catch {
          /* the reader is gone */
        }
      };

      const close = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      cleanup = () => { detach(clientId, send); close(); };
      attach(clientId, send, close);
      if (ids.length) subscribe(clientId, ids);

      // Replay what we already hold so the client does not wait a poll cycle.
      const state = hubState();
      send({ type: 'state', at: Date.now(), state: { ...state, paused: false } });

      req.signal.addEventListener('abort', cleanup, { once: true });
      if (req.signal.aborted) cleanup();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
