import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentById } from '@/server/instruments';
import { finnhub } from '@/server/providers/finnhub';
import { fetchJson } from '@/server/http';
vi.mock('@/server/http', () => ({ fetchJson: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('Finnhub protocol fixtures — not live account verification', () => {
  it('keeps the key in an authentication header, not URL/query or result', async () => {
    vi.stubEnv('FINNHUB_API_KEY', 'fixture-key-only');
    vi.mocked(fetchJson).mockResolvedValue({ ok: true, data: { c: 100, pc: 99, t: 1790000000 }, receivedAt: Date.now() } as never);
    const response = await finnhub.getQuotes([instrumentById('equity:US:AAPL')!]);
    expect(response.ok).toBe(true);
    const [url, options] = vi.mocked(fetchJson).mock.calls[0];
    expect(url).not.toContain('fixture-key-only');
    expect(options?.headers).toEqual({ 'X-Finnhub-Token': 'fixture-key-only' });
    expect(JSON.stringify(response)).not.toContain('fixture-key-only');
  });
  for (const [status, reason] of [[401, 'no-key'], [403, 'unsupported'], [429, 'rate-limited']] as const) {
    it(`reports HTTP ${status} without simulating a quote`, async () => {
      vi.stubEnv('FINNHUB_API_KEY', 'fixture-key-only');
      vi.mocked(fetchJson).mockResolvedValue({ ok: false, error: { kind: status === 429 ? 'rate-limit' : 'http', status, message: 'fixture rejection', retryAfterMs: 1000 } } as never);
      expect(await finnhub.getQuotes([instrumentById('equity:US:AAPL')!])).toMatchObject({ ok: false, reason });
    });
  }
});
