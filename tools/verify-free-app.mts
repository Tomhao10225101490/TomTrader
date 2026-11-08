/** Read-only live acceptance against a fresh, dedicated production server. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { QuoteSnapshot, SseFrame } from '../src/shared/api';
import type { Bars } from '../src/server/types';

const base = process.env.TT_BASE ?? 'http://127.0.0.1:3102';
const startedAt = Date.now();
async function json(route: string) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, route);
  return response.json();
}
const status = await json('/api/status');
assert.equal(status.demoMode, false);
assert.equal(status.configuration.publicFeedsEnabled, true);
assert.match(status.dbPath, /free-acceptance/);

// On a weekend the next scheduled tick is five minutes away. A cold quote
// must arrive by the background-completion notification instead of that tick.
const frames: SseFrame[] = [];
const abort = new AbortController();
const timeout = setTimeout(() => abort.abort(), 25_000);
let sseQuote: QuoteSnapshot | undefined;
try {
  const stream = await fetch(base + '/api/stream?client=free-acceptance&ids=equity:CN:600519', { signal: abort.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!sseQuote) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (!line.startsWith('data: ')) continue;
      const frame: SseFrame = JSON.parse(line.slice(6));
      frames.push(frame);
      sseQuote ??= frame.quotes?.find((s) => s.quote && s.quote.receivedAt >= startedAt);
    }
  }
  assert.ok(sseQuote?.quote, 'cold-start SSE must receive a new vendor response');
} finally {
  clearTimeout(timeout);
  abort.abort();
}
const sseElapsedMs = Date.now() - startedAt;
console.log(`Fresh cold-start SSE quote in ${sseElapsedMs}ms`);
const ids = ['equity:CN:600519', 'equity:HK:00700', 'equity:US:AAPL', 'index:US:^GSPC', 'equity:US:BRK-B'];
const { snapshots }: { snapshots: QuoteSnapshot[] } = await json('/api/quotes?mode=await&ids=' + encodeURIComponent(ids.join(',')));
assert.equal(snapshots.length, ids.length);
for (const snap of snapshots) {
  assert.ok(snap.quote && Number.isFinite(snap.quote.last), snap.instrument.id);
  assert.notEqual(snap.quote.provider, 'demo');
  assert.equal(snap.quote.tier, 'unverified');
  assert.ok(snap.quote.receivedAt >= startedAt);
}
assert.equal(snapshots.find((s) => s.instrument.id === 'equity:US:BRK-B')?.quote?.provider, 'tencent');
const histories = [];
for (const id of ids.slice(0, 4)) {
  const { series }: { series: Bars } = await json('/api/bars?wait=1&range=1M&id=' + encodeURIComponent(id));
  assert.ok(series?.bars.length > 1, id);
  assert.equal(series.meta.provider, 'eastmoney');
  histories.push({ id, count: series.bars.length, meta: series.meta });
}
const finalStatus = await json('/api/status');
fs.mkdirSync('docs/evidence', { recursive: true });
fs.writeFileSync('docs/evidence/free-app.json', JSON.stringify({ startedAt, completedAt: Date.now(), base, database: status.dbPath, sseElapsedMs, frames, snapshots, histories, finalStatus }, null, 2));
console.log(`Production APIs passed: ${snapshots.length} fresh quotes, ${histories.length} charts, Tencent fallback, cold-start SSE`);
