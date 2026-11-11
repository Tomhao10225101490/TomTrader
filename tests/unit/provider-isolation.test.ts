import { expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.TOMTRADER_DB = ':memory:';
  process.env.TOMTRADER_DEMO = '0';
  process.env.TOMTRADER_PUBLIC_FEEDS = '1';
});
import { demo } from '@/server/providers/demo';
import { eastmoney } from '@/server/providers/eastmoney';
import { tencent } from '@/server/providers/tencent';
import { getBars, refreshQuotes, resolveInstrument } from '@/server/service';
import { err, ok } from '@/server/types';

it('a history-host network outage falls back without disabling working quote requests', async () => {
  const instrument = resolveInstrument('equity:CN:600519')!;
  // Explicit synthetic protocol fixtures; this test makes no external requests.
  const quotes = await demo.getQuotes([instrument]);
  const history = await demo.getHistoricalBars(instrument, '1M', '1d');
  if (!quotes.ok || !history.ok) throw new Error('fixture unavailable');
  const quoteSpy = vi.spyOn(eastmoney, 'getQuotes').mockResolvedValue(ok(quotes.data.map((q) => ({ ...q, provider: 'eastmoney', tier: 'unverified' }))));
  vi.spyOn(eastmoney, 'getHistoricalBars').mockResolvedValue(err('network', 'fixture history-host socket outage'));
  vi.spyOn(tencent, 'getHistoricalBars').mockResolvedValue(ok({ ...history.data, meta: { ...history.data.meta, provider: 'tencent', tier: 'unverified' } }));
  try {
    const bars = await getBars(instrument.id, '1M', '1d', { await: true });
    expect(bars.bars?.meta.provider).toBe('tencent');
    const current = await refreshQuotes([instrument.id]);
    expect(quoteSpy).toHaveBeenCalledTimes(1);
    expect(current.quotes.get(instrument.id)?.provider).toBe('eastmoney');
  } finally { vi.restoreAllMocks(); }
});
