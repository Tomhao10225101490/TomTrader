const t0 = Date.now();
const log = (...a: unknown[]) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
process.env.TOMTRADER_DB = ':memory:';
const { yahoo } = await import('../src/server/providers/yahoo');
const { UNIVERSE } = await import('../src/server/instruments');
const { symbolFor } = await import('../src/server/providers/provider');
log('start, universe', UNIVERSE.length);
for (let i = 0; i < 3; i++) {
  const chunk = UNIVERSE.slice(i * 40, i * 40 + 40).filter((x) => symbolFor(x, 'yahoo'));
  log('batch', i, 'size', chunk.length);
  const res = await yahoo.getQuotes(chunk);
  if (res.ok) log('  ok', res.data.length, 'first:', JSON.stringify(res.data[0]).slice(0, 220));
  else log('  err', res.reason, res.message, 'retryAfter', res.retryAfterMs);
}
log('done');
