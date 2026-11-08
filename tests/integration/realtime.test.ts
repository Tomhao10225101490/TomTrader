/**
 * The realtime pipeline: one client attaching, subscribing, receiving frames,
 * and the server trimming its poll set when the client leaves.
 */
vi.hoisted(() => {
  process.env.TOMTRADER_DEMO = '1';
  process.env.TOMTRADER_PUBLIC_FEEDS = '0';
  process.env.TOMTRADER_DB = ':memory:';
});

import { attach,detach,hubState,setPaused,subscribe } from '@/server/realtime';
import type { SseFrame } from '@/shared/api';
import { afterEach,describe,expect,it,vi } from 'vitest';

/** The hub is process-global, so every test must leave it empty. */
const clients: string[] = [];
function connect(id: string, sink: (f: SseFrame) => void) {
  clients.push(id);
  attach(id, sink, () => undefined);
}
afterEach(() => {
  for (const id of clients.splice(0)) detach(id);
});

describe('stream hub', () => {
  it('attaches a client, subscribes ids and pushes only changes', async () => {
    const frames: SseFrame[] = [];
    const clientId = 'test-client-1';
    connect(clientId, (f) => frames.push(f));
    subscribe(clientId, ['equity:US:AAPL', 'index:US:^GSPC']);

    const state = hubState();
    expect(state.clients).toBe(1);
    expect(state.subscribed).toBe(2);

    await new Promise((r) => setTimeout(r, 6_000));
    const quoteFrames = frames.filter((f) => f.type === 'quotes');
    expect(quoteFrames.length).toBeGreaterThan(0);
    const seen = new Set(quoteFrames.flatMap((f) => (f.quotes ?? []).map((q) => q.instrument.id)));
    expect(seen.size).toBeGreaterThan(0);
    for (const id of seen) expect(['equity:US:AAPL', 'index:US:^GSPC']).toContain(id);

    // A completed background response must reach the stream even while the
    // venue is closed; the next regular tick can be five minutes away.
    frames.length = 0;
    const { refreshQuotes } = await import('@/server/service');
    const refresh = await refreshQuotes(['equity:US:AAPL']);
    const receivedAt = refresh.quotes.get('equity:US:AAPL')!.receivedAt;
    await vi.waitFor(() => {
      expect(frames.some((f) => f.quotes?.some((s) => s.instrument.id === 'equity:US:AAPL' && s.quote?.receivedAt === receivedAt))).toBe(true);
    }, { timeout: 2000 });
  });

  it('de-duplicates a subscription shared by two clients', () => {
    connect('c-a', () => undefined);
    connect('c-b', () => undefined);
    subscribe('c-a', ['equity:US:NVDA', 'equity:US:TSLA']);
    subscribe('c-b', ['equity:US:NVDA']);
    expect(hubState().subscribed).toBe(2);
    detach('c-a');
    clients.splice(clients.indexOf('c-a'), 1);
    expect(hubState().subscribed).toBe(1);
  });

  it('stops feeding a hidden tab', () => {
    const frames: SseFrame[] = [];
    connect('c-hidden', (f) => frames.push(f));
    subscribe('c-hidden', ['equity:US:AAPL']);
    expect(hubState().subscribed).toBe(1);
    setPaused('c-hidden', true);
    expect(hubState().subscribed).toBe(0);
    setPaused('c-hidden', false);
    expect(hubState().subscribed).toBe(1);
  });

  it('adapts the poll interval to the venues that are actually trading', async () => {
    const { desiredInterval } = await import('@/server/realtime');
    // A weekend instant: nothing open, so the pipeline must idle.
    const weekend = Date.parse('2026-11-07T09:00:00Z');
    expect(desiredInterval(['index:US:^GSPC', 'index:CN:000001'], weekend)).toBeGreaterThanOrEqual(60_000);

    const usAfternoon = Date.parse('2026-11-09T15:00:00Z'); // NY open, China closed
    expect(desiredInterval(['index:US:^GSPC'], usAfternoon)).toBeLessThan(60_000);

    const chinaMorning = Date.parse('2026-11-09T02:00:00Z'); // Shanghai open
    expect(desiredInterval(['index:CN:000001'], chinaMorning)).toBeLessThanOrEqual(10_000);
  });
});
