import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteSnapshot } from '@/shared/api';

class StreamFixture {
  static opened: StreamFixture[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) { StreamFixture.opened.push(this); }
  close() { this.closed = true; }
  quote(snapshot: QuoteSnapshot) { this.onmessage?.({ data: JSON.stringify({ type: 'quotes', quotes: [snapshot] }) }); }
}

const fixture = (receivedAt: number, last = 10): QuoteSnapshot => ({
  instrument: { id: 'equity:US:AAPL' }, quote: { receivedAt, last }, status: { state: 'open' },
}) as QuoteSnapshot;
let documentFixture: EventTarget & { hidden: boolean };
let windowFixture: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  StreamFixture.opened = [];
  documentFixture = Object.assign(new EventTarget(), { hidden: false });
  windowFixture = new EventTarget();
  vi.stubGlobal('document', documentFixture);
  vi.stubGlobal('window', windowFixture);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('EventSource', StreamFixture);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshots: [] }) }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('client quote lifecycle (synthetic transport fixtures)', () => {
  it('releasing an older consumer preserves all newer mounted subscriptions', async () => {
    const { useLive } = await import('@/stores/live');
    const first = useLive.getState().interest(['A', 'A']);
    const second = useLive.getState().interest(['A', 'B']);
    const third = useLive.getState().interest(['C']);
    expect(useLive.getState().refs.get('A')).toBe(2);
    first();
    first(); // React cleanup must be harmless when repeated.
    expect([...useLive.getState().refs]).toEqual([['A', 1], ['B', 1], ['C', 1]]);
    third();
    second();
    expect(useLive.getState().refs.size).toBe(0);
  });

  it('honors persisted Off on first mount without briefly opening a stream', async () => {
    const { useLive } = await import('@/stores/live');
    useLive.getState().setRefreshPolicy('off');
    useLive.getState().init();
    expect(StreamFixture.opened).toHaveLength(0);
    expect(useLive.getState().connection).toBe('paused');
    useLive.getState().setRefreshPolicy('auto');
    expect(StreamFixture.opened).toHaveLength(1);
  });

  it('prevents older HTTP snapshots from overwriting newer stream quotes or removing sparklines', async () => {
    const { useLive } = await import('@/stores/live');
    useLive.getState().init();
    StreamFixture.opened[0].quote({ ...fixture(200, 20), sparkline: [10, 20] });
    useLive.getState().primeSnapshots([fixture(100, 10)]);
    expect(useLive.getState().snapshots['equity:US:AAPL'].quote?.last).toBe(20);
    StreamFixture.opened[0].quote(fixture(300, 30));
    expect(useLive.getState().snapshots['equity:US:AAPL'].sparkline).toEqual([10, 20]);
  });

  it('aborts and ignores an in-flight slow response after refresh is turned Off', async () => {
    const { useLive } = await import('@/stores/live');
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    useLive.getState().interest(['equity:US:AAPL']);
    useLive.getState().setRefreshPolicy('slow');
    useLive.getState().init();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    useLive.getState().setRefreshPolicy('off');
    expect(signal?.aborted).toBe(true);
    finish({ ok: true, json: async () => ({ snapshots: [fixture(400)] }) } as Response);
    await vi.advanceTimersByTimeAsync(1);
    expect(useLive.getState().snapshots).toEqual({});
    expect(useLive.getState().connection).toBe('paused');
  });

  it('closes hidden streams and opens only one replacement on return', async () => {
    const { useLive } = await import('@/stores/live');
    useLive.getState().init();
    const old = StreamFixture.opened[0];
    documentFixture.hidden = true;
    documentFixture.dispatchEvent(new Event('visibilitychange'));
    expect(old.closed).toBe(true);
    old.quote(fixture(500));
    expect(useLive.getState().snapshots).toEqual({});
    expect(useLive.getState().connection).toBe('paused');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(StreamFixture.opened).toHaveLength(1);
    documentFixture.hidden = false;
    documentFixture.dispatchEvent(new Event('visibilitychange'));
    expect(StreamFixture.opened).toHaveLength(2);
    expect(StreamFixture.opened.filter((s) => !s.closed)).toHaveLength(1);
  });

  it('pauses slow polling while hidden and catches up immediately when visible', async () => {
    const { useLive } = await import('@/stores/live');
    useLive.getState().interest(['equity:US:AAPL']);
    useLive.getState().setRefreshPolicy('slow');
    useLive.getState().init();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    documentFixture.hidden = true;
    documentFixture.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    documentFixture.hidden = false;
    documentFixture.dispatchEvent(new Event('visibilitychange'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses distinct stream identities for independent tabs even with cloned storage', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'cloned-tab-id', setItem: vi.fn() });
    const first = await import('@/stores/live');
    first.useLive.getState().init();
    vi.resetModules();
    const second = await import('@/stores/live');
    second.useLive.getState().init();
    const clients = StreamFixture.opened.map((s) => new URL(s.url, 'http://localhost').searchParams.get('client'));
    expect(new Set(clients).size).toBe(2);
    expect(clients).not.toContain('cloned-tab-id');
  });

  it('does not claim a slow-poll connection succeeded after HTTP errors and recovers on the next poll', async () => {
    const { useLive } = await import('@/stores/live');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    useLive.getState().interest(['equity:US:AAPL']);
    useLive.getState().setRefreshPolicy('slow');
    useLive.getState().init();
    await vi.advanceTimersByTimeAsync(1);
    expect(useLive.getState().connection).toBe('backoff');
    expect(useLive.getState().lastError).toContain('503');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useLive.getState().connection).toBe('open');
    expect(useLive.getState().lastError).toBeNull();
  });
});
