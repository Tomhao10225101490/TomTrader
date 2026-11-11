import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { process.env.TOMTRADER_PUBLIC_FEEDS = '1'; });
vi.mock('@/server/http', () => ({ fetchJson: vi.fn(), raw: vi.fn() }));
import { fetchJson, raw } from '@/server/http';
import { instrumentById } from '@/server/instruments';
import { parseTencentHistory, tencent } from '@/server/providers/tencent';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const rows = [['2026-11-09', '100', '101', '102', '99', '20'], ['2026-11-10', '101', '102', '103', '100', '30']];

describe('Tencent history fallback', () => {
  it('normalizes valid CN lots but retains unknown HK/US volume as null', () => {
    const source = [['2026-11-09', '100'], rows[1], ['2026-11-09', '', '101', '102', '99', '10'], rows[0], rows[0], ['2026-02-30', 1, 1, 1, 1, 1]];
    const cn = parseTencentHistory(source, 'Asia/Shanghai', 100);
    expect(cn).toHaveLength(2);
    expect(cn[0].time).toBe(Date.parse('2026-11-08T16:00:00Z') / 1000);
    expect(cn[0].volume).toBe(2000);
    expect(parseTencentHistory(rows, 'Asia/Shanghai', 1)[0].volume).toBe(20); // STAR values are already shares.
    expect(parseTencentHistory(rows, 'America/New_York', null)[0].volume).toBeNull();
  });
  it('uses actual returned adjustment and does not manufacture intraday candles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T08:00:00Z'));
    vi.mocked(fetchJson).mockResolvedValue({ ok: true, data: { code: 0, data: { hk00700: { day: rows } } } } as never);
    const instrument = instrumentById('equity:HK:00700')!;
    const response = await tencent.getHistoricalBars(instrument, '1M', '1d');
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.message);
    expect(response.data.adjustment).toBe('raw');
    expect(response.data.meta.provider).toBe('tencent');
    expect(response.data.meta.tier).toBe('unverified');
    expect(response.data.bars[0].volume).toBeNull();
    expect(await tencent.getHistoricalBars(instrument, '1D', '5m')).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });
  it('resolves authoritative US listing suffixes instead of accepting the misleading unsuffixed history', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T08:00:00Z'));
    const fields = Array(51).fill('');
    fields[1] = 'Apple'; fields[2] = 'AAPL.OQ'; fields[3] = '102'; fields[4] = '101'; fields[30] = '20261110160000';
    vi.mocked(raw).mockResolvedValue({ ok: true, res: { status: 200, headers: new Headers(), body: `v_usAAPL="${fields.join('~')}";` } });
    vi.mocked(fetchJson).mockResolvedValue({ ok: true, data: { code: 0, data: { 'usAAPL.OQ': { qfqday: rows } } } } as never);
    const response = await tencent.getHistoricalBars(instrumentById('equity:US:AAPL')!, '1M', '1d');
    expect(response.ok).toBe(true);
    expect(fetchJson).toHaveBeenCalledWith(expect.stringContaining('usfqkline/get'), expect.objectContaining({ query: { param: 'usAAPL.OQ,day,,,40,qfq' } }));
    if (response.ok) expect(response.data.adjustment).toBe('dividend-adjusted');
  });
});
