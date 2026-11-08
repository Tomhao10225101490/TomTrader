import { expect,test } from '@playwright/test';
import { UNIVERSE } from '../../src/server/instruments';

// All mutations below target the isolated DEMO test server, never the user DB.
test('100-symbol watchlist can be restored and rendered', async ({ page, request }) => {
  const created = await request.post('/api/watchlist', { data: { op: 'create', name: 'Load acceptance' } });
  const { group } = await created.json();
  try {
    const ids = UNIVERSE.slice(0, 100).map((i) => i.id);
    expect(ids).toHaveLength(100);
    for (const instrumentId of ids) {
      const res = await request.post('/api/watchlist', { data: { op: 'add', groupId: group.id, instrumentId } });
      expect(res.ok()).toBe(true);
    }
    await page.goto('/watchlist');
    await page.locator('main').getByRole('button', { name: /Load acceptance/ }).click();
    await expect(page.locator('[data-testid="watchlist-table"] tbody tr')).toHaveCount(100);
    await page.reload();
    await expect(page.locator('[data-testid="watchlist-table"] tbody tr')).toHaveCount(100);
  } finally { await request.post('/api/watchlist', { data: { op: 'delete', groupId: group.id } }); }
});

test('alert edits and pause are persisted through the UI', async ({ page, request }) => {
  const res = await request.post('/api/alerts', { data: { op: 'create', instrumentId: 'equity:US:AAPL', condition: { type: 'price-above', threshold: 999999 }, cooldownMinutes: 0 } });
  const alert = await res.json();
  try {
    await page.goto('/alerts');
    const row = page.locator('[data-testid="alert-row"]').filter({ hasText: 'AAPL' });
    await row.getByRole('button', { name: 'Edit alert' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-field="threshold"]').fill('888888');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await row.getByRole('button', { name: 'Enabled', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Paused', exact: true })).toBeVisible();
    await page.reload();
    await expect(row).toContainText('888,888');
    await expect(row).toContainText('Paused');
    const body = await (await request.get('/api/alerts')).json();
    const saved = body.alerts.find((a: { id: string }) => a.id === alert.id);
    expect(saved.cooldownMinutes).toBe(0);
    expect(saved.condition.threshold).toBe(888888);
  } finally { await request.post('/api/alerts', { data: { op: 'delete', id: alert.id } }); }
});

test('target viewport widths release hidden side-panel tracks', async ({ page }) => {
  for (const [width, height] of [[1920,1080],[1440,900],[1280,800],[768,1024],[390,844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('[data-index-card]').first()).toBeVisible();
    const main = await page.locator('main').boundingBox();
    expect(main!.width).toBeGreaterThan(width < 768 ? width - 2 : width < 1280 ? width - 200 : width - 520);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});
