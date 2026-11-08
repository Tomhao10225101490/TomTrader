import { describe, expect, it } from 'vitest';
import { parseEastmoneyNumber, selectHistoryWindow } from '@/server/providers/eastmoney';
import { parseStamp } from '@/server/providers/tencent';
import { instrumentById } from '@/server/instruments';
import type { Bar } from '@/server/types';
const bar = (iso: string): Bar => ({ time: Date.parse(iso) / 1000, open: 100, high: 102, low: 99, close: 101, volume: 123 });

describe('free feed integrity', () => {
  it('does not turn vendor missing placeholders into a zero price', () => {
    for (const value of [undefined, null, '', '-', 'NaN', Infinity, {}]) expect(parseEastmoneyNumber(value)).toBeNull();
    expect(parseEastmoneyNumber(0)).toBe(0);
    expect(parseEastmoneyNumber('1453.00')).toBe(1453);
  });
  it('selects an actual calendar month, using exchange-local dates', () => {
    const rows = ['2026-10-07T16:00:00Z','2026-10-08T16:00:00Z','2026-11-05T16:00:00Z'].map(bar);
    const selected = selectHistoryWindow(rows, '1M', '1d', Date.parse('2026-11-08T02:00:00Z'), 'Asia/Shanghai');
    expect(selected).toEqual(rows); // Oct 8 midnight local is Oct 7 16:00 UTC.
    expect(selectHistoryWindow(rows, '1M', '1d', Date.parse('2026-11-09T02:00:00Z'), 'Asia/Shanghai')).toEqual(rows.slice(1));
  });
  it('clamps month ends rather than overflowing February into March', () => {
    const rows = ['2026-02-27T00:00:00Z','2026-02-28T00:00:00Z','2026-03-30T00:00:00Z'].map(bar);
    expect(selectHistoryWindow(rows, '1M', '1d', Date.parse('2026-03-31T12:00:00Z'))).toEqual(rows.slice(1));
  });
  it('keeps the latest trading session for 1D when the weekend has no bars', () => {
    const rows = ['2026-11-05T14:30:00Z','2026-11-06T14:30:00Z','2026-11-06T15:00:00Z'].map(bar);
    expect(selectHistoryWindow(rows, '1D', '5m', Date.parse('2026-11-08T12:00:00Z'), 'America/New_York')).toEqual(rows.slice(1));
  });
  it('parses slash-format Tencent timestamps independently of the host timezone', () => {
    const instrument = instrumentById('equity:US:AAPL')!;
    expect(parseStamp('2026/11/06 16:00:00', instrument)).toBe(Date.parse('2026-11-06T21:00:00Z') / 1000);
  });
});
