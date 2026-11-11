import { expect, test } from '@playwright/test';

// The browser suite uses an isolated, permanently labelled Demo database.
test('changing chart range cannot relabel old bars while the new response is pending', async ({ page }) => {
  await page.goto('/stocks/equity%3AUS%3AAAPL');
  await expect(page.locator('.chart-host')).toHaveAttribute('aria-label', / 3M chart,/);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/bars?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('range') === '1Y') await held;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: '1Y', exact: true }).click();
    await expect(page.getByRole('button', { name: '1Y', exact: true })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.chart-host')).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator('.chart-host')).toHaveAttribute('aria-label', / 1Y chart,/);
  await expect(page.locator('.chart-host canvas').first()).toBeVisible();
});
