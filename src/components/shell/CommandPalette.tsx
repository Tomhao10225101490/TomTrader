'use client';
import { ChangeText,displayName,PriceText } from '@/components/quote';
import { Kbd,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { assetLabel,marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import type { SearchResponse } from '@/shared/api';
import { usePrefs } from '@/stores/prefs';
import { CornerDownLeft,Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Global search (⌘K / Ctrl+K).
 *
 * Keyboard-first: the arrow keys move, Enter opens, Escape closes, and typing
 * is debounced so a fast typist does not fire six vendor searches. The result
 * row always shows the four fields that disambiguate a global ticker —
 * exchange, country, currency and asset type — because "7203" in Tokyo is not
 * "7203" anywhere else.
 */

interface PaletteState {
  open: boolean;
}

export function CommandPalette() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const recents = usePrefs((s) => s.recentSearches);
  const pushRecent = usePrefs((s) => s.pushRecentSearch);
  const [state, setState] = useState<PaletteState>({ open: false });
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const open = useCallback(() => {
    setState({ open: true });
    setQuery('');
    setResult(null);
    setIndex(0);
  }, []);

  const close = useCallback(() => setState({ open: false }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (state.open) close(); else open();
        return;
      }
      if (e.key === 'Escape' && state.open) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.open, close, open]);

  useEffect(() => {
    if (!state.open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [state.open]);

  useEffect(() => {
    if (!state.open) return;
    let cancelled = false;
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (!q) { setResult(null); setLoading(false); return; }
      setLoading(true);
      const res = await api.search(q);
      if (cancelled) return;
      setResult(res.data);
      setSearchError(res.error);
      setLoading(false);
      setIndex(0);
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, state.open]);

  const rows = result?.results ?? [];

  const go = useCallback(
    (id: string) => {
      pushRecent(query.trim() || id);
      close();
      router.push(`/stocks/${encodeURIComponent(id)}`);
    },
    [pushRecent, query, close, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[index];
      if (row) go(row.instrument.id);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!state.open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--t-scrim)] px-4 pt-[10vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex w-full max-w-[620px] flex-col overflow-hidden rounded-[var(--t-radius)] border border-line bg-surface shadow-[0_24px_60px_-28px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            className="h-[46px] flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
          {loading ? <Spinner /> : null}
        </div>

        <div ref={listRef} className="max-h-[54vh] overflow-y-auto overscroll-contain py-1">
          {!query.trim() ? (
            <EmptyQuery recents={recents} onPick={(q) => setQuery(q)} t={t} locale={locale} />
          ) : rows.length === 0 && !loading ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-ink-secondary">{t('search.noResults', { q: query })}</p>
              <p className="mt-1 text-[11.5px] text-ink-muted">{t('search.noResultsHint')}</p>
            </div>
          ) : (
            rows.map((row, i) => (
              <button
                key={row.instrument.id}
                type="button"
                data-index={i}
                data-search-row={row.instrument.id}
                onClick={() => go(row.instrument.id)}
                onMouseMove={() => setIndex(i)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left',
                  i === index ? 'bg-accent-soft' : 'hover:bg-surface-alt',
                )}
              >
                <div className="w-[78px] shrink-0">
                  <p className="num truncate text-[13px] font-semibold text-ink">{row.instrument.displaySymbol}</p>
                  <p className="text-[10px] uppercase tracking-[0.04em] text-ink-faint">{assetLabel(locale, row.instrument.assetType)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-[12.5px]', i === index ? 'text-ink' : 'text-ink-secondary')}>{displayName(row.instrument, locale)}</p>
                  <p className="truncate text-[10.5px] text-ink-faint">
                    {marketName(locale, row.instrument.market)} · {row.instrument.exchange} · {row.instrument.currency}
                    {row.matchedOn !== 'symbol' ? ` · ${row.matchedOn}` : ''}
                  </p>
                </div>
                <div className="w-[80px] shrink-0 text-right">
                  <PriceText snapshot={{ instrument: row.instrument, quote: row.quote, status: row.status ?? undefined } as never} size="sm" />
                </div>
                <div className="w-[68px] shrink-0 text-right">
                  <ChangeText snapshot={{ instrument: row.instrument, quote: row.quote, status: row.status ?? undefined } as never} size="sm" showGlyph={false} />
                </div>
              </button>
            ))
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-line bg-surface-alt px-3 py-1.5 text-[10.5px] text-ink-faint">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('search.selectHint')}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> <CornerDownLeft size={10} />
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> {t('search.escapeHint')}
          </span>
          {result && rows.length > 0 ? <span className="ml-auto">{t(`search.source.${result.source}`)} · {result.tookMs}ms</span> : null}
          {searchError ? <span role="alert">{t('search.error', { msg: searchError })}</span> : null}
          {result?.issue ? <span className="ml-auto text-[var(--t-warn)]">{t('search.error', { msg: result.issue })}</span> : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function EmptyQuery({ recents, onPick, t, locale }: { recents: string[]; onPick: (q: string) => void; t: (k: never) => string; locale: 'en' | 'zh' }) {
  const suggestions = useMemo(
    () => ['AAPL', 'NVDA', '0700.HK', '600519', '7203.T', 'ASML', '^GSPC', 'TSMC', '恒生科技', '标普500'],
    [],
  );
  return (
    <div className="px-3 py-3">
      {recents.length > 0 ? (
        <>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.07em] text-ink-faint">
            <Star size={10} /> {t('search.recent' as never)}
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {recents.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onPick(r)}
                className="rounded-[3px] border border-line bg-surface-alt px-1.5 py-[2px] text-[11px] text-ink-secondary hover:border-line-strong hover:text-ink"
              >
                {r}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.07em] text-ink-faint">{t('search.suggestions' as never)}</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className={cn('rounded-[3px] border border-line px-1.5 py-[2px] text-[11px] hover:border-line-strong', locale === 'zh' ? 'text-ink-secondary' : 'num text-ink-secondary')}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
