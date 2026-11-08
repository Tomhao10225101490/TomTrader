import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });

async function trial(label: string, blockSse: boolean, blockWs: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  if (blockSse) await page.route('**/api/stream**', (r) => r.abort());
  await page.goto('http://127.0.0.1:3100/', { waitUntil: 'load', timeout: 40_000 });
  await page.waitForTimeout(blockWs ? 800 : 600);
  // Force any websocket to fail immediately, mimicking a proxy that refuses it.
  if (blockWs) {
    await page.evaluate(() => {
      const Proto = window.WebSocket as unknown as { prototype: { send: unknown } };
      void Proto;
      (window as unknown as { WebSocket: unknown }).WebSocket = function BrokenWebSocket() {
        throw new Error('ws blocked');
      };
    });
  }
  await page.waitForTimeout(4500);
  const result = await page.evaluate(() => {
    const main = document.getElementById('tt-main');
    return {
      fibers: main ? Object.keys(main).filter((k) => k.indexOf('__react') === 0).length : -1,
      heading: main?.querySelector('h1')?.textContent ?? null,
      cards: document.querySelectorAll('[data-testid="index-card"]').length,
    };
  });
  console.log(label, JSON.stringify(result), errors.length ? `errors=${errors.slice(0, 2)}` : '');
  await ctx.close();
}

await trial('sse-blocked  ', true, false);
await trial('sse-allowed  ', false, false);
await browser.close();
