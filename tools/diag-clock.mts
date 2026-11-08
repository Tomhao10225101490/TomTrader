import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const logs: string[] = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 900)}`));

// `networkidle` never settles here by design: the SSE stream stays open for the
// life of the tab, so load + a fixed wait is the correct readiness signal.
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'load', timeout: 45_000 });

const clockOf = () => page.evaluate(() => {
  const el = document.querySelector('header .num');
  return el ? el.textContent : null;
});
const t1 = await clockOf();
await page.waitForTimeout(3500);
const t2 = await clockOf();
console.log('clock t1:', t1, '| t2:', t2, '| ticking:', t1 !== t2);

const state = await page.evaluate(() => ({
  nextVersion: (window as unknown as { next?: { version?: string } }).next?.version ?? 'none',
  routerPresent: !!(window as unknown as { next?: { router?: unknown } }).next?.router,
  reactFiberAnywhere: (() => {
    const all = document.querySelectorAll('*');
    for (const el of Array.from(all).slice(0, 400)) {
      if (Object.keys(el).some((k) => k.indexOf('__react') === 0)) return true;
    }
    return false;
  })(),
  mounted: document.getElementById('tt-main')?.innerHTML.slice(0, 120),
}));
console.log(JSON.stringify(state, null, 2));
console.log('--- console:');
for (const l of logs.slice(0, 20)) console.log('  ', l);
await browser.close();
