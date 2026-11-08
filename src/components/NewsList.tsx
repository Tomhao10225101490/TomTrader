'use client';
import { ErrorState,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatAgo,formatClock } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import type { StringKey } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import type { NewsItem } from '@/server/types';
import { useCallback,useState } from 'react';

/**
 * Headline list. List-first, not card-first: a market reader scans titles and
 * times, and the source line is what makes a headline verifiable.
 */
export function NewsList({ instrumentId, limit = 24, compact = false }: { instrumentId?: string | null; limit?: number; compact?: boolean }) {
  const { t, locale, zoneOf } = useI18n();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<'all' | 'wire' | 'policy'>('all');

  const load = useAsync(
    useCallback(async () => {
      const res = await api.news(instrumentId ?? null);
      if (res.error) throw new Error(res.error);
      return res.data;
    }, [instrumentId]),
    [instrumentId, limit],
  );

  const items = (load.data?.items ?? []).filter((n) => (filter === 'all' ? true : filter === 'wire' ? n.provider === 'eastmoney' : n.category === 'policy'));

  if (load.loading && !items.length) return <div className="p-3"><Spinner label={t('common.loading')} /></div>;
  if (load.error && !items.length) return <div className="p-3"><ErrorState title={t('news.error', { msg: load.error })} onRetry={load.reload} /></div>;
  if (!items.length) return <div className="px-3 py-5 text-center text-[12px] text-ink-muted"><p>{t('news.empty')}</p>{load.data?.issue ? <p className="mt-1 text-[11px]">{locale === 'zh' ? '数据源状态' : 'Source status'}: {load.data.issue}</p> : null}</div>;

  return (
    <div className="flex flex-col">
      {!compact ? (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          {(['all', 'wire', 'policy'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn('rounded-[3px] px-1.5 py-[2px] text-[11px]', filter === key ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:text-ink')}
            >
              {key === 'all' ? t('news.filterAll') : key === 'wire' ? (locale === 'zh' ? '快讯' : 'Wire') : (locale === 'zh' ? '政策' : 'Policy')}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="divide-y divide-line-faint">
        {items.slice(0, limit).map((item) => (
          <NewsRow key={item.id} item={item} now={now ?? item.publishedAt} zone={zoneOf()} locale={locale} t={t} compact={compact} />
        ))}
      </ul>
      {load.data?.issue ? <p className="border-t border-line px-3 py-1.5 text-[10.5px] text-[var(--t-warn)]">{load.data.issue}</p> : null}
    </div>
  );
}

function NewsRow({
  item,
  now,
  zone,
  locale,
  t,
  compact,
}: {
  item: NewsItem;
  now: number;
  zone: string;
  locale: 'en' | 'zh';
  t: (k: StringKey, vars?: Record<string, string | number>) => string;
  compact: boolean;
}) {
  return (
    <li data-news-item={item.id} className="px-3 py-2">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="group block no-underline"
      >
        <p className={cn('text-[12.5px] leading-snug text-ink-secondary group-hover:text-accent group-hover:underline group-hover:underline-offset-2')}>
          {item.title}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink-faint">
          <span className="font-medium text-ink-muted">{item.publisher}</span>
          <span>·</span>
          <span className="num" title={formatClock(item.publishedAt, zone, locale, { date: true, seconds: false })}>
            {formatAgo(item.publishedAt, now, locale)}
          </span>
          {item.category ? (
            <>
              <span>·</span>
              <span className="uppercase tracking-[0.04em]">{item.category}</span>
            </>
          ) : null}
          {item.symbols.length ? (
            <>
              <span>·</span>
              <span className="num">{item.symbols.slice(0, 3).join(' ')}</span>
            </>
          ) : null}
          {!compact ? (
            <>
              <span>·</span>
              <span>{t('news.read')}</span>
            </>
          ) : null}
        </p>
      </a>
    </li>
  );
}
