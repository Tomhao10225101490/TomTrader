import { mutationAllowed } from '@/app/api/_lib';
import { classifyFreshness } from '@/server/freshness';
import { instrumentById } from '@/server/instruments';
import { getMarketStatus,planDay,utcFromLocalDate } from '@/server/marketstatus';
import { parseFinnhubQuote } from '@/server/providers/finnhub';
import { convert } from '@/server/providers/fx';
import { describe,expect,it } from 'vitest';

describe('official calendar regressions', () => {
  it('does not confuse national public holidays with Xetra or Euronext closures', () => {
    expect(planDay('XETRA', '2026-05-14').closure).toBe('none');
    expect(planDay('XPAF', '2026-11-11').closure).toBe('none');
    expect(planDay('XETRA', '2026-12-24').closure).toBe('holiday');
    expect(planDay('XNYS', '2026-12-31').segments[0].earlyClose).toBe(false);
  });
  it('includes SSE spring festival extension and correct Mid-Autumn date', () => {
    expect(planDay('CNE', '2026-02-23').closure).toBe('holiday');
    expect(planDay('CNE', '2026-09-25').closure).toBe('holiday');
  });
  it('models Hong Kong extra Easter closure and half-day cancellation of afternoon session', () => {
    expect(planDay('HKEX', '2026-04-07').closure).toBe('holiday');
    expect(planDay('HKEX', '2026-10-19').closure).toBe('holiday');
    const plan = planDay('HKEX', '2026-12-24');
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].closeAt).toBe(Date.parse('2026-12-24T04:00:00Z'));
  });
  it('refuses to declare a market open beyond its verified calendar coverage', () => {
    const state = getMarketStatus('CNE', Date.parse('2027-02-08T02:00:00Z'));
    expect(state.state).toBe('unavailable');
    expect(state.nextOpenAt).toBeNull();
  });
  it('resolves viewer midnight with the correct offset direction and DST', () => {
    expect(utcFromLocalDate('Asia/Shanghai', '2026-11-08', 0)).toBe(Date.parse('2026-11-07T16:00:00Z'));
    expect(utcFromLocalDate('America/New_York', '2026-07-08', 0)).toBe(Date.parse('2026-07-08T04:00:00Z'));
    expect(utcFromLocalDate('America/New_York', '2026-11-08', 0)).toBe(Date.parse('2026-11-08T05:00:00Z'));
  });
});

describe('data integrity regressions', () => {
  it('rejects missing Finnhub values instead of interpreting zero as a price', () => {
    const i = instrumentById('equity:US:AAPL')!;
    expect(parseFinnhubQuote(i, { c: 0, t: 0 }, 'unverified')).toBeNull();
    const q = parseFinnhubQuote(i, { c: 200, t: 1780000000, dp: 0 }, 'unverified', 1780000001000)!;
    expect(q.exchangeTimestamp).toBe(1780000000);
    expect(q.receivedAt).toBe(1780000001000);
    expect(q.volume).toBeNull();
    expect(q.changePercent).toBe(0);
    expect(q.previousClose).toBeNull();
    expect(q.tier).toBe('unverified');
  });
  it('rejects corrupt FX rates and never combines currencies without conversion', () => {
    const fx = { base: 'USD' as const, quotes: { USD: 1, EUR: 0.8, CNY: 7 }, sourceAt: 1, receivedAt: 1, tier: 'end-of-day' as const, provider: 'fx-open.er-api' as const };
    expect(convert(100, 'EUR', 'CNY', fx)).toBe(875);
    expect(convert(100, 'EUR', 'USD', { ...fx, quotes: { EUR: Infinity, USD: 1 } })).toBeNull();
    expect(convert(100, 'USD', 'JPY', fx)).toBeNull();
  });
  it('labels very old closes stale even after a fresh receive', () => {
    const now = Date.parse('2026-11-08T00:00:00Z');
    expect(classifyFreshness({ tier: 'unverified', receivedAt: now, exchangeTimestamp: (now - 40 * 86400000) / 1000, marketOpen: false, nowMs: now }).quality).toBe('stale');
  });
  it('rejects cross-origin mutation requests', () => {
    expect(mutationAllowed(new Request('http://localhost:3100/api/portfolio', { headers: { origin: 'https://evil.example' } }))).toBe(false);
    expect(mutationAllowed(new Request('http://localhost:3100/api/portfolio', { headers: { origin: 'http://localhost:3100' } }))).toBe(true);
  });
});
