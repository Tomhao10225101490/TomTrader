import { afterEach, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.TOMTRADER_DB = ':memory:';
  process.env.TOMTRADER_DEMO = '1';
  process.env.TOMTRADER_PUBLIC_FEEDS = '0';
});
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/detail/route';
import { persistMeta, put } from '@/server/cache';
import { demo } from '@/server/providers/demo';
import { getMetadata, resolveInstrument } from '@/server/service';
import { err } from '@/server/types';

afterEach(() => { vi.restoreAllMocks(); });

it('a stalled optional metadata source cannot block the quote/detail page and duplicate requests join one job', async () => {
  const id = 'equity:US:AAPL';
  const fixture = await demo.getMetadata(resolveInstrument(id)!);
  let finish!: (result: typeof fixture) => void;
  const stalled = new Promise<typeof fixture>((resolve) => { finish = resolve; });
  const spy = vi.spyOn(demo, 'getMetadata').mockReturnValue(stalled);
  try {
    const response = await GET(new NextRequest(`http://localhost/api/detail?id=${encodeURIComponent(id)}`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.instrument.id).toBe(id);
    expect(body.snapshot.quote.last).toBeGreaterThan(0);
    expect(body.metadata).toBeNull();
    expect(body.metadataIssue).toBe('refreshing');
    await getMetadata(id, { mode: 'stale' });
    expect(spy).toHaveBeenCalledTimes(1);
  } finally { finish(fixture); }
  const refreshed = await getMetadata(id);
  expect(refreshed.issue).toBeNull();
  expect(refreshed.meta?.instrumentId).toBe(id);
});

it('failed metadata keeps its timestamped cached value and backs off instead of creating a request loop', async () => {
  const id = 'equity:HK:00700';
  const fixture = await demo.getMetadata(resolveInstrument(id)!);
  if (!fixture.ok) throw new Error('Demo metadata fixture unavailable');
  persistMeta(fixture.data);
  put('meta', id, fixture.data, -1, 'demo');
  const spy = vi.spyOn(demo, 'getMetadata').mockResolvedValue(err('network', 'fixture outage, not a real network test'));
  const pending = await getMetadata(id, { mode: 'stale' });
  expect(pending.meta).toEqual(fixture.data);
  expect(pending.issue).toBe('refreshing');
  const failed = await getMetadata(id);
  expect(failed.meta).toEqual(fixture.data);
  expect(failed.issue).toBe('refresh-failed');
  await getMetadata(id, { mode: 'stale' });
  expect(spy).toHaveBeenCalledTimes(1);
});
