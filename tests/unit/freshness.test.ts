import { classifyFreshness,GRACE_MS } from '@/server/freshness';
import type { FeedTier } from '@/server/types';
import { describe,expect,it } from 'vitest';

const T0 = Date.parse('2026-11-06T15:00:00Z');

function make(over: Partial<Parameters<typeof classifyFreshness>[0]> = {}) {
  return classifyFreshness({
    tier: 'unverified',
    receivedAt: T0,
    exchangeTimestamp: T0 / 1000,
    marketOpen: true,
    nowMs: T0,
    ...over,
  });
}

describe('freshness classification', () => {
  it('never calls an undocumented feed real-time, however fresh it looks', () => {
    // This is the rule that stops TomTrader lying about liveness.
    const fresh = make({ tier: 'unverified', marketOpen: true });
    expect(fresh.quality).toBe('delayed');
    expect(fresh.quality).not.toBe('realtime');
  });

  it('reserves the real-time label for a declared entitlement', () => {
    expect(make({ tier: 'realtime' }).quality).toBe('realtime');
  });

  it('keeps a declared-delayed feed "delayed" inside its own window', () => {
    const tier: FeedTier = 'delayed-15';
    const received = T0;
    const print = (received - 14 * 60_000) / 1000;
    expect(make({ tier, receivedAt: received, exchangeTimestamp: print }).quality).toBe('delayed');
  });

  it('turns stale only after the declared delay plus grace has passed', () => {
    const at = (ms: number) => make({ tier: 'delayed-15', receivedAt: T0, exchangeTimestamp: (T0 - 15 * 60_000) / 1000, nowMs: T0 + ms });
    expect(at(9 * 60_000).quality).toBe('delayed');
    expect(at(11 * 60_000).quality).toBe('stale');
  });

  it('treats an out-of-session print as cached, not stale', () => {
    const fridayClose = Date.parse('2026-11-06T21:00:00Z');
    const monday = fridayClose + 3 * 86_400_000;
    const result = make({
      receivedAt: fridayClose,
      exchangeTimestamp: fridayClose / 1000,
      marketOpen: false,
      nowMs: monday,
    });
    expect(result.quality).toBe('cached');
  });

  it('is stale when the venue is open and nothing has arrived', () => {
    const result = make({
      tier: 'realtime',
      receivedAt: T0 - (GRACE_MS + 60_000),
      exchangeTimestamp: (T0 - (GRACE_MS + 60_000)) / 1000,
      nowMs: T0,
      marketOpen: true,
    });
    expect(result.quality).toBe('stale');
  });

  it('reports stale for an end-of-day source that has missed multiple daily updates', () => {
    expect(make({ tier: 'end-of-day', nowMs: T0 + 40 * 86_400_000 }).quality).toBe('stale');
  });

  it('never lets a synthetic value look live', () => {
    expect(make({ tier: 'demo' }).quality).toBe('demo');
  });

  it('computes feed latency from the vendor timestamps, not our clock', () => {
    const r = make({ exchangeTimestamp: (T0 - 45_000) / 1000 });
    expect(r.feedLatencyMs).toBe(45_000);
    expect(make({ exchangeTimestamp: null }).feedLatencyMs).toBeNull();
  });

  it('does not produce a negative latency for a clock skew', () => {
    const r = make({ exchangeTimestamp: (T0 + 5_000) / 1000 });
    expect(r.feedLatencyMs).toBe(0);
  });

  it('clamps age at zero for a future-dated receive time', () => {
    expect(make({ receivedAt: T0 + 10_000 }).ageMs).toBe(0);
  });
});
