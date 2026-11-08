import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300));
});

await page.goto('http://127.0.0.1:3100/portfolio', { waitUntil: 'load' });
await page.waitForTimeout(4000);
await page.getByRole('button', { name: /Add holding/i }).first().click();
await page.waitForTimeout(600);
console.log('dialogs after Add holding:', await page.locator('[role="dialog"]').count());
const buttons = await page.locator('[role="dialog"] button').allInnerTexts();
console.log('buttons in dialog:', JSON.stringify(buttons));

await page.getByRole('button', { name: /Search instruments/i }).click();
await page.waitForTimeout(900);
console.log('dialogs after picker trigger:', await page.locator('[role="dialog"]').count());
const inputs = await page.locator('[role="dialog"] input').count();
console.log('inputs in dialogs:', inputs);
const pickerCount = await page.locator('[data-testid="symbol-picker"]').count();
console.log('picker count:', pickerCount);
await page.screenshot({ path: '/tmp/ttshots/probe-portfolio.png' });
await browser.close();
