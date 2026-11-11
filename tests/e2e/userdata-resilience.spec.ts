import { expect, test } from '@playwright/test';

// All server data in this suite belongs to the isolated Demo test profile.
test('failed list creation and rename keep the dialog, entered name and existing list', async ({ page, request }) => {
  const { groups } = await (await request.get('/api/watchlist')).json();
  const ops: string[] = [];
  await page.route('**/api/watchlist', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    ops.push(route.request().postDataJSON().op);
    await route.fulfill({ status: 500, json: { error: 'Injected list write failure' } });
  });
  await page.goto('/watchlist');
  await page.getByRole('button', { name: 'New list', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('input').fill('Keep my unsaved list');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Injected list write failure');
  await expect(dialog.locator('input')).toHaveValue('Keep my unsaved list');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Rename list', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('input').fill('Keep my unsaved rename');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Injected list write failure');
  await expect(dialog.locator('input')).toHaveValue('Keep my unsaved rename');
  expect(ops).toEqual(['create', 'rename']);
  expect((await (await request.get('/api/watchlist')).json()).groups).toEqual(groups);
});

test('failed alert toggles show an error and restore the saved enabled state', async ({ page, request }) => {
  const created = await (await request.post('/api/alerts', { data: { op: 'create', instrumentId: 'equity:US:AAPL', condition: { type: 'price-above', threshold: 987654321 }, cooldownMinutes: 10 } })).json();
  try {
    await page.route('**/api/alerts', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({ status: 500, json: { error: 'Injected alert write failure' } });
    });
    await page.goto('/alerts');
    const row = page.locator('[data-testid="alert-row"]').filter({ hasText: '987,654,321' });
    await row.getByRole('button', { name: 'Enabled', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Enabled', exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText('Injected alert write failure');
    const saved = (await (await request.get('/api/alerts')).json()).alerts.find((a: { id: string }) => a.id === created.id);
    expect(saved.enabled).toBe(true);
  } finally { await request.post('/api/alerts', { data: { op: 'delete', id: created.id } }); }
});
