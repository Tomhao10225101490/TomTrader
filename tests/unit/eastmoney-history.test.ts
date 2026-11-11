import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { process.env.TOMTRADER_PUBLIC_FEEDS = '1'; });
vi.mock('@/server/http', () => ({ fetchJson: vi.fn() }));
import { fetchJson } from '@/server/http';
import { instrumentById } from '@/server/instruments';
import { eastmoney } from '@/server/providers/eastmoney';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('Eastmoney historical payload integrity', () => {
  it.each(['1m', '1d'] as const)('rejects missing OHLC and orders/deduplicates actual payload rows (%s)', async (interval) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T02:00:00Z'));
    const stamps = interval === '1m' ? ['2026-11-11 09:31', '2026-11-11 09:32', '2026-11-11 09:33'] : ['2026-11-09', '2026-11-10', '2026-11-11'];
    const rows = [
      `${stamps[2]},101,102,103,100,-`,
      `${stamps[0]},100,101,102,99,2`,
      `${stamps[1]},,,,,-`, // missing OHLC must never become a 0-price candle
      `${stamps[1]},100,-,102,99,3`,
      `${stamps[0]},100,101,102,99,2`, // duplicate instant must not reach the chart
    ];
    vi.mocked(fetchJson).mockResolvedValue({ ok: true, data: { data: interval === '1m' ? { trends: rows } : { klines: rows } } } as never);
    const result = await eastmoney.getHistoricalBars(instrumentById('equity:CN:600519')!, interval === '1m' ? '1D' : '1M', interval);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.data.bars).toHaveLength(2);
    expect(result.data.bars[0].time).toBeLessThan(result.data.bars[1].time);
    expect(result.data.bars[0].volume).toBe(200);
    expect(result.data.bars[1].volume).toBeNull();
    expect(result.data.meta.lastBarAt).toBe(result.data.bars[1].time);
  });
});
