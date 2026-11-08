'use client';
import { Page } from '@/components/Page';
import { ChangeText,PriceText,StateBadge,displayName } from '@/components/quote';
import { EmptyState,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { assetLabel,marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import type { SearchResponse } from '@/shared/api';
import Link from 'next/link';
import { useRouter,useSearchParams } from 'next/navigation';
import { useCallback,useEffect,useState } from 'react';

/**
 * `/search?q=` exists for three reasons: a keyboard-less entry point on touch,
 * a shareable result URL, and a fallback if the ⌘K palette is unavailable.
 */
export function SearchServerPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(q);

  const run = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    const res = await api.search(query);
    setResult(res.data);
    setLoading(false);
    if (res.error) router.replace(`/search?q=${encodeURIComponent(query)}&err=${encodeURIComponent(res.error)}`);
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => void run(q), 0);
    return () => clearTimeout(timer);
  }, [q, run]);

  return (
    <Page
      title={t('search.title')}
      subtitle={result ? `${result.results.length} · ${t(`search.source.${result.source}`)} · ${result.tookMs}ms` : undefined}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/search?q=${encodeURIComponent(text)}`);
        }}
        className="flex gap-2"
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('search.placeholder')}
          className="h-[32px] flex-1 rounded-[var(--t-radius-sm)] border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
        />
        <button type="submit" className="h-[32px] rounded-[var(--t-radius-sm)] border border-accent bg-accent px-3 text-[12px] font-medium text-accent-ink">
          {t('common.add')}
        </button>
      </form>

      {loading ? <Spinner label={t('search.loading')} /> : null}
      {!loading && !result?.results.length && q ? (
        <EmptyState title={t('search.noResults', { q })} body={t('search.noResultsHint')} />
      ) : null}
      {result?.issue ? <p className="text-[11px] text-[var(--t-warn)]">{t('search.error', { msg: result.issue })}</p> : null}

      <div className="divide-y divide-line rounded-[var(--t-radius)] border border-line bg-surface">
        {(result?.results ?? []).map((row) => (
          <Link key={row.instrument.id} href={`/stocks/${encodeURIComponent(row.instrument.id)}`} className="flex items-center gap-3 px-3 py-2 no-underline hover:bg-surface-alt">
            <div className="w-[80px] shrink-0">
              <p className="num text-[13px] font-semibold text-ink">{row.instrument.displaySymbol}</p>
              <p className="text-[10px] uppercase text-ink-faint">{assetLabel(locale, row.instrument.assetType)}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] text-ink-secondary">{displayName(row.instrument, locale)}</p>
              <p className="truncate text-[10.5px] text-ink-faint">
                {marketName(locale, row.instrument.market)} · {row.instrument.exchange} · {row.instrument.currency}
              </p>
            </div>
            {row.status ? <StateBadge status={row.status} /> : null}
            <div className="w-[70px] text-right"><PriceText snapshot={{ instrument: row.instrument, quote: row.quote, status: row.status ?? undefined } as never} /></div>
            <div className="w-[64px] text-right"><ChangeText snapshot={{ instrument: row.instrument, quote: row.quote, status: row.status ?? undefined } as never} showGlyph={false} /></div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
