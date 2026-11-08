import { expect,test,type Page } from '@playwright/test';

/**
 * Phone layout is a different information architecture, not a squeezed desktop
 * one: bottom tabs, one column, full-width chart. The assertion that matters
 * most is the one that always breaks — horizontal overflow.
 */
async function overflowOf(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('phone', () => {
  test('overview: bottom tabs, no sideways scroll, data visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="mobile-tabs"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-index-card]').first()).toBeVisible({ timeout: 60_000 });
    expect(await overflowOf(page)).toBeLessThanOrEqual(1);
    const row = await page.locator('[data-index-card]').first().boundingBox();
    const price = await page.locator('[data-index-card]').first().locator('[data-price]').boundingBox();
    expect(price!.x + price!.width).toBeLessThanOrEqual(390);
    expect(row!.width).toBeLessThanOrEqual(390);
    const main = await page.locator('main').boundingBox();
    expect(main?.width).toBeGreaterThan(380);
  });

  test('stock detail: full-width chart, no sideways scroll', async ({ page }) => {
    await page.goto('/stocks/equity%3AUS%3AAAPL');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
    expect(await overflowOf(page)).toBeLessThanOrEqual(1);
    const box = await page.locator('canvas').first().boundingBox();
    expect(box && box.width > 250).toBeTruthy();
    const chart = await page.locator('.chart-host').boundingBox();
    expect(chart && chart.width >= 320).toBeTruthy();
  });

  test('every other page fits the viewport', async ({ page }) => {
    for (const path of ['/watchlist', '/heatmap', '/clock', '/portfolio', '/alerts', '/news', '/settings']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(600);
      expect(await overflowOf(page), `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
    }
  });

  test('the price convention still applies on a narrow screen', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Red up/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-price-convention', 'cn');
    await page.getByRole('radio', { name: /Green up/ }).click();
  });
});
