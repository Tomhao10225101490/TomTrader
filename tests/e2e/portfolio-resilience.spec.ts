import { expect, test } from '@playwright/test';
import type { PortfolioSummary, QuoteSnapshot } from '../../src/shared/api';

test('portfolio import handles null JSON and prevents duplicate submissions', async ({ page, request }) => {
  const before = await (await request.post('/api/portfolio', { data: { op: 'export' } })).json();
  await page.goto('/portfolio');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').fill('null');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toContainText('no holdings array');
  let writes = 0;
  let finish: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  await page.route('**/api/portfolio', async (route) => {
    if (route.request().postDataJSON()?.op !== 'import') return route.continue();
    writes++;
    await waiting;
    await route.fulfill({ status: 500, json: { error: 'Injected import failure; nothing saved' } });
  });
  await dialog.locator('textarea').fill(JSON.stringify({ holdings: [{ instrumentId: 'equity:US:AAPL', quantity: 1, averageCost: 100 }] }));
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(writes).toBe(1);
  finish!();
  await expect(dialog).toContainText('Injected import failure');
  const after = await (await request.post('/api/portfolio', { data: { op: 'export' } })).json();
  expect(after.holdings).toEqual(before.holdings);
});

test('portfolio keeps quote and value consistent and applies the final throttled update', async ({ page, request }) => {
  const created = await (await request.post('/api/portfolio', { data: { op: 'add', instrumentId: 'equity:US:AAPL', quantity: 10, averageCost: 80 } })).json();
  try {
    const original: PortfolioSummary = await (await request.get('/api/portfolio?currency=USD')).json();
    const position = original.positions.find((p) => p.id === created.id)!;
    expect(position.quote?.quote).toBeTruthy();
    const initialReceivedAt = Date.now();
    const snap = (last: number, offset: number): QuoteSnapshot => ({ ...position.quote!, quote: {
      ...position.quote!.quote!, last, receivedAt: initialReceivedAt + offset, exchangeTimestamp: null,
    } });
    let calls = 0;
    await page.route('**/api/portfolio?currency=USD', async (route) => {
      calls++;
      const price = calls === 1 ? 100 : calls === 2 ? 200 : 300;
      await route.fulfill({ json: { ...original, positions: [{ ...position, quote: snap(price, price), marketValue: price * 10, unrealizedPnl: (price - 80) * 10 }], totalValue: price * 10, totalCost: 800, totalPnl: (price - 80) * 10 } });
    });
    await page.addInitScript(() => {
      const streams: { onmessage: ((event: { data: string }) => void) | null }[] = [];
      class TestEventSource {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() { streams.push(this); setTimeout(() => this.onopen?.(), 0); }
        close() { this.onmessage = null; }
      }
      Object.defineProperty(window, 'EventSource', { value: TestEventSource });
      Object.defineProperty(window, 'emitPortfolioQuote', { value: (snapshot: unknown) => {
        for (const stream of streams) stream.onmessage?.({ data: JSON.stringify({ type: 'quotes', quotes: [snapshot], at: Date.now() }) });
      } });
    });
    await page.clock.install();
    await page.goto('/portfolio');
    const row = page.locator('main table tbody tr').filter({ hasText: 'AAPL' });
    await expect(row.locator('td').nth(3)).toContainText('100.00');
    const emit = async (snapshot: QuoteSnapshot) => page.evaluate((s) => {
      (window as unknown as { emitPortfolioQuote: (s: unknown) => void }).emitPortfolioQuote(s);
    }, snapshot);
    await emit(snap(200, 201));
    await expect(row.locator('td').nth(3)).toContainText('200.00');
    expect(calls).toBe(2);
    await emit(snap(300, 301));
    await expect(row.locator('td').nth(3)).toContainText('200.00');
    await expect(row.locator('td').nth(4)).toContainText('2,000.00');
    await page.clock.fastForward(20_001);
    await expect(row.locator('td').nth(3)).toContainText('300.00');
    await expect(row.locator('td').nth(4)).toContainText('3,000.00');
    expect(calls).toBe(3);
  } finally { await request.post('/api/portfolio', { data: { op: 'remove', id: created.id } }); }
});

test('failed holding deletion preserves the row and explains the failure', async ({ page, request }) => {
  const created = await (await request.post('/api/portfolio', { data: { op: 'add', instrumentId: 'equity:US:MSFT', quantity: 1, averageCost: 100 } })).json();
  try {
    await page.goto('/portfolio');
    const row = page.locator('main table tbody tr').filter({ hasText: 'MSFT' });
    await expect(row).toBeVisible();
    await page.route('**/api/portfolio', async (route) => {
      if (route.request().postDataJSON()?.op !== 'remove') return route.continue();
      await route.fulfill({ status: 500, json: { error: 'Injected delete failure; holding preserved' } });
    });
    await row.getByRole('button', { name: 'Remove holding', exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toContainText('Injected delete failure');
    await expect(row).toBeVisible();
    const exported = await (await request.post('/api/portfolio', { data: { op: 'export' } })).json();
    expect(exported.holdings.some((h: { id: string }) => h.id === created.id)).toBe(true);
  } finally { await request.post('/api/portfolio', { data: { op: 'remove', id: created.id } }); }
});
