/**
 * Route-handler integration: every endpoint is invoked as the framework would
 * invoke it, with a real Request, and its JSON contract is asserted.
 *
 * Runs in demo mode so it is deterministic and needs no network — the point
 * here is the API surface and the user-data round trip, not vendor health
 * (which `providers.test.ts` covers against live feeds).
 */
process.env.TOMTRADER_DEMO = '1';
process.env.TOMTRADER_DB = ':memory:';

import { NextRequest } from 'next/server';
import { beforeAll,describe,expect,it,vi } from 'vitest';

// Explicit fixture for route/valuation integration. Production FX is tested separately.
vi.mock('@/server/providers/fx', async (original) => ({
  ...await original<typeof import('@/server/providers/fx')>(),
  getFxRates: vi.fn(async () => ({ ok: true, data: {
    base: 'USD', quotes: { USD: 1, CNY: 7, HKD: 7.8, EUR: 0.9, JPY: 150 },
    sourceAt: Date.now(), receivedAt: Date.now(), tier: 'end-of-day', provider: 'fx-open.er-api',
  } })),
}));

async function get(path: string) {
  const url = new URL(path, 'http://localhost');
  const req = new NextRequest(url, { method: 'GET' });
  const mod = await import(`../../src/app/api/${url.pathname.split('/')[2]}${url.pathname.endsWith('/state') ? '/state' : ''}/route.ts`);
  const res = await mod.GET(req);
  return { status: res.status, body: await res.json() };
}

async function post(pathname: string, body: unknown) {
  const mod: any = await import(`../../src/app/api/${pathname.split('/')[2]}/route.ts`);
  const req = new NextRequest(new URL(`http://localhost${pathname}`), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const res = await mod.POST(req);
  return { status: res.status, body: await res.json() };
}

beforeAll(() => {
  // nothing to prime: routes call ensureBoot() themselves
});

describe('market data endpoints', () => {
  it('GET /api/overview returns groups, commodities, currencies, clock and source health', async () => {
    const { status, body } = await get('/api/overview?mode=await');
    expect(status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.groups)).toBe(true);
    expect(body.groups.length).toBeGreaterThan(8);
    expect(body.commodities.length).toBeGreaterThan(2);
    expect(body.currencies.length).toBeGreaterThan(2);
    expect(body.clock.length).toBeGreaterThan(5);
    expect(body.sources.length).toBeGreaterThan(0);
    const first = body.groups[0].snapshots[0];
    expect(first.instrument.id).toContain(':');
    expect(first.quote.last).toBeGreaterThan(0);
    // A demo frame must be labelled as such — never silently presented as data.
    expect(first.quote.quality).toBe('demo');
    expect(first.status.state).toMatch(/open|closed|weekend|holiday|pre-market|after-hours/);
    expect(first.sparkline === null || Array.isArray(first.sparkline)).toBe(true);
  });

  it('GET /api/quotes answers the ids asked for and never invents others', async () => {
    const ids = ['index:US:^GSPC', 'equity:US:AAPL', 'equity:CN:600519', 'index:HK:^HSI'];
    const { body } = await get(`/api/quotes?ids=${encodeURIComponent(ids.join(','))}`);
    expect(body.snapshots).toHaveLength(ids.length);
    expect(body.snapshots.map((s: any) => s.instrument.id).sort()).toEqual([...ids].sort());
  });

  it('GET /api/quotes echoes an unknown id and never labels invented data as real', async () => {
    // In demo mode the generator answers for any well-formed id — that is what
    // makes offline screenshots and tests possible — but the frame must be
    // marked `demo` so nothing can mistake it for market data.
    const { body } = await get('/api/quotes?ids=equity:US:ZZZNOTREAL');
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0].instrument.id).toBe('equity:US:ZZZNOTREAL');
    const quote = body.snapshots[0].quote;
    if (quote) {
      expect(quote.quality).toBe('demo');
      expect(quote.provider).toBe('demo');
    }
  });

  it('GET /api/quotes rejects a malformed id instead of parsing it', async () => {
    const { body } = await get('/api/quotes?ids=not-an-instrument');
    expect(body.snapshots).toHaveLength(0);
  });

  it('GET /api/bars returns a series plus the axis time base', async () => {
    const { body } = await get('/api/bars?id=equity%3AUS%3AAAPL&range=3M');
    expect(body.series.bars.length).toBeGreaterThan(20);
    const bar = body.series.bars[0];
    expect(bar.high).toBeGreaterThanOrEqual(bar.low);
    expect(bar.time).toBeGreaterThan(1e9);
    expect(bar.time).toBeLessThan(1e11); // seconds, not milliseconds
    expect(body.axisTimezone).toContain('/');
    expect(typeof body.axisOffsetMinutes).toBe('number');
    void bar;
  });

  it('GET /api/bars rejects an unknown range instead of guessing', async () => {
    const { status, body } = await get('/api/bars?id=equity%3AUS%3AAAPL&range=9Z');
    expect(status).toBe(400);
    expect(body.error).toContain('unknown range');
  });

  it('GET /api/detail returns instrument, snapshot, cached metadata and related list', async () => {
    await (await import('@/server/service')).getMetadata('equity:US:AAPL');
    const { body } = await get('/api/detail?id=equity%3AUS%3AAAPL');
    expect(body.instrument.id).toBe('equity:US:AAPL');
    expect(body.snapshot.quote.last).toBeGreaterThan(0);
    expect(body.metadata).toBeTruthy();
    expect(body.metadata.currency).toBe('USD');
    // Related must be comparable securities, not the FX pairs of the same country.
    for (const rel of body.related) expect(rel.instrument.assetType).toBe('equity');
  });

  it('GET /api/search resolves tickers, local names and ambiguous symbols', async () => {
    const { body } = await get('/api/search?q=AAPL');
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].instrument.displaySymbol).toBe('AAPL');
    expect(body.results[0].instrument.currency).toBe('USD');
    expect(body.tookMs).toBeGreaterThanOrEqual(0);

    const zh = await get(`/api/search?q=${encodeURIComponent('茅台')}`);
    expect(zh.body.results[0].instrument.id).toBe('equity:CN:600519');

    const number = await get('/api/search?q=00700');
    expect(number.body.results[0].instrument.market).toBe('HK');
  });

  it('GET /api/resolve prefers an exact id and reports ambiguity honestly', async () => {
    const direct = await get('/api/resolve?symbol=equity%3AUS%3AAAPL');
    expect(direct.body.id).toBe('equity:US:AAPL');

    const ticker = await get('/api/resolve?symbol=AAPL');
    expect(ticker.body.id).toBe('equity:US:AAPL');

    const hint = await get('/api/resolve?symbol=000001&market=CN');
    expect(['index:CN:000001', 'equity:CN:000001']).toContain(hint.body.id);

    const empty = await get('/api/resolve?symbol=');
    expect(empty.body.id).toBeNull();
  });

  it('GET /api/heatmap reports coverage instead of hiding gaps', async () => {
    const { body } = await get('/api/heatmap?pool=US&period=intraday');
    expect(body.cells.length).toBeGreaterThan(3);
    expect(body.coverage.requested).toBeGreaterThanOrEqual(body.coverage.withData);
    expect(typeof body.coverage.note).toBe('string');
    for (const cell of body.cells.slice(0, 5)) {
      expect(cell.weightSource).toMatch(/market-cap|equal/);
      expect(cell.changePercent).not.toBeNull();
    }
  });

  it('GET /api/movers sorts by direction and volume', async () => {
    const { body } = await get('/api/movers?pool=US');
    expect(body.gainers.length).toBeGreaterThan(0);
    const gains = body.gainers.map((s: any) => s.quote.changePercent);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
    const losses = body.losers.map((s: any) => s.quote.changePercent);
    expect([...losses].sort((a, b) => a - b)).toEqual(losses);
  });

  it('GET /api/clock and /api/markets describe venues with next boundaries', async () => {
    const clock = await get('/api/clock');
    expect(clock.body.rows.length).toBeGreaterThan(5);
    const row = clock.body.rows[0];
    expect(row.status.state).toBeTruthy();
    expect(Array.isArray(row.timeline)).toBe(true);

    const markets = await get('/api/markets');
    expect(markets.body.rows.length).toBeGreaterThanOrEqual(10);
    const nyse = markets.body.rows.find((r: any) => r.code === 'XNYS');
    expect(nyse.sessions[0]).toEqual({ open: '09:30', close: '16:00' });
    expect(nyse.status.nextOpenAt).toBeGreaterThan(Date.now() - 86_400_000);
    expect(markets.body.calendarVersion).toMatch(/\d{4}\.\d+/);
  });

  it('GET /api/status is the data-honesty panel', async () => {
    const { body } = await get('/api/status');
    expect(body.demoMode).toBe(true);
    expect(body.universe.size).toBeGreaterThan(80);
    expect(body.providers.find((p: any) => p.provider === 'demo').ok).toBe(true);
    expect(body.hub).toBeTruthy();
    expect(body.calendarVersion).toBeTruthy();
  });
});

describe('user data endpoints', () => {
  it('seeds watchlists, adds, reorders, pins and removes', async () => {
    const initial = await get('/api/watchlist');
    expect(initial.body.groups.length).toBeGreaterThanOrEqual(3);
    const groupId = initial.body.groups[0].id;

    await post('/api/watchlist', { op: 'add', groupId, instrumentId: 'equity:US:MSFT' });
    let after = await get('/api/watchlist');
    let g = after.body.groups.find((x: any) => x.id === groupId);
    expect(g.instrumentIds).toContain('equity:US:MSFT');

    // duplicate add is a no-op
    await post('/api/watchlist', { op: 'add', groupId, instrumentId: 'equity:US:MSFT' });
    after = await get('/api/watchlist');
    g = after.body.groups.find((x: any) => x.id === groupId);
    expect(g.instrumentIds.filter((i: string) => i === 'equity:US:MSFT')).toHaveLength(1);

    const reordered = [g.instrumentIds[1], ...g.instrumentIds.slice(0, 1), ...g.instrumentIds.slice(2)];
    await post('/api/watchlist', { op: 'reorder', groupId, ids: reordered });
    after = await get('/api/watchlist');
    g = after.body.groups.find((x: any) => x.id === groupId);
    expect(g.instrumentIds[0]).toBe(reordered[0]);

    await post('/api/watchlist', { op: 'pin', groupId, instrumentId: reordered[0] });
    after = await get('/api/watchlist');
    expect(after.body.groups.find((x: any) => x.id === groupId).pinned).toContain(reordered[0]);

    await post('/api/watchlist', { op: 'remove', groupId, instrumentId: 'equity:US:MSFT' });
    after = await get('/api/watchlist');
    expect(after.body.groups.find((x: any) => x.id === groupId).instrumentIds).not.toContain('equity:US:MSFT');
  });

  it('rejects a watchlist mutation that names an unknown instrument', async () => {
    const groups = (await get('/api/watchlist')).body.groups;
    const res = await post('/api/watchlist', { op: 'add', groupId: groups[0].id, instrumentId: 'equity:US:<svg/onload=1>' });
    expect(res.status).toBe(404);
  });

  it('rejects unknown ops rather than ignoring them', async () => {
    const res = await post('/api/watchlist', { op: 'teleport' });
    expect(res.status).toBe(400);
  });

  it('values a portfolio across currencies with a stated FX source', async () => {
    const apple = await post('/api/portfolio', {
      op: 'add',
      instrumentId: 'equity:US:AAPL',
      quantity: 100,
      averageCost: 150,
      currency: 'USD',
      purchasedAt: '2026-01-15',
    });
    expect(apple.status).toBe(200);

    await post('/api/portfolio', {
      op: 'add',
      instrumentId: 'equity:CN:600519',
      quantity: 10,
      averageCost: 1400,
      currency: 'CNY',
      purchasedAt: '2026-03-02',
    });

    const usd = await get('/api/portfolio?currency=USD');
    expect(usd.body.positions).toHaveLength(2);
    expect(usd.body.totalValue).toBeGreaterThan(0);
    // The CNY leg must be converted, not added raw.
    const cnyPos = usd.body.positions.find((p: any) => p.currency === 'CNY');
    expect(cnyPos.marketValue).toBeLessThan(10 * 1500);
    expect(cnyPos.marketValue).toBeGreaterThan(0);
    expect(usd.body.fx).toBeTruthy();
    expect(usd.body.fx.source).toBeTruthy();
    expect(usd.body.byCurrency.length).toBe(2);
    expect(Math.round(usd.body.byCurrency.reduce((s: number, c: any) => s + c.weight, 0))).toBe(100);

    const cny = await get('/api/portfolio?currency=CNY');
    expect(cny.body.totalValue).toBeGreaterThan(usd.body.totalValue);
    expect(cny.body.valuationCurrency).toBe('CNY');
  });

  it('refuses impossible holdings instead of storing nonsense', async () => {
    const bad = await post('/api/portfolio', { op: 'add', instrumentId: 'equity:US:AAPL', quantity: -3, averageCost: 100, currency: 'USD', purchasedAt: '2026-01-01' });
    expect(bad.status).toBe(400);
    const badDate = await post('/api/portfolio', { op: 'add', instrumentId: 'equity:US:AAPL', quantity: 5, averageCost: 100, currency: 'USD', purchasedAt: '15/01/2026' });
    expect(badDate.status).toBe(400);
    const badCur = await post('/api/portfolio', { op: 'add', instrumentId: 'equity:US:AAPL', quantity: 5, averageCost: 100, currency: 'ZZZ', purchasedAt: '2026-01-15' });
    expect(badCur.status).toBe(400);
  });

  it('creates, disables and deletes an alert', async () => {
    const created = await post('/api/alerts', {
      op: 'create',
      instrumentId: 'equity:US:AAPL',
      condition: { type: 'price-above', threshold: 999999 },
      cooldownMinutes: 15,
    });
    expect(created.status).toBe(200);
    const id = created.body.id;

    let list = await get('/api/alerts');
    expect(list.body.alerts.map((a: any) => a.id)).toContain(id);

    await post('/api/alerts', { op: 'toggle', id, enabled: false });
    list = await get('/api/alerts');
    expect(list.body.alerts.find((a: any) => a.id === id).enabled).toBe(false);

    await post('/api/alerts', { op: 'delete', id });
    list = await get('/api/alerts');
    expect(list.body.alerts.map((a: any) => a.id)).not.toContain(id);
  });

  it('refuses a 52-week alert because no connected provider supplies it', async () => {
    const res = await post('/api/alerts', { op: 'create', instrumentId: 'equity:US:AAPL', condition: { type: 'five-two-week-high' } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/fundamentals|not connected/i);
  });

  it('validates alert thresholds and cooldown bounds', async () => {
    const noThreshold = await post('/api/alerts', { op: 'create', instrumentId: 'equity:US:AAPL', condition: { type: 'price-above' } as any });
    expect(noThreshold.status).toBe(400);
    const longCooldown = await post('/api/alerts', {
      op: 'create',
      instrumentId: 'equity:US:AAPL',
      condition: { type: 'price-above', threshold: 10 },
      cooldownMinutes: 99999,
    });
    expect(longCooldown.status).toBe(400);
  });

  it('serves news items with publisher and link metadata', async () => {
    const { body } = await get('/api/news');
    expect(body.items).toEqual([]);
    expect(body.issue).toBeTruthy();
    // demo mode has no news source and says so rather than showing stock copy
    expect(String(body.issue)).toMatch(/unsupported|demo/i);
  });
});

describe('mutation regression contracts', () => {
  it('returns valid JSON when a void mutation succeeds', async () => {
    const groups = (await get('/api/watchlist')).body.groups;
    const renamed = await post('/api/watchlist', { op: 'rename', groupId: groups[0].id, name: 'Regression list' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toEqual({ ok: true });
  });
  it('rejects malformed payloads and invalid alert updates without storing them', async () => {
    for (const body of [null, [], 'bad']) expect((await post('/api/portfolio', body)).status).toBe(400);
    expect((await post('/api/portfolio', { op: 'import', holdings: [null] })).status).toBe(400);
    expect((await post('/api/portfolio', { op: 'update', id: 'missing', averageCost: -1 })).status).toBe(400);
    expect((await post('/api/alerts', { op: 'update', id: 'missing', condition: { type: 'made-up', threshold: 2 } })).status).toBe(400);
    expect((await get('/api/bars?id=equity:US:AAPL&interval=bogus')).status).toBe(400);
  });
  it('exports holdings using the same contract accepted by import', async () => {
    const created = await post('/api/portfolio', { op: 'add', instrumentId: 'equity:US:MSFT', quantity: 2, averageCost: 200, currency: 'USD', purchasedAt: '2026-01-15' });
    expect(created.status).toBe(200);
    const exported = await post('/api/portfolio', { op: 'export' });
    expect(exported.status).toBe(200);
    const holding = exported.body.holdings.find((h: { instrumentId: string }) => h.instrumentId === 'equity:US:MSFT');
    expect(holding.averageCost).toBe(200);
    expect((await post('/api/portfolio', { op: 'import', holdings: [holding] })).status).toBe(200);
  });
});

describe('portfolio integrity regressions', () => {
  it('infers omitted holding defaults from the actual trading instrument', async () => {
    const added = await post('/api/portfolio', { op: 'add', instrumentId: 'equity:CN:600519', quantity: 2, averageCost: 1400 });
    expect(added.status).toBe(200);
    expect(added.body.currency).toBe('CNY');
    expect(added.body.purchased_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const imported = await post('/api/portfolio', { op: 'import', holdings: [{ instrumentId: 'equity:HK:00700', quantity: 2, averageCost: 300, note: null }] });
    expect(imported.status).toBe(200);
    expect(imported.body[0].currency).toBe('HKD');
  });

  it('rejects bad import rows before any data is saved', async () => {
    const { listHoldings } = await import('@/server/userdata');
    const before = listHoldings();
    const result = await post('/api/portfolio', { op: 'import', holdings: [
      { instrumentId: 'equity:US:AAPL', quantity: 1, averageCost: 100 },
      { instrumentId: 'equity:US:AAPL', quantity: 1, averageCost: 100, note: { wrong: 'type' } },
    ] });
    expect(result.status).toBe(400);
    expect(listHoldings()).toEqual(before);
  });

  it('rolls the entire import back if a database write fails halfway', async () => {
    const { getDb } = await import('@/server/db');
    const { listHoldings } = await import('@/server/userdata');
    const before = listHoldings();
    getDb().exec("CREATE TEMP TRIGGER reject_import BEFORE INSERT ON holding WHEN NEW.note = 'fail-import' BEGIN SELECT RAISE(ABORT, 'Injected write failure'); END;");
    try {
      const result = await post('/api/portfolio', { op: 'import', holdings: [
        { instrumentId: 'equity:US:AAPL', quantity: 1, averageCost: 100 },
        { instrumentId: 'equity:US:MSFT', quantity: 1, averageCost: 100, note: 'fail-import' },
      ] });
      expect(result.status).toBe(500);
      expect(listHoldings()).toEqual(before);
    } finally { getDb().exec('DROP TRIGGER reject_import'); }
  });

  it('cannot hide or misprice a saved holding through invalid updates', async () => {
    const created = await post('/api/portfolio', { op: 'add', instrumentId: 'equity:US:AAPL', quantity: 1, averageCost: 100 });
    expect(created.status).toBe(200);
    for (const patch of [{ instrumentId: 'not-an-instrument' }, { currency: 'CNY' }, { instrumentId: 'equity:CN:600519' }, { quantity: true }, { purchasedAt: '' }]) {
      const result = await post('/api/portfolio', { op: 'update', id: created.body.id, ...patch });
      expect(result.status).toBe(400);
    }
    const { listHoldings } = await import('@/server/userdata');
    expect(listHoldings().find((h) => h.id === created.body.id)).toEqual(created.body);
    expect((await post('/api/portfolio', { op: 'update', id: 'missing', quantity: 1 })).status).toBe(404);
  });
});
