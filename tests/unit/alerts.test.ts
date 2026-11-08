import { evaluateAlert } from '@/server/service';
import type { PriceAlert,Quote } from '@/server/types';
import type { QuoteSnapshot } from '@/shared/api';
import { describe,expect,it } from 'vitest';

const T0 = Date.parse('2026-11-06T15:00:00Z');

function alert(condition: PriceAlert['condition'], over: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: 'a1',
    instrumentId: 'equity:US:AAPL',
    condition,
    enabled: true,
    createdAt: T0 - 86_400_000,
    lastTriggeredAt: null,
    triggeredCount: 0,
    cooldownMinutes: 30,
    armed: true,
    ...over,
  };
}

function snap(price: number, changePercent: number | null = null): QuoteSnapshot {
  const quote: Quote = {
    instrumentId: 'equity:US:AAPL',
    last: price,
    previousClose: 100,
    change: price - 100,
    changePercent,
    dayHigh: price,
    dayLow: price,
    open: price,
    volume: 1,
    exchangeTimestamp: T0 / 1000,
    receivedAt: T0,
    tier: 'unverified',
    quality: 'delayed',
    provider: 'yahoo',
    session: 'regular',
    currency: 'USD',
  };
  return {
    instrument: {
      id: 'equity:US:AAPL',
      displaySymbol: 'AAPL',
      vendorSymbol: 'AAPL',
      name: 'Apple',
      nameZh: null,
      assetType: 'equity',
      market: 'US',
      exchange: 'XNAS',
      currency: 'USD',
    },
    quote,
    status: { exchange: 'XNAS', state: 'open', nextOpenAt: null, nextCloseAt: null, nextEventLabel: null, isHalfDay: false, reason: null, sessionSource: 'calendar' },
  };
}

describe('price alerts', () => {
  it('fires when the level is crossed', () => {
    expect(evaluateAlert(alert({ type: 'price-above', threshold: 200 }), snap(201), T0).fired).toBe(true);
    expect(evaluateAlert(alert({ type: 'price-above', threshold: 200 }), snap(199), T0).fired).toBe(false);
    expect(evaluateAlert(alert({ type: 'price-below', threshold: 100 }), snap(99.5), T0).fired).toBe(true);
    // boundary counts as crossed
    expect(evaluateAlert(alert({ type: 'price-above', threshold: 200 }), snap(200), T0).fired).toBe(true);
  });

  it('describes the trigger with numbers a user can check', () => {
    const r = evaluateAlert(alert({ type: 'price-above', threshold: 200 }), snap(201.5), T0);
    expect(r.detail).toContain('AAPL');
    expect(r.detail).toContain('201.50');
    expect(r.detail).toContain('200.00');
  });

  it('respects the enabled flag', () => {
    const r = evaluateAlert(alert({ type: 'price-above', threshold: 1 }, { enabled: false }), snap(100), T0);
    expect(r).toMatchObject({ fired: false, skippedReason: 'disabled' });
  });

  it('will not fire on a missing price', () => {
    const s = snap(100);
    s.quote = null;
    const r = evaluateAlert(alert({ type: 'price-above', threshold: 1 }), s, T0);
    expect(r.skippedReason).toBe('no-data');
  });

  it('arms and disarms so a hovering price fires once', () => {
    const crossed = evaluateAlert(alert({ type: 'price-above', threshold: 200 }), snap(201), T0);
    expect(crossed.fired).toBe(true);
    // still crossed, but disarmed by the previous fire: must not repeat
    const stillCrossed = evaluateAlert(alert({ type: 'price-above', threshold: 200 }, { armed: false }), snap(201), T0);
    expect(stillCrossed.fired).toBe(false);
    expect(stillCrossed.skippedReason).toBe('not-armed');
    // back below the level → re-arm condition met (the caller flips armed back on)
    const fell = evaluateAlert(alert({ type: 'price-above', threshold: 200 }, { armed: false }), snap(198), T0);
    expect(fell.skippedReason).toBe('not-armed');
  });

  it('applies the cooldown even when armed', () => {
    const recently = evaluateAlert(
      alert({ type: 'price-above', threshold: 200 }, { lastTriggeredAt: T0 - 60_000, cooldownMinutes: 30 }),
      snap(201),
      T0,
    );
    expect(recently.skippedReason).toBe('cooldown');
    expect(recently.fired).toBe(false);
    const expired = evaluateAlert(
      alert({ type: 'price-above', threshold: 200 }, { lastTriggeredAt: T0 - 31 * 60_000, cooldownMinutes: 30 }),
      snap(201),
      T0,
    );
    expect(expired.fired).toBe(true);
  });

  it('handles daily change conditions with the right sign', () => {
    expect(evaluateAlert(alert({ type: 'change-percent-above', threshold: 3 }), snap(101, 4.2), T0).fired).toBe(true);
    expect(evaluateAlert(alert({ type: 'change-percent-above', threshold: 3 }), snap(101, 2.9), T0).fired).toBe(false);
    expect(evaluateAlert(alert({ type: 'change-percent-below', threshold: 3 }), snap(99, -4.2), T0).fired).toBe(true);
    expect(evaluateAlert(alert({ type: 'change-percent-below', threshold: 3 }), snap(101, 4.2), T0).fired).toBe(false);
  });

  it('refuses 52-week conditions instead of faking them', () => {
    const high = evaluateAlert(alert({ type: 'five-two-week-high' }), snap(101, 1), T0);
    expect(high.fired).toBe(false);
    expect(high.skippedReason).toBe('no-data');
  });

  it('crosses threshold through the exported predicate consistently', async () => {
    const { crossesThreshold } = await import('@/server/service');
    const a = alert({ type: 'price-below', threshold: 150 });
    expect(crossesThreshold(a, snap(149).quote!)).toBe(true);
    expect(crossesThreshold(a, snap(151).quote!)).toBe(false);
  });
});
