import { getFxRates } from '@/server/providers/fx';
import { yahoo } from '@/server/providers/yahoo';
import { afterEach,expect,it,vi } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it('normalises EURUSD and GBPUSD without overwriting the USD base', async () => {
  vi.stubEnv('TOMTRADER_PUBLIC_FEEDS', '1');
  vi.spyOn(yahoo, 'getQuotes').mockResolvedValue({ ok: true, data: [
    ['EURUSD=X', 1.25], ['GBPUSD=X', 1.5], ['AUDUSD=X', 0.65], ['USDCNY=X', 7], ['USDJPY=X', 150],
  ].map(([symbol, last]) => ({ instrumentId: `currency:US:${symbol}`, last, exchangeTimestamp: 1780000000, tier: 'unverified' })) } as never);
  const result = await getFxRates();
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.data.quotes.USD).toBe(1);
  expect(result.data.quotes.EUR).toBeCloseTo(0.8);
  expect(result.data.quotes.GBP).toBeCloseTo(1 / 1.5);
  expect(result.data.quotes.CNY).toBe(7);
});
