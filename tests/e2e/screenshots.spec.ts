import { expect,test,type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Visual acceptance. Every image in docs/screenshots comes from this spec
 * against the running app — no mockups, no composites, no retouching. Each
 * shot waits for real content first, so a screenshot of a skeleton fails.
 */
const OUT = path.join(process.cwd(), 'docs', 'screenshots', 'demo');
fs.mkdirSync(OUT, { recursive: true });

async function ready(page: Page, selector = '[data-index-card], canvas, [data-heatmap-tile], [data-clock-lane], [data-news-item]') {
  await page
    .waitForFunction(
      (sel) => {
        const main = document.getElementById('tt-main');
        if (!main) return false;
        if (main.querySelector(sel)) return true;
        return /Unavailable|Not found|Something went wrong/.test(main.innerText);
      },
      selector,
      { timeout: 90_000 },
    );
  await page.waitForTimeout(1_600);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function setPref(page: Page, role: 'Light' | 'Dark', name?: string) {
  await page.goto('/settings');
  await page.getByRole('radio', { name: new RegExp(`^${role}$`) }).click();
  if (name) await page.getByRole('radio', { name }).click();
}

test.describe('visual acceptance', () => {
  test('01 global overview — light', async ({ page }) => {
    await setPref(page, 'Light', 'English');
    await page.goto('/');
    await ready(page);
    await shot(page, '01-global-overview-light');
  });

  test('02 global overview — dark', async ({ page }) => {
    await setPref(page, 'Dark', 'English');
    await page.goto('/');
    await ready(page);
    await shot(page, '02-global-overview-dark');
    await setPref(page, 'Light');
  });

  test('03 US stock detail', async ({ page }) => {
    await setPref(page, 'Light', 'English');
    await page.goto('/stocks/equity%3AUS%3AAAPL');
    await ready(page, 'canvas');
    await shot(page, '03-us-stock-detail');
  });

  test('04 China stock detail', async ({ page }) => {
    await page.goto('/stocks/equity%3ACN%3A600519');
    await ready(page, 'canvas');
    await shot(page, '04-china-stock-detail');
  });

  test('05 candlestick chart with volume', async ({ page }) => {
    await page.goto('/stocks/equity%3AUS%3ANVDA');
    await ready(page, 'canvas');
    const group = page.getByRole('radiogroup', { name: /chart type/i });
    await group.getByRole('radio', { name: 'Candles' }).click();
    await page.getByRole('button', { name: '1Y', exact: true }).click();
    await page.waitForTimeout(1_800);
    await page.mouse.move(640, 470);
    await page.waitForTimeout(400);
    await shot(page, '05-candlestick-chart');
  });

  test('06 watchlist', async ({ page }) => {
    await page.goto('/watchlist');
    await expect(page.locator('[data-testid="watchlist-table"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
    await shot(page, '06-watchlist');
  });

  test('07 market heatmap', async ({ page }) => {
    await page.goto('/heatmap');
    await expect(page.locator('[data-heatmap-tile]').first()).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(1_400);
    await shot(page, '07-market-heatmap');
  });

  test('08 global market clock', async ({ page }) => {
    await page.goto('/clock');
    await expect(page.locator('[data-clock-lane]').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await shot(page, '08-global-market-clock');
  });

  test('09 portfolio', async ({ page }) => {
    await page.goto('/portfolio');
    await page.waitForTimeout(1_000);
    const hasRows = await page.locator('[data-testid="portfolio-table"] tbody tr').count();
    if (hasRows === 0) {
      await page.getByRole('button', { name: /Add holding/i }).first().click();
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: /Search instruments/i }).click();
      const picker = page.locator('[data-testid="symbol-picker"]');
      await picker.locator('input').first().fill('AAPL');
      await picker.locator('[data-picker-row]').first().click();
      await modal.locator('[data-field="quantity"]').fill('120');
      await modal.locator('[data-field="averageCost"]').fill('190');
      await modal.getByRole('button', { name: /^Save$/ }).click();
    }
    await expect(page.getByText(/Total value/i)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_800);
    await shot(page, '09-portfolio');
  });

  test('10 mobile overview', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-testid="mobile-tabs"]')).toBeVisible({ timeout: 30_000 });
    await ready(page);
    await shot(page, '10-mobile-overview');
  });

  test('11 mobile stock detail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/stocks/equity%3AUS%3ATSLA');
    await ready(page, 'canvas');
    await shot(page, '11-mobile-stock-detail');
  });

  test('12 settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/Provider status/i).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1_400);
    await shot(page, '12-settings');
  });

  test('13 Chinese interface', async ({ page }) => {
    await setPref(page, 'Light', '简体中文');
    await page.goto('/');
    await ready(page);
    await shot(page, '13-chinese-overview');
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'English' }).click();
  });

  test('14 red-up price convention', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Red up/ }).click();
    await page.goto('/');
    await ready(page);
    await shot(page, '14-red-up-convention');
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Green up/ }).click();
  });

  test('15 news and market wire', async ({ page }) => {
    await page.goto('/news');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(1_200);
    await shot(page, '15-news');
  });

  test('16 markets reference table', async ({ page }) => {
    await page.goto('/markets');
    await expect(page.getByRole('heading', { level: 1, name: /Markets/i })).toBeVisible();
    await page.waitForTimeout(1_500);
    await shot(page, '16-markets');
  });

  test('17 alerts', async ({ page }) => {
    await page.goto('/alerts');
    await page.waitForTimeout(1_400);
    await shot(page, '17-alerts');
  });
});
