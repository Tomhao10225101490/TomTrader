import { expect,test,type Page } from '@playwright/test';

/**
 * The acceptance checklist, as user journeys.
 *
 * Structural assertions only: a price cell must hold either a parsed number or
 * an explicit "Unavailable" — never merely non-empty text — so the suite cannot
 * be satisfied by a page full of placeholders, and cannot fail because of what
 * the market did overnight.
 */

const PRICE_OR_EXPLICIT = /^[+−\-\d.,\s¥$€£₩]*$|Unavailable|—$/;

async function expectPriceOrUnavailable(locator: ReturnType<Page['locator']>, label: string) {
  const text = (await locator.first().innerText()).trim();
  expect(text.length, `${label}: empty price cell`).toBeGreaterThan(0);
  const ok = PRICE_OR_EXPLICIT.test(text) || /Unavailable|—/i.test(text);
  expect(ok, `${label}: "${text}" is neither a price nor an explicit unavailable`).toBe(true);
}

async function waitForBoard(page: Page) {
  await expect(page.locator('[data-index-card]').first()).toBeVisible({ timeout: 60_000 });
}

test.describe('market overview', () => {
  test('opens the global overview with real index rows, states and sources', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Global Market Overview/i })).toBeVisible();
    await waitForBoard(page);
    expect(await page.locator('[data-index-card]').count()).toBeGreaterThanOrEqual(10);

    // Every visible row states a venue status and a freshness label.
    const first = page.locator('[data-index-card]').first();
    await expect(first.locator('[data-market-state]').first()).toBeVisible();
    await expect(first.locator('[data-quality]').first()).toBeVisible();
    await expectPriceOrUnavailable(first.locator('[data-price]'), 'first index row');

    // The freshness vocabulary is one of the documented values.
    const quality = await first.locator('[data-quality]').first().getAttribute('data-quality');
    expect(['realtime', 'delayed', 'end-of-day', 'cached', 'stale', 'unavailable', 'demo']).toContain(quality);
  });

  test('states are answers, not decoration', async ({ page }) => {
    await page.goto('/');
    await waitForBoard(page);
    const states = page.locator('[data-market-state]');
    expect(await states.count()).toBeGreaterThan(5);
    const text = await states.first().innerText();
    expect(text).toMatch(/Market Open|Pre-Market|After-Hours|Closed|Holiday|Weekend|Data Unavailable/i);
  });

  test('the three panels load independently', async ({ page }) => {
    await page.goto('/');
    await waitForBoard(page);
    // Movers and the heatmap are separate requests; both must arrive on their own.
    await expect(page.getByText(/Top gainers/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-heatmap-tile]').first()).toBeVisible({ timeout: 60_000 });
  });

  test('global market clock renders lanes with a next open', async ({ page }) => {
    await page.goto('/clock');
    await expect(page.getByText(/Global Market Clock/i).first()).toBeVisible();
    const lanes = page.locator('[data-clock-lane]');
    await expect(lanes.first()).toBeVisible({ timeout: 30_000 });
    expect(await lanes.count()).toBeGreaterThanOrEqual(6);
    await expect(lanes.first()).toContainText(/Market Open|Closed|Pre-Market|After-Hours|Weekend|Holiday/i);
  });
});

test.describe('search and detail', () => {
  test('Ctrl-K finds AAPL with venue metadata and opens a real chart', async ({ page }) => {
    await page.goto('/');
    // The palette mounts with the hydrated shell; wait for data before typing.
    await waitForBoard(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.locator('input').fill('AAPL');

    const firstRow = dialog.locator('[data-search-row]').first();
    await expect(firstRow).toBeVisible({ timeout: 45_000 });
    await expect(firstRow).toContainText('AAPL');
    await expect(firstRow).toContainText('USD');
    await firstRow.click();

    await expect(page).toHaveURL(/\/stocks\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Apple|苹果/);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    const box = await canvas.boundingBox();
    expect(box && box.width > 200, 'chart canvas has a real size').toBeTruthy();
  });

  test('the chart axis and legend agree with the venue time zone', async ({ page }) => {
    await page.goto('/stocks/equity%3AUS%3AAAPL');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Axis in .*local time/i)).toBeVisible();
    // The crosshair legend must show O/H/L/C, not just a last price.
    await expect(page.getByText(/^O$/).first()).toBeVisible();
  });

  test('switching ranges and chart types re-renders without losing the chart', async ({ page }) => {
    await page.goto('/stocks/equity%3AUS%3AAAPL');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
    for (const range of ['1D', '5D', '1M', '1Y']) {
      await page.getByRole('button', { name: range, exact: true }).click();
      await expect(page.locator('canvas').first()).toBeVisible();
    }
    const group = page.getByRole('radiogroup', { name: /chart type/i });
    for (const kind of ['Candles', 'Area', 'Line']) {
      await group.getByRole('radio', { name: kind }).click();
      await expect(page.locator('canvas').first()).toBeVisible();
    }
  });

  test('an unknown identifier says so instead of rendering an empty page', async ({ page }) => {
    await page.goto('/stocks/equity%3AUS%3ANOSUCHSECURITY');
    await expect(page.getByText(/Not found|Something went wrong|No market data/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('main')).not.toBeEmpty();
  });
});

test.describe('watchlist', () => {
  test('adds a symbol, keeps it across a reload and removes it', async ({ page }) => {
    await page.goto('/watchlist');
    await expect(page.getByRole('heading', { level: 1, name: /Watchlist/i })).toBeVisible();
    await expect(page.locator('[data-testid="watchlist-table"]')).toBeVisible({ timeout: 45_000 });

    await page.getByRole('button', { name: /Add symbol/i }).first().click();
    const picker = page.locator('[data-testid="symbol-picker"]');
    await picker.locator('input').first().fill('NVDA');
    const row = picker.locator('[data-picker-row]').first();
    await expect(row).toBeVisible({ timeout: 45_000 });
    await row.click();

    const table = page.locator('[data-testid="watchlist-table"]');
    await expect(table).toContainText('NVDA');

    await page.reload();
    await expect(page.locator('[data-testid="watchlist-table"]')).toContainText('NVDA', { timeout: 45_000 });

    await table.locator('tbody tr').filter({ hasText: 'NVDA' }).getByRole('button', { name: /Remove from list/i }).click();
    await expect(page.locator('[data-testid="watchlist-table"]')).not.toContainText('NVDA', { timeout: 30_000 });
  });

  test('creates a new list and switches to it', async ({ page }) => {
    await page.goto('/watchlist');
    await page.getByRole('button', { name: /New list/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('input').first().fill('Semis');
    await modal.getByRole('button', { name: /Save/i }).click();
    await expect(page.locator('main').getByRole('button', { name: /Semis/ })).toBeVisible({ timeout: 20_000 });
    await page.locator('main').getByRole('button', { name: /Semis/ }).click();
    await expect(page.locator('main').getByText(/This list is empty/i)).toBeVisible();
    // clean up (the confirm handler must exist before the click)
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: /Delete list/i }).click();
    await expect(page.locator('main').getByRole('button', { name: /Semis/ })).toHaveCount(0, { timeout: 20_000 });
  });
});

test.describe('personalisation', () => {
  test('theme, language and price convention persist across a reload', async ({ page }) => {
    await page.goto('/settings');
    const html = page.locator('html');

    await page.getByRole('radio', { name: /^Dark$/ }).click();
    await expect(html).toHaveClass(/dark/);

    await page.getByRole('radio', { name: '简体中文' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('设置');
    await expect(html).toHaveAttribute('lang', 'zh-CN');

    await page.getByRole('radio', { name: /红涨绿跌/ }).click();
    await expect(html).toHaveAttribute('data-price-convention', 'cn');

    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await expect(html).toHaveAttribute('lang', 'zh-CN');
    await expect(html).toHaveAttribute('data-price-convention', 'cn');

    // restore for the remaining tests
    await page.getByRole('radio', { name: 'English' }).click();
    await page.getByRole('radio', { name: /Green up/ }).click();
    await page.getByRole('radio', { name: /^Light$/ }).click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test('the data panel names its providers, tiers and cache state', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/Provider status|数据源状态/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Yahoo Finance/i)).toBeVisible();
    await expect(page.getByText(/Eastmoney/i)).toBeVisible();
    await expect(page.getByText(/Declared tier/i).first()).toBeVisible();
    await expect(page.getByText(/documented|undocumented/i).first()).toBeVisible();
  });
});

test.describe('heatmap, portfolio, alerts, news', () => {
  test('heatmap shows sized, coloured tiles and states its coverage', async ({ page }) => {
    await page.goto('/heatmap');
    const tiles = page.locator('[data-heatmap-tile]');
    await expect(tiles.first()).toBeVisible({ timeout: 90_000 });
    expect(await tiles.count()).toBeGreaterThan(5);
    await expect(page.getByText(/Coverage:/i)).toBeVisible();
    const text = await tiles.first().innerText();
    expect(text).toMatch(/\d+(\.\d+)?%/);
  });

  test('portfolio: add a holding, see valuation policy, then remove it', async ({ page }) => {
    await page.goto('/portfolio');
    await page.getByRole('button', { name: /Add holding/i }).first().click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: /Search instruments/i }).click();
    const picker = page.locator('[data-testid="symbol-picker"]');
    await picker.locator('input').first().fill('AAPL');
    await picker.locator('[data-picker-row]').first().click();
    await modal.locator('[data-field="quantity"]').fill('100');
    await modal.locator('[data-field="averageCost"]').fill('150');
    await modal.getByRole('button', { name: /^Save$/ }).click();

    await expect(page.getByText(/Total value/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-testid="portfolio-table"]')).toContainText('AAPL');
    await expect(page.getByRole('link', { name: 'Rates By Exchange Rate API' })).toBeVisible();

    await page.locator('[data-testid="portfolio-table"]').getByRole('button', { name: /Remove holding/i }).first().click();
    await expect(page.locator('[data-testid="portfolio-table"] tbody tr').filter({ hasText: 'AAPL' })).toHaveCount(0);
  });

  test('alerts: a live threshold fires and lands in the trigger log', async ({ page }) => {
    await page.goto('/alerts');
    await page.getByRole('button', { name: /New alert/i }).first().click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: /Search instruments/i }).click();
    const picker = page.locator('[data-testid="symbol-picker"]');
    await picker.locator('input').first().fill('SPY');
    await picker.locator('[data-picker-row]').first().click();

    // Always true for a listed security: the evaluator must fire on the next tick.
    await modal.locator('[data-field="threshold"]').fill('0.01');
    await modal.locator('[data-field="cooldown"]').fill('0');
    await modal.getByRole('button', { name: /^Save$/ }).click();

    await expect(page.locator('[data-testid="alert-row"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('[data-testid="alert-event"]')).toBeVisible({ timeout: 90_000 });

    await page.getByRole('button', { name: /Delete alert/i }).first().click();
    await expect(page.locator('[data-testid="alert-row"]')).toHaveCount(0);
  });

  test('a 52-week alert is refused because no fundamentals feed is connected', async ({ page }) => {
    await page.goto('/alerts');
    const res = await page.request.post('/api/alerts', {
      data: { op: 'create', instrumentId: 'equity:US:AAPL', condition: { type: 'five-two-week-high' } },
    });
    expect(res.status()).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/fundamentals|not connected/i);
  });

  test('news shows source-backed headlines or an explicit offline state', async ({ page }) => {
    await page.goto('/news');
    const items = page.locator('[data-news-item]');
    const status = await (await page.request.get('/api/status')).json();
    if (status.demoMode) {
      await expect(page.getByText(/No news|unsupported|not available|No headlines/i).first()).toBeVisible();
      expect(await items.count()).toBe(0);
      return;
    }
    await expect(items.first()).toBeVisible({ timeout: 60_000 });
    expect(await items.count()).toBeGreaterThan(2);
    const first = items.first();
    const link = first.locator('a').first();
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https?:\/\//);
    await expect(first).toContainText(/Eastmoney|Federal Reserve|Yahoo|Reuters|Bloomberg/i);
  });
});

test.describe('resilience', () => {
  test('the API answers, and unknown ids never produce a fake “live” label', async ({ page }) => {
    const res = await page.request.get('/api/quotes?ids=equity%3AUS%3ATHISISNOTREAL');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.snapshots)).toBeTruthy();
    for (const snap of body.snapshots) {
      if (snap.quote) expect(['demo']).toContain(snap.quote.quality);
      else expect(snap.quote).toBeNull();
    }
  });

  test('a malformed range is refused rather than silently defaulted', async ({ page }) => {
    const res = await page.request.get('/api/bars?id=equity%3AUS%3AAAPL&range=BOGUS');
    expect(res.status()).toBe(400);
  });

  test('the status endpoint reports provider health and cache state', async ({ page }) => {
    const res = await page.request.get('/api/status');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.providers.length).toBeGreaterThan(1);
    expect(body.universe.size).toBeGreaterThan(80);
    expect(body.calendarVersion).toBeTruthy();
  });
});
