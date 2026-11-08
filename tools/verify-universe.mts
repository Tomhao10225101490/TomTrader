/**
 * Live coverage verification.
 *
 * Run against the real vendors, this answers three questions the product spec
 * depends on and that no amount of code review can settle:
 *
 *  1. Does every instrument in the curated universe actually resolve to a
 *     number, from which provider, and with what currency?
 *  2. Do two independent sources agree on the same index within a tolerance?
 *     (A quiet unit-error detector: mis-scaled volume, wrong multiplier, a
 *     stale cache masquerading as live data.)
 *  3. Which instruments must be shown as `unavailable`?
 *
 * Output: docs/DATA_COVERAGE.json (+ a console table). Nothing here writes to
 * the product; it is evidence, and the docs quote it.
 *
 *   npx tsx tools/verify-universe.ts
 */
import fs from 'node:fs';
import path from 'node:path';

process.env.TOMTRADER_DB ??= ':memory:';

const { UNIVERSE, HEATMAP_POOLS } = await import('../src/server/instruments');
const { yahoo } = await import('../src/server/providers/yahoo');
const { eastmoney } = await import('../src/server/providers/eastmoney');
const { symbolFor } = await import('../src/server/providers/provider');
const { getFxRates } = await import('../src/server/providers/fx');
const { sleep } = await import('../src/server/http');

type Row = {
  id: string;
  display: string;
  vendor: string | null;
  provider: string;
  last: number | null;
  pct: number | null;
  currency: string | null;
  declaredCurrency: string;
  exchangeTs: number | null;
  ageSec: number | null;
  error: string | null;
};

const results: Row[] = [];

async function probeYahoo(list: typeof UNIVERSE) {
  const res = await yahoo.getQuotes(list);
  if (!res.ok) return res;
  return res;
}

console.log('· probing Yahoo in batches of 40');
for (let i = 0; i < UNIVERSE.length; i += 40) {
  const chunk = UNIVERSE.slice(i, i + 40);
  const res = await probeYahoo(chunk);
  for (const instrument of chunk) {
    const symbol = symbolFor(instrument, 'yahoo');
    if (!res.ok) {
      results.push({
        id: instrument.id,
        display: instrument.displaySymbol,
        vendor: symbol,
        provider: 'yahoo',
        last: null,
        pct: null,
        currency: null,
        declaredCurrency: instrument.currency,
        exchangeTs: null,
        ageSec: null,
        error: `yahoo: ${res.reason} ${res.message}`,
      });
      continue;
    }
    const q = res.data.find((x) => x.instrumentId === instrument.id);
    results.push({
      id: instrument.id,
      display: instrument.displaySymbol,
      vendor: symbol,
      provider: 'yahoo',
      last: q && Number.isFinite(q.last) ? q.last : null,
      pct: q?.changePercent ?? null,
      currency: q?.currency ?? null,
      declaredCurrency: instrument.currency,
      exchangeTs: q?.exchangeTimestamp ?? null,
      ageSec: q?.exchangeTimestamp ? Math.round((Date.now() / 1000 - q.exchangeTimestamp)) : null,
      error: q ? null : 'not-returned-by-provider',
    });
  }
  await sleep(500);
}

console.log('· probing Eastmoney for CN/HK');
const emList = UNIVERSE.filter((i) => (i.market === 'CN' || i.market === 'HK') && symbolFor(i, 'eastmoney'));
const emRes = await eastmoney.getQuotes(emList);
const emById = new Map<string, { last: number; pct: number | null; currency: string; ts: number | null }>();
if (emRes.ok) {
  for (const q of emRes.data) emById.set(q.instrumentId, { last: q.last, pct: q.changePercent, currency: q.currency, ts: q.exchangeTimestamp });
} else {
  console.log('  eastmoney failed:', emRes.reason, emRes.message);
}

const comparisons: { id: string; yahoo: number | null; eastmoney: number | null; diffPct: number | null }[] = [];
for (const instrument of emList) {
  const y = results.find((r) => r.id === instrument.id);
  const e = emById.get(instrument.id);
  if (!e || !y?.last) continue;
  comparisons.push({
    id: instrument.id,
    yahoo: y.last,
    eastmoney: e.last,
    diffPct: ((e.last - y.last) / y.last) * 100,
  });
}

console.log('· probing history');
const historyChecks: { id: string; range: string; bars: number; firstClose: number | null; lastClose: number | null; error: string | null; adjustment: string }[] = [];
const historyProbes = [
  ['index:US:^GSPC', '6M'],
  ['equity:US:AAPL', '1Y'],
  ['equity:CN:600519', '1Y'],
  ['equity:HK:00700', '3M'],
  ['equity:JP:7203', '3M'],
  ['index:DE:^GDAXI', '1M'],
  ['equity:US:AAPL', '1D'],
  ['equity:CN:600519', '1D'],
  ['index:CN:000001', '5D'],
  ['equity:US:SPY' as string, '5Y'],
] as const;
for (const [id, range] of historyProbes) {
  const instrument = UNIVERSE.find((i) => i.id === id) ?? null;
  if (!instrument) {
    historyChecks.push({ id, range, bars: 0, firstClose: null, lastClose: null, error: 'unknown-instrument', adjustment: '-' });
    continue;
  }
  const provider = id.includes(':CN:') || id.includes(':HK:') ? eastmoney : yahoo;
  const r = await provider.getHistoricalBars(instrument, range as never, undefined as never);
  if (r.ok) {
    historyChecks.push({
      id,
      range,
      bars: r.data.bars.length,
      firstClose: r.data.bars[0].close,
      lastClose: r.data.bars.at(-1)!.close,
      error: null,
      adjustment: `${r.data.adjustment}${r.data.adjusted ? '' : ' (unadjusted)'}`,
    });
  } else {
    historyChecks.push({ id, range, bars: 0, firstClose: null, lastClose: null, error: `${r.reason}: ${r.message}`, adjustment: '-' });
  }
  await sleep(400);
}

console.log('· probing search');
const searchProbes = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'BABA', '0700', '600519', '7203', 'ASML', '茅台', '腾讯', 'HSI', 'DAX', 'nvidia', 'TSMC'];
const searchResults: { query: string; hits: { id: string; name: string; exchange: string; currency: string; type: string }[]; error: string | null }[] = [];
for (const q of searchProbes) {
  const r = await yahoo.search(q);
  searchResults.push({
    query: q,
    hits: r.ok
      ? r.data.slice(0, 5).map((x) => ({ id: x.instrument.id, name: x.instrument.name, exchange: x.instrument.exchange, currency: x.instrument.currency, type: x.instrument.assetType }))
      : [],
    error: r.ok ? null : `${r.reason}: ${r.message}`,
  });
  await sleep(350);
}

console.log('· probing FX');
const fxRes = await getFxRates();

console.log('· probing movers pools');
const poolReport = HEATMAP_POOLS.map((p) => {
  const ids = new Set(results.map((r) => r.id));
  const covered = p.ids.filter((id) => ids.has(id));
  const withData = covered.filter((id) => results.find((r) => r.id === id)?.last !== null);
  return { pool: p.key, requested: p.ids.length, inUniverse: covered.length, withData: withData.length };
});

/* ------------------------------------------------------------------ report */

const failed = results.filter((r) => r.last === null);
const currencyMismatch = results.filter((r) => r.currency && r.currency !== r.declaredCurrency);
const out = {
  ranAt: new Date().toISOString(),
  universeSize: UNIVERSE.length,
  resolved: results.length - failed.length,
  failed: failed.map((f) => ({ id: f.id, vendor: f.vendor, error: f.error })),
  currencyMismatch,
  dualSourceComparison: comparisons,
  history: historyChecks,
  search: searchResults,
  fx: fxRes.ok ? { tier: fxRes.data.tier, provider: fxRes.data.provider, sourceAt: new Date(fxRes.data.sourceAt).toISOString(), rates: fxRes.data.quotes } : { error: fxRes.message },
  pools: poolReport,
  rows: results,
};

fs.mkdirSync(path.join(process.cwd(), 'docs'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'docs/DATA_COVERAGE.json'), JSON.stringify(out, null, 2));

console.log(`\n${'='.repeat(88)}`);
console.log(`universe ${UNIVERSE.length} · resolved ${out.resolved} · failed ${failed.length}`);
console.log('='.repeat(88));
for (const f of failed) console.log(`  FAIL ${f.id.padEnd(26)} ${String(f.vendor).padEnd(12)} ${f.error}`);
if (!failed.length) console.log('  (no failures)');
console.log(`\ncurrency mismatches: ${currencyMismatch.length}`);
for (const m of currencyMismatch) console.log(`  ${m.id}: declared ${m.declaredCurrency}, vendor says ${m.currency}`);
console.log('\ndual-source index comparison (Yahoo vs Eastmoney):');
for (const c of comparisons) console.log(`  ${c.id.padEnd(16)} yahoo ${String(c.yahoo).padStart(12)}  eastmoney ${String(c.eastmoney).padStart(12)}  Δ ${c.diffPct!.toFixed(4)}%`);
console.log('\nhistory probes:');
for (const h of historyChecks) console.log(`  ${h.id.padEnd(20)} ${h.range.padEnd(4)} bars ${String(h.bars).padStart(5)}  ${h.firstClose ?? '-'} → ${h.lastClose ?? '-'}  ${h.adjustment}  ${h.error ?? ''}`);
console.log('\nsearch probes:');
for (const s of searchResults) console.log(`  ${s.query.padEnd(8)} → ${s.hits.map((h) => `${h.id}(${h.currency})`).join(', ') || 'NONE'} ${s.error ?? ''}`);
console.log('\nfx:');
console.log('  ', JSON.stringify(out.fx));
console.log('\nheatmap pools:');
for (const p of poolReport) console.log(`  ${p.pool.padEnd(8)} requested ${p.requested} inUniverse ${p.inUniverse} withData ${p.withData}`);
console.log(`\nwrote docs/DATA_COVERAGE.json`);
