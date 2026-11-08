import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://127.0.0.1:3100/stocks/equity%3ACN%3A600519', { waitUntil: 'load' });
await page.waitForTimeout(6000);
const probe = await page.evaluate(async () => {
  const res = await fetch('/api/bars?id=equity:CN:600519&range=3M', { cache: 'no-store' });
  const body = await res.json();
  const series = body.series;
  return {
    keys: Object.keys(body),
    hasSeries: !!series,
    bars: series?.bars?.length ?? 0,
    firstTimes: (series?.bars ?? []).slice(0, 2).map((b: any) => b.time),
    firstDates: (series?.bars ?? []).slice(0, 2).map((b: any) => new Date(b.time * 1000).toISOString().slice(0, 10)),
    axisOffset: body.axisOffsetMinutes,
    interval: series?.interval,
    legendText: document.body.innerText.match(/Time [^\n]*/)?.[0],
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
