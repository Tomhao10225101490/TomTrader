import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200));
});
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'load' });
await page.waitForTimeout(4000);

console.log('dialogs before:', await page.locator('[role="dialog"]').count());
await page.locator('body').click({ position: { x: 600, y: 700 } });
await page.keyboard.press('Control+k');
await page.waitForTimeout(800);
console.log('dialogs after ctrl+k:', await page.locator('[role="dialog"]').count());

// dispatch the event directly to see whether the listener is attached
const fired = await page.evaluate(() => {
  const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
  document.dispatchEvent(ev);
  return true;
});
await page.waitForTimeout(800);
console.log('dispatched:', fired, 'dialogs:', await page.locator('[role="dialog"]').count());
const meta = await page.evaluate(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  return true;
});
await page.waitForTimeout(600);
console.log('meta dispatched:', meta, 'dialogs:', await page.locator('[role="dialog"]').count());
await browser.close();
