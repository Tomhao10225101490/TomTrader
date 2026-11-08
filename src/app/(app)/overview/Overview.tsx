'use client';
import { MarketClock } from '@/components/charts/MarketClock';
import { HeatmapTreemap } from '@/components/charts/Treemap';
import { NewsList } from '@/components/NewsList';
import { Block,Page } from '@/components/Page';
import { ChangeText,PriceText,QualityBadge,QuoteBoardRow,Sparkline,StampLine,displayName } from '@/components/quote';
import { Button,ErrorState,SectionHeader,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { directionOf } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import { useInterest } from '@/lib/useInterest';
import { buildClock } from '@/server/clockClient';
import { EXCHANGES } from '@/server/exchanges';
import { ALL_INDEX_IDS } from '@/server/instruments';
import type { HeatmapResponse,MoversResponse,OverviewResponse,QuoteSnapshot } from '@/shared/api';
import { useLive } from '@/stores/live';
import { useUserData } from '@/stores/userdata';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback,useMemo } from 'react';

/**
 * Home. Screen one answers "what is happening around the world right now"
 * without a scroll; the sections below earn their place by being the next
 * question a market watcher asks, not by being equally sized boxes.
 */
export function Overview() {
  const { t, locale, zoneOf } = useI18n();
  const snapshots = useLive((s) => s.snapshots);
  const mode = 'stale' as const;
  // Three independent requests, deliberately not a Promise.all: one slow panel
  // (a heatmap rebuilding 30 histories) must not hold the index board hostage.
  const load = useAsync(useCallback(async () => (await api.overview(mode)).data as OverviewResponse | null, [mode]), [mode]);
  const moversLoad = useAsync(useCallback(async () => (await api.movers('US')).data as MoversResponse | null, []), []);
  const heatLoad = useAsync(useCallback(async () => (await api.heatmap('US', 'intraday')).data as HeatmapResponse | null, []), []);

  const data = load.data;
  const merged = useMemo(() => {
    if (!data) return data;
    const paint = (snap: QuoteSnapshot): QuoteSnapshot => ({ ...snap, ...snapshots[snap.instrument.id], sparkline: snap.sparkline });
    return {
      ...data,
      groups: data.groups.map((g) => ({ ...g, snapshots: g.snapshots.map(paint) })),
      commodities: data.commodities.map(paint),
      currencies: data.currencies.map(paint),
    };
  }, [data, snapshots]);

  useInterest(ALL_INDEX_IDS);

  const generatedAt = merged?.generatedAt ?? 0;
  const clockAt = useNow(30_000) ?? generatedAt;
  const openCount = merged ? countOpen(merged) : 0;
  const totalVenues = merged ? countVenues(merged) : 0;

  return (
    <Page
      title={t('overview.title')}
      subtitle={
        !merged ? (
          <Spinner label={t('common.loading')} />
        ) : (
          <>
            {t('overview.subtitle', {
              open: openCount,
              total: totalVenues,
              at: new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: zoneOf(), hour: '2-digit', minute: '2-digit', hour12: locale === 'en' }).format(generatedAt),
            })}
            {merged?.servedFromCache ? <span className="ml-2 text-[var(--t-warn)]">{t('overview.servedFromCache')}</span> : null}
          </>
        )
      }
      actions={
        <>
          <Button size="sm" variant="primary" onClick={load.reload}>
            <RefreshCw size={12} /> {t('common.retry')}
          </Button>
        </>
      }
    >
      {load.error && !merged ? (
        <ErrorState title={t('common.error')} body={`${t('common.errorBody')} (${load.error})`} onRetry={load.reload} />
      ) : null}

      {merged ? <div className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-[var(--t-radius)] border border-line bg-surface sm:grid-cols-4" aria-label={locale === 'zh' ? '全球指数速览' : 'Global index snapshot'}>
        {merged.groups.slice(0, 8).map((group) => {
          const snap = group.snapshots[0];
          if (!snap) return null;
          return <Link key={group.market} href={`/stocks/${encodeURIComponent(snap.instrument.id)}`} className="min-w-0 border-b border-line px-3 py-2 no-underline hover:bg-surface-alt">
            <p className="truncate text-[10px] uppercase tracking-[0.07em] text-ink-faint">{marketName(locale, group.market)}</p>
            <p className="mt-1 truncate text-[11px] font-medium text-ink-secondary">{displayName(snap.instrument, locale)}</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-1"><PriceText snapshot={snap} size="sm" /><ChangeText snapshot={snap} size="sm" showGlyph={false} /></div>
          </Link>;
        })}
      </div> : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Block
            title={t('overview.indices')}
            subtitle={locale === 'zh' ? '按市场分组 · 状态与时间戳按交易所当地时间' : 'Grouped by market · state and timestamps in exchange time'}
            right={<span className="text-[10.5px] text-ink-faint">{merged?.sources?.filter((s) => s.lastSuccessAt).length ?? 0} {locale === 'zh' ? '个数据源已响应' : 'sources responding'}</span>}
          >
            {merged ? (
              <div className="grid gap-0 2xl:grid-cols-2">
                {merged.groups.map((group) => (
                  <MarketGroup key={group.market} market={group.market} snapshots={group.snapshots} generatedAt={generatedAt} />
                ))}
              </div>
            ) : (
              <IndexSkeleton />
            )}
          </Block>

          <div className="grid gap-4 md:grid-cols-2">
            <Block title={t('overview.commodities')}>
              <MiniQuoteList snapshots={merged?.commodities ?? []} />
            </Block>
            <Block title={t('overview.currencies')} subtitle={<a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a>}>
              <MiniQuoteList snapshots={merged?.currencies ?? []} />
            </Block>
          </div>

          <MarketClock rows={useMemo(() => buildClock(clockAt), [clockAt])} now={clockAt} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Block title={t('overview.movers')} right={<Link href="/explore" className="text-[11px] text-accent">{t('overview.viewAll')}</Link>}>
            <MoversBlock movers={moversLoad.data ?? null} />
          </Block>

          <Block
            title={t('overview.heat')}
            right={<Link href="/heatmap" className="text-[11px] text-accent">{t('overview.viewAll')}</Link>}
          >
            <div className="p-2">
              <HeatmapTreemap cells={heatLoad.data?.cells ?? []} groupBySector height={300} />
              {heatLoad.data ? (
                <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-ink-faint">{heatLoad.data.coverage.note}</p>
              ) : heatLoad.error ? (
                <p className="mt-2 px-1 text-[10.5px] text-[var(--t-warn)]">{heatLoad.error}</p>
              ) : null}
            </div>
          </Block>

          <WatchlistPreview />

          <Block title={t('overview.news')}>
            <NewsList limit={6} compact />
          </Block>
        </div>
      </div>
    </Page>
  );
}

function MarketGroup({ market, snapshots, generatedAt }: { market: string; snapshots: QuoteSnapshot[]; generatedAt: number }) {
  const { t, locale } = useI18n();
  void generatedAt;
  const lead = snapshots[0];
  const zone = lead ? EXCHANGES[lead.instrument.exchange].timezone : 'UTC';
  const venues = [...new Set(snapshots.map((s) => s.instrument.exchange))];
  const venueName = venues.length === 1 ? (locale === 'zh' ? EXCHANGES[venues[0]].nameZh : EXCHANGES[venues[0]].name) : `${venues.length} venues`;
  return (
    <div className="border-t border-line first:border-t-0">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface-alt px-3 py-[5px]">
        <span className="section-title">{marketName(locale, market)}</span>
        <span className="text-[10px] text-ink-faint">
          {snapshots.length} · {venueName}
        </span>
      </header>
      <div>
        {snapshots.map((snap) => (
          <QuoteBoardRow key={snap.instrument.id} snapshot={snap} />
        ))}
      </div>
      <p className="px-3 pb-1.5 text-[10px] text-ink-faint">
        {zone.split('/').pop()?.replace(/_/g, ' ')} · {t('common.rows', { n: snapshots.length })}
      </p>
    </div>
  );
}

function MiniQuoteList({ snapshots }: { snapshots: QuoteSnapshot[] }) {
  const { locale } = useI18n();
  if (!snapshots.length) return <p className="px-3 py-4 text-[12px] text-ink-muted">—</p>;
  return (
    <div>
      {snapshots.map((snap) => (
        <div key={snap.instrument.id} className="flex items-center gap-2 border-t border-line-faint px-3 py-[6px] first:border-t-0">
          <Link href={`/stocks/${encodeURIComponent(snap.instrument.id)}`} className="min-w-0 flex-1 no-underline">
            <p className="truncate text-[12px] font-medium text-ink">{displayName(snap.instrument, locale)}</p>
            <p className="num truncate text-[10px] text-ink-faint">{snap.instrument.displaySymbol}</p>
          </Link>
          <Sparkline values={snap.sparkline} direction={directionOf(snap.quote)} width={52} height={16} />
          <div className="w-[68px] text-right">
            <PriceText snapshot={snap} size="sm" />
          </div>
          <div className="w-[62px] text-right">
            <ChangeText snapshot={snap} size="sm" showGlyph={false} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MoversBlock({ movers }: { movers: MoversResponse | null }) {
  const { t, locale } = useI18n();
  if (!movers) return <p className="px-3 py-4 text-[12px] text-ink-muted">{t('common.loading')}</p>;
  const tabs = [
    { key: 'gainers', label: t('overview.moversGainers'), rows: movers.gainers },
    { key: 'losers', label: t('overview.moversLosers'), rows: movers.losers },
    { key: 'active', label: t('overview.moversActive'), rows: movers.mostActive },
  ] as const;
  return (
    <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {tabs.map((tab) => (
        <div key={tab.key} className="px-3 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-[0.06em] text-ink-faint">{tab.label}</p>
          {tab.rows.length === 0 ? <p className="text-[11px] text-ink-muted">—</p> : null}
          {tab.rows.map((snap) => (
            <Link key={snap.instrument.id} href={`/stocks/${encodeURIComponent(snap.instrument.id)}`} className="flex items-center justify-between gap-2 py-[3px] no-underline hover:underline">
              <span className="truncate text-[11.5px] text-ink-secondary">{locale === 'zh' && snap.instrument.nameZh ? snap.instrument.nameZh : snap.instrument.displaySymbol}</span>
              <ChangeText snapshot={snap} size="xs" showGlyph={false} />
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

function WatchlistPreview() {
  const { t } = useI18n();
  const groups = useUserData((s) => s.groups);
  const activeId = useUserData((s) => s.activeGroupId);
  const snapshots = useLive((s) => s.snapshots);
  const { locale } = useI18n();
  const group = useMemo(() => groups.find((g) => g.id === activeId) ?? groups[0] ?? null, [groups, activeId]);
  useInterest(group?.instrumentIds.slice(0, 12) ?? []);

  return (
    <Block
      title={t('nav.watchlist')}
      subtitle={group?.name}
      right={<Link href="/watchlist" className="text-[11px] text-accent">{t('common.showMore')}</Link>}
    >
      {!group || group.instrumentIds.length === 0 ? (
        <p className="px-3 py-4 text-[12px] text-ink-muted">{t('watchlist.empty')}</p>
      ) : (
        <div>
          {group.instrumentIds.slice(0, 8).map((id) => {
            const snap = snapshots[id];
            if (!snap) return null;
            return (
              <Link key={id} prefetch={false} href={`/stocks/${encodeURIComponent(id)}`} className="flex items-center gap-2 border-t border-line-faint px-3 py-[6px] no-underline first:border-t-0 hover:bg-surface-alt">
                <div className="w-[62px] shrink-0">
                  <p className="num truncate text-[11.5px] font-medium text-ink">{snap.instrument.displaySymbol}</p>
                </div>
                <div className="min-w-0 flex-1 truncate text-[11.5px] text-ink-secondary">{displayName(snap.instrument, locale)}</div>
                <div className="w-[64px] text-right">
                  <PriceText snapshot={snap} size="sm" />
                </div>
                <div className="w-[60px] text-right">
                  <ChangeText snapshot={snap} size="sm" showGlyph={false} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Block>
  );
}

function IndexSkeleton() {
  return (
    <div className="grid gap-0 lg:grid-cols-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="border-t border-line px-3 py-3 first:border-t-0">
          <div className="mb-2 h-[10px] w-24 rounded bg-surface-inset" />
          {Array.from({ length: 3 }, (_, j) => (
            <div key={j} className="my-2 flex items-center justify-between gap-3">
              <div className="h-[9px] flex-1 rounded bg-surface-inset" />
              <div className="h-[9px] w-14 rounded bg-surface-inset" />
              <div className="h-[9px] w-10 rounded bg-surface-inset" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function countOpen(overview: OverviewResponse): number {
  const venues = new Set<string>();
  for (const group of overview.groups) {
    for (const snap of group.snapshots) {
      if (snap.status.state === 'open') venues.add(snap.instrument.exchange);
    }
  }
  return venues.size;
}

/** Distinct venues the board actually covers, not the number of market blocks. */
function countVenues(overview: OverviewResponse): number {
  const venues = new Set<string>();
  for (const group of overview.groups) for (const snap of group.snapshots) venues.add(snap.instrument.exchange);
  return venues.size || groupCount(overview);
}

function groupCount(overview: OverviewResponse): number {
  return overview.groups.length;
}

export { QualityBadge,SectionHeader,StampLine };
