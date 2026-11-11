import { isDemoMode, refreshQuotes } from '@/server/service';
import { mutationAllowed } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Fixed representative instruments only. Never forwards a caller-supplied URL or key. */
export async function POST(request: Request) {
  if (!mutationAllowed(request)) return new Response(null, { status: 403 });
  if (isDemoMode()) return Response.json({ ok: true, synthetic: true, message: 'Demo mode: no real source was contacted.' });
  const startedAt = Date.now();
  const ids = process.env.TOMTRADER_PUBLIC_FEEDS === '1'
    ? ['equity:CN:600519', 'equity:HK:00700', 'equity:US:AAPL'] : ['equity:US:AAPL'];
  const result = await Promise.race([
    refreshQuotes(ids),
    new Promise<null>((resolve) => { const timer = setTimeout(() => resolve(null), 15_000); timer.unref?.(); }),
  ]);
  const checks = ids.map((id) => {
    const quote = result?.quotes.get(id);
    return { id, ok: Boolean(quote && quote.provider !== 'demo'), provider: quote?.provider ?? null,
      currency: quote?.currency ?? null, price: quote?.last ?? null,
      quoteAt: quote?.exchangeTimestamp ?? null, receivedAt: quote?.receivedAt ?? null,
      tier: quote?.tier ?? 'unverified',
      issue: result?.issues.get(id)?.reason ?? (quote ? null : 'timeout-or-unavailable') };
  });
  return Response.json({ ok: checks.some((item) => item.ok), synthetic: false, partial: checks.some((item) => !item.ok), startedAt, completedAt: Date.now(), checks }, { headers: { 'cache-control': 'no-store' } });
}
