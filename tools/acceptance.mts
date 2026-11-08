import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.TT_BASE ?? 'http://127.0.0.1:3102';
const out = path.join(process.cwd(), 'docs/screenshots/real');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Shanghai' });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const status = await (await context.request.get(`${base}/api/status`)).json();
if (status.demoMode || !status.configuration?.publicFeedsEnabled) throw new Error('Real acceptance requires enabled personal public feeds and refuses DEMO data');
const records: Record<string, unknown>[] = [];
const tasks = [
  ['/', '01-global-overview-light'], ['/', '02-global-overview-dark'],
  ['/stocks/equity%3AUS%3AAAPL', '03-us-stock-detail'],
  ['/stocks/equity%3ACN%3A600519', '04-china-stock-detail'],
  ['/stocks/equity%3AUS%3ANVDA', '05-candlestick-chart'],
  ['/watchlist', '06-watchlist'], ['/heatmap', '07-market-heatmap'], ['/clock', '08-global-market-clock'],
  ['/portfolio', '09-portfolio'], ['/', '10-mobile-overview'],
  ['/stocks/equity%3AUS%3AAAPL', '11-mobile-stock-detail'], ['/settings', '12-settings'],
];
try {
  for (const [route, name] of tasks) {
    const mobile = name.includes('mobile');
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    if (name.includes('overview-dark')) {
      await page.goto(`${base}/settings`);
      await page.getByRole('radio', { name: 'Dark', exact: true }).click();
    } else if (name.includes('us-stock-detail')) {
      await page.goto(`${base}/settings`);
      await page.getByRole('radio', { name: 'Light', exact: true }).click();
    }
    const started = performance.now();
    await page.goto(base + route);
    await page.locator('main h1').waitFor();
    if (route === '/') await page.locator('[data-index-card]').first().waitFor();
    if (route.includes('/stocks/')) await page.locator('.chart-host, main [data-quality]').first().waitFor({ timeout: 30000 });
    await page.getByText('Free · Local personal use', { exact: false }).waitFor();
    if (route === '/' || route.includes('/stocks/')) await page.locator('main [data-quality]').filter({ hasText: /Eastmoney|Tencent/ }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(700);
    const elapsed = performance.now() - started;
    if (name.includes('candlestick')) {
      await page.getByRole('radio', { name: 'Candles', exact: true }).click();
      await page.mouse.move(600, 440);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) throw new Error(`Horizontal overflow on ${name}: ${overflow}`);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    const qualities = await page.locator('main [data-quality]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-quality')));
    records.push({ file: `${name}.png`, route, elapsedMsIncluding700msSettle: elapsed, viewport: page.viewportSize(), horizontalOverflow: overflow, chartPresent: await page.locator('.chart-host canvas').count() > 0, qualities });
    console.log(`Captured ${name}`);
  }
  const viewportChecks = [];
  for (const [width, height] of [[1920,1080],[1440,900],[1280,800],[768,1024],[390,844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + '/');
    await page.locator('[data-index-card]').first().waitFor();
    const main = await page.locator('main').boundingBox();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) throw new Error(`Overflow at ${width}`);
    viewportChecks.push({ width, height, mainWidth: main?.width, horizontalOverflow: overflow });
  }
  const chartChecks = [];
  for (const id of ['equity:CN:600519', 'equity:HK:00700', 'equity:US:AAPL']) {
    await page.goto(base + '/stocks/' + encodeURIComponent(id));
    for (const range of ['1D', '5D', '1M', '1Y']) {
      await page.getByRole('button', { name: range, exact: true }).click();
      await page.locator(`.chart-host[aria-label*=" ${range} chart,"] canvas`).first().waitFor({ timeout: 30000 });
      const caption = await page.locator('.chart-host').getAttribute('aria-label');
      const match = /, (\d+) bars/.exec(caption ?? '');
      if (!match || Number(match[1]) < 2) throw new Error(`Empty real chart: ${id} ${range}`);
      chartChecks.push({ id, range, caption });
    }
  }
  const snapshots = await (await context.request.get(`${base}/api/quotes?ids=equity:US:AAPL,equity:CN:600519,index:US:^GSPC`)).json();
  fs.mkdirSync('docs/evidence', { recursive: true });
  fs.writeFileSync('docs/evidence/real-acceptance.json', JSON.stringify({ recordedAt: new Date().toISOString(), base, mode: 'keyless local personal feeds, no demo', configuration: status.configuration, snapshots, records, viewportChecks, chartChecks, pageErrors: errors }, null, 2));
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
} finally { await browser.close(); }
