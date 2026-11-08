import { resolveInstrument } from '@/server/service';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StockDetail } from './StockDetail';

export const dynamic = 'force-dynamic';

/**
 * `/stocks/<token>`
 *
 * The token is normally the URL-encoded stable id, which is unambiguous by
 * construction. Bare tickers are accepted too and resolved server-side; when a
 * ticker means more than one instrument the page asks instead of guessing.
 */
export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  const { resolveInstrument } = await import('@/server/service');
  const resolved = resolveInstrument(decodeURIComponent(symbol));
  return {
    title: resolved ? `${resolved.name} (${resolved.displaySymbol})` : 'TomTrader',
    description: resolved
      ? `${resolved.name} — ${resolved.market} · ${resolved.currency} · real-time status, chart and history on TomTrader.`
      : 'Global market terminal.',
  };
}

export default async function StockRoute({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const token = decodeURIComponent(symbol);

  const direct = token.includes(':') ? resolveInstrument(token) : null;
  if (direct) {
    return <StockDetail instrumentId={direct.id} />;
  }

  const { search } = await import('@/server/service');
  const result = await search(token, 8);
  const exact = result.results.filter((r) => r.instrument.displaySymbol.toLowerCase() === token.toLowerCase());
  const candidates = exact.length ? exact : result.results;

  if (candidates.length === 0) notFound();
  if (candidates.length > 1) return <StockDetail instrumentId={candidates[0].instrument.id} candidates={candidates.map((c) => c.instrument)} />;
  return <StockDetail instrumentId={candidates[0].instrument.id} />;
}
