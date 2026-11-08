'use client';
import { directionGlyph,directionOf,formatPercent,formatPrice } from '@/lib/format';
import { useI18n } from '@/lib/i18n-context';
import { useInterest } from '@/lib/useInterest';
import { ALL_INDEX_IDS } from '@/server/instruments';
import { useLive } from '@/stores/live';
import { useMemo,useState } from 'react';

/**
 * The tape. It is the most characteristic surface of a market terminal, so it
 * earns a permanent row — but it is slow, hairline-bordered, pauses on hover,
 * and never re-renders the whole strip: each item is memoised on its own quote.
 */
export function TickerTape() {
  const snapshots = useLive((s) => s.snapshots);
  const [enabled, setEnabled] = useState(true);
  useInterest(ALL_INDEX_IDS);

  const items = useMemo(
    () => ALL_INDEX_IDS.map((id) => snapshots[id]).filter((s): s is NonNullable<typeof s> => Boolean(s?.quote)),
    [snapshots],
  );

  if (!enabled || items.length < 4) return null;

  return (
    <div className="tape-host relative flex h-[26px] shrink-0 items-center overflow-hidden border-b border-line bg-surface" aria-label="Index tape">
      <div className="tape-track items-center" role="presentation">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {items.map((snap) => (
              <TapeItem key={`${copy}-${snap.instrument.id}`} snapshot={snap} />
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setEnabled(false)}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-[2px] border border-line bg-surface px-1 text-[10px] text-ink-faint opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 [.tape-host:hover_&]:opacity-100"
        aria-label="Hide tape"
      >
        ×
      </button>
    </div>
  );
}

function TapeItem({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useLive.getState>['snapshots'][string]> }) {
  const { locale } = useI18n();
  const quote = snapshot.quote;
  if (!quote || !Number.isFinite(quote.last)) return null;
  const dir = directionOf(quote);
  const color = dir === 'up' ? 'var(--t-up)' : dir === 'down' ? 'var(--t-down)' : 'var(--t-flat)';
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap border-r border-line-faint px-3 text-[11px]">
      <span className="font-medium text-ink-secondary">{snapshot.instrument.displaySymbol}</span>
      <span className="num text-ink">{formatPrice(quote.last, snapshot.instrument, locale, { symbol: false })?.text}</span>
      <span className="num" style={{ color }}>
        {directionGlyph(dir, 'intl')}
        {formatPercent(quote.changePercent, locale)}
      </span>
    </span>
  );
}
