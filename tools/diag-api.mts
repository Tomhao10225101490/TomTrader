import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('response', (r) => {
  if (r.url().includes('/api/')) console.log(`  ${r.status()} ${r.url().slice(24, 110)} (${(Date.now() + '')}` + ')');
});
page.on('requestfailed', (r) => console.log('  FAILED', r.url().slice(24, 120), r.failure()?.errorText));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('  [pageerror]', String(e.message).slice(0, 200)));

await page.goto('http://127.0.0.1:3100/stocks/equity%3ACN%3A600519', { waitUntil: 'load', timeout: 45_000 });
await page.waitForTimeout(7000);
const text = await page.evaluate(() => (document.getElementById('tt-main')?.innerText ?? '').slice(0, 400));
console.log('--- main text:', JSON.stringify(text));
await browser.close();
