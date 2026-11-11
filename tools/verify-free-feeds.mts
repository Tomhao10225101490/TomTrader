/** Real network verification. No fixture/cache is allowed to count as vendor success. */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

if (process.env.TOMTRADER_PUBLIC_FEEDS !== '1') throw new Error('Run with TOMTRADER_PUBLIC_FEEDS=1 for explicitly enabled local personal research.');
process.env.TOMTRADER_DB = ':memory:';
process.env.TOMTRADER_DATA_MODE = 'personal';
process.env.TOMTRADER_DEMO = '0';
const { UNIVERSE, ALL_INDEX_IDS, instrumentById } = await import('../src/server/instruments');
const { eastmoney } = await import('../src/server/providers/eastmoney');
const { tencent, tencentCode } = await import('../src/server/providers/tencent');
const { refreshQuotes, getBars } = await import('../src/server/service');
const { classifyFreshness } = await import('../src/server/freshness');
const { getMarketStatus } = await import('../src/server/marketstatus');
const startedAt = Date.now();
const quoteSources = [];
for (const provider of [eastmoney, tencent]) {
  const eligible = UNIVERSE.filter((i) => provider.id === 'eastmoney' ? i.providerSymbols?.eastmoney : tencentCode(i));
  const start = performance.now();
  const result = await provider.getQuotes(eligible);
  quoteSources.push({ provider: provider.id, requested: eligible.length, elapsedMs: performance.now() - start, result });
  console.log(`${provider.id}: ${result.ok ? result.data.length : result.reason}/${eligible.length} quotes`);
}
const pipelineStart = performance.now();
const pipeline = await refreshQuotes(UNIVERSE.map((i) => i.id));
const pipelineElapsedMs = performance.now() - pipelineStart;
const quoteRows = UNIVERSE.map((instrument) => {
  const quote = pipeline.quotes.get(instrument.id) ?? null;
  if (quote && (!Number.isFinite(quote.last) || quote.provider === 'demo' || quote.tier !== 'unverified')) throw new Error(`Invalid real quote: ${instrument.id}`);
  const state = getMarketStatus(instrument.exchange, Date.now());
  return { id: instrument.id, market: instrument.market, assetType: instrument.assetType, quote,
    quality: quote ? classifyFreshness({ tier: quote.tier, receivedAt: quote.receivedAt, exchangeTimestamp: quote.exchangeTimestamp, marketOpen: state.state === 'open', nowMs: Date.now() }).quality : 'unavailable',
    issue: pipeline.issues.get(instrument.id) ?? null };
});
const histories = [];
const plans: [string, '1D'|'5D'|'1M'|'1Y', '5m'|'15m'|'1d'][] = [];
for (const id of ['equity:CN:600519', 'equity:HK:00700', 'equity:US:AAPL']) {
  plans.push([id,'1D','5m'],[id,'5D','15m'],[id,'1M','1d'],[id,'1Y','1d']);
}
for (const id of (process.env.TOMTRADER_HISTORY_SCOPE === 'core' ? [] : ALL_INDEX_IDS)) if (instrumentById(id)?.providerSymbols?.eastmoney) plans.push([id,'1M','1d']);
for (const [id, range, interval] of plans) {
  const instrument = instrumentById(id)!;
  const start = performance.now();
  const result = process.env.TOMTRADER_DIRECT_HISTORY === '1'
    ? await eastmoney.getHistoricalBars(instrument, range, interval)
    : await getBars(id, range, interval, { await: true }).then(({ bars, issue }) => bars ? { ok: true as const, data: bars } : { ok: false as const, reason: issue ?? 'unavailable', message: 'The configured real-provider history chain returned no bars' });
  if (result.ok) {
    const bars = result.data.bars;
    if (!bars.every((b, n) => Number.isFinite(b.close) && b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close) && (n === 0 || b.time > bars[n-1].time))) throw new Error(`Invalid OHLCV/order: ${id} ${range}`);
    histories.push({ id, range, interval, ok: true, provider: result.data.meta.provider, count: bars.length, first: bars[0], last: bars.at(-1), meta: result.data.meta, adjustment: result.data.adjustment, elapsedMs: performance.now()-start });
  } else histories.push({ id, range, interval, ...result, elapsedMs: performance.now()-start });
  console.log(`${id} ${range}: ${result.ok ? result.data.bars.length+' bars' : result.reason}`);
}
const comparisons = [];
const em = quoteSources[0].result;
const tc = quoteSources[1].result;
if (em.ok && tc.ok) for (const a of em.data) {
  const b = tc.data.find((q) => q.instrumentId === a.instrumentId);
  if (!b) continue;
  const skewSeconds = a.exchangeTimestamp && b.exchangeTimestamp ? Math.abs(a.exchangeTimestamp-b.exchangeTimestamp) : null;
  comparisons.push({ id: a.instrumentId, eastmoney: a.last, tencent: b.last, differencePercent: Math.abs(a.last-b.last)/a.last*100, skewSeconds });
}
const coverage = ['CN','HK','US','indices','commodities'].map((market) => {
  const rows = quoteRows.filter((r) => market === 'indices' ? r.assetType === 'index' : market === 'commodities' ? r.assetType === 'commodity' : r.market === market && ['equity', 'etf'].includes(r.assetType));
  return { market, requested: rows.length, available: rows.filter((r) => r.quote).length, missing: rows.filter((r) => !r.quote).map((r) => r.id) };
});
const evidence = { historyMethod: process.env.TOMTRADER_DIRECT_HISTORY === '1' ? 'direct-eastmoney' : 'real-service-fallback-chain', historyScope: process.env.TOMTRADER_HISTORY_SCOPE ?? 'all', startedAt, completedAt: Date.now(), mode: 'real-network, isolated in-memory DB, no key, no demo, no persisted quotes', quoteSources, pipelineElapsedMs, coverage, quoteRows, histories, comparisons };
const evidenceDirectory = process.env.TOMTRADER_EVIDENCE_DIR || 'docs/evidence';
fs.mkdirSync(evidenceDirectory, { recursive: true });
const target = `${evidenceDirectory}/free-feeds.json`;
if (fs.existsSync(target)) {
  const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
  const archived = `${evidenceDirectory}/free-feeds-before-fallback.json`;
  if (previous.histories?.length && previous.histories.every((h: { ok: boolean }) => !h.ok) && !fs.existsSync(archived)) fs.copyFileSync(target, archived);
}
fs.writeFileSync(target, JSON.stringify(evidence,null,2));
console.log(JSON.stringify({coverage, historiesPassed:histories.filter((h)=>h.ok).length, historiesRequested:histories.length}));
for (const market of ['CN','HK','US']) if (!coverage.find((c)=>c.market===market)?.available) process.exitCode=1;
for (const id of ['equity:CN:600519','equity:HK:00700','equity:US:AAPL']) if (!histories.some((h)=>h.id===id&&h.range==='1M'&&h.ok)) process.exitCode=1;
