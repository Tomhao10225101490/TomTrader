import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
const base = process.env.TT_BASE ?? 'http://127.0.0.1:3100';
const paths = ['/', '/api/overview?mode=stale', '/api/search?q=AAPL', '/api/clock', '/api/status'];
const results = [];
for (const path of paths) {
  const samples = [];
  let status = 0;
  let bytes = 0;
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const r = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
    const body = await r.arrayBuffer();
    status = r.status;
    bytes = body.byteLength;
    samples.push(performance.now() - start);
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  results.push({ path, status, bytes, firstMs: samples[0], medianMs: sorted[4], p95Ms: sorted[9], samplesMs: samples });
}
const report = { recordedAt: new Date().toISOString(), node: process.version, base, mode: 'local HTTP, 10 sequential requests per endpoint, existing cache, includes response body; no browser FPS/heap claim', results };
fs.mkdirSync('docs/evidence', { recursive: true });
fs.writeFileSync('docs/evidence/benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
