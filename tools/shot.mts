import { chromium } from '@playwright/test';
import fs from 'node:fs';

const targets = process.argv.slice(2);
fs.mkdirSync('/tmp/ttshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'Asia/Shanghai' });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 300)));

for (const spec of targets) {
  const [pathPart, name] = spec.split('=');
  // `load`, not `networkidle`: the SSE stream is intentionally long-lived, so
  // networkidle would never fire for a connected terminal.
  await page.goto(process.env.TT_BASE + pathPart, { waitUntil: 'load', timeout: 60_000 }).catch((e) => console.log('nav warn', String(e).slice(0, 100)));
  // Wait until the page actually has data, then a beat for the tape/clock to
  // settle. A screenshot of a skeleton proves nothing about the product.
  await page
    .waitForFunction(
      () => {
        const main = document.getElementById('tt-main');
        if (!main) return false;
        // A page is only ready when it shows data, not a skeleton or an error.
        if (main.querySelector('[data-index-card], canvas, [data-heatmap-tile], [data-clock-lane], [data-news-item]')) return true;
        return /Unavailable|Something went wrong|Not found/.test(main.innerText);
      },
      { timeout: 30_000 },
    )
    .catch(() => console.log('  (content wait timed out)'));
  await page.waitForTimeout(2200);
  const file = `/tmp/ttshots/${name ?? 'page'}.png`;
  await page.screenshot({ path: file });
  console.log('shot', file);
}
if (errors.length) { console.log('--- console errors:'); for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ', e); }
await browser.close();
