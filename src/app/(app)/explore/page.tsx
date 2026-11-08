'use client';
import { Block,Page } from '@/components/Page';
import { ChangeText,PriceText,StateBadge,displayName } from '@/components/quote';
import { ErrorState,Segmented,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import { useInterest } from '@/lib/useInterest';
import { UNIVERSE } from '@/server/instruments';
import type { MoversResponse,QuoteSnapshot } from '@/shared/api';
import { useLive } from '@/stores/live';
import Link from 'next/link';
import { useCallback,useMemo,useState } from 'react';

/**
 * Explore: the curated universe as a sortable table, plus movers per pool.
 * It is also the honest answer to "what does this build actually cover" —
 * every row here has a verified vendor mapping, and nothing else is listed.
 */
export default function ExplorePage() {
  const { t, locale } = useI18n();
  const [pool, setPool] = useState('US');
  const [asset, setAsset] = useState<'all' | 'index' | 'equity' | 'etf' | 'commodity' | 'currency'>('all');
  const [query, setQuery] = useState('');

  const movers = useAsync(
    useCallback(async () => (await api.movers(pool)).data as MoversResponse | null, [pool]),
    [pool],
  );

  const poolIds = useMemo(
    () => [...(movers.data?.gainers ?? []), ...(movers.data?.losers ?? []), ...(movers.data?.mostActive ?? [])].map((s) => s.instrument.id),
    [movers.data],
  );
  useInterest(poolIds);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return UNIVERSE.filter((i) => (asset === 'all' ? true : i.assetType === asset))
      .filter((i) => (q ? i.displaySymbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || (i.nameZh ?? '').includes(q) || i.market.toLowerCase().includes(q) : true))
      .slice(0, 400);
  }, [asset, query]);

  const liveSnapshots = useLive((state) => state.snapshots);
  useInterest(rows.map((r) => r.id));

  return (
    <Page
      title={t('nav.explore')}
      subtitle={`${UNIVERSE.length} ${locale === 'zh' ? '只已核验证券' : 'verified instruments'} · ${locale === 'zh' ? '覆盖' : 'coverage'} ${[...new Set(UNIVERSE.map((i) => i.market))].join(' ')}`}
      actions={
        <Segmented
          size="sm"
          value={asset}
          onChange={setAsset}
          options={[
            { value: 'all', label: t('common.type') + ' ·' },
            { value: 'index', label: t('asset.index') },
            { value: 'equity', label: t('asset.equity') },
            { value: 'etf', label: t('asset.etf') },
            { value: 'commodity', label: t('asset.commodity') },
            { value: 'currency', label: t('asset.currency') },
          ]}
        />
      }
    >
      <Block title={t('overview.movers')} right={
        <Segmented
          size="sm"
          value={pool}
          onChange={setPool}
          options={[
            { value: 'US', label: t('heatmap.pool.US') },
            { value: 'CN', label: t('heatmap.pool.CN') },
            { value: 'HK', label: t('heatmap.pool.HK') },
            { value: 'APAC', label: t('heatmap.pool.APAC') },
            { value: 'EU', label: t('heatmap.pool.EU') },
          ]}
        />
      }>
        {movers.loading && !movers.data ? <div className="p-3"><Spinner /></div> : null}
        {movers.error ? <div className="p-3"><ErrorState title={movers.error} onRetry={movers.reload} /></div> : null}
        {movers.data ? (
          <div className="grid gap-0 md:grid-cols-3">
            {([
              [t('overview.moversGainers'), movers.data.gainers],
              [t('overview.moversLosers'), movers.data.losers],
              [t('overview.moversActive'), movers.data.mostActive],
            ] as const).map(([label, list]) => (
              <div key={label} className="border-t border-line px-3 py-2 first:border-t-0 md:border-t-0 md:border-r md:last:border-r-0">
                <p className="mb-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-faint">{label}</p>
                {list.map((snap) => (
                  <MoverRow key={`${label}:${snap.instrument.id}`} snapshot={liveSnapshots[snap.instrument.id] ?? snap} />
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </Block>

      <Block
        title={locale === 'zh' ? '证券列表' : 'Instrument list'}
        right={
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="h-[26px] w-[200px] rounded-[var(--t-radius-sm)] border border-line bg-surface px-2 text-[12px] outline-none focus:border-accent"
          />
        }
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                <th className="px-3 py-2 font-medium">{t('common.symbol')}</th>
                <th className="px-3 py-2 font-medium">{t('common.name')}</th>
                <th className="px-3 py-2 font-medium">{t('common.market')}</th>
                <th className="px-3 py-2 font-medium">{t('common.type')}</th>
                <th className="px-3 py-2 font-medium">{t('common.currency')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('common.price')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('common.changePct')}</th>
                <th className="px-3 py-2 font-medium">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((instrument) => {
                const snap = liveSnapshots[instrument.id];
                return (
                  <tr key={instrument.id} className="border-b border-line-faint last:border-b-0 hover:bg-surface-alt">
                    <td className="px-3 py-[5px]">
                      <Link href={`/stocks/${encodeURIComponent(instrument.id)}`} className="num font-medium text-ink no-underline hover:text-accent">
                        {instrument.displaySymbol}
                      </Link>
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-[5px] text-ink-secondary">{displayName(instrument, locale)}</td>
                    <td className="px-3 py-[5px] text-ink-muted">{marketName(locale, instrument.market)}</td>
                    <td className="px-3 py-[5px] text-ink-muted">{t((`asset.${instrument.assetType}`) as never)}</td>
                    <td className="num px-3 py-[5px] text-ink-muted">{instrument.currency}</td>
                    <td className="px-3 py-[5px] text-right">
                      <PriceText snapshot={snap} />
                    </td>
                    <td className="px-3 py-[5px] text-right">
                      <ChangeText snapshot={snap} showGlyph={false} />
                    </td>
                    <td className="px-3 py-[5px]">
                      {snap ? <StateBadge status={snap.status} /> : <span className="text-[10.5px] text-ink-faint">{t('common.loading')}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>
    </Page>
  );
}

function MoverRow({ snapshot }: { snapshot: QuoteSnapshot }) {
  const { locale } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2 py-[3px]">
      <Link href={`/stocks/${encodeURIComponent(snapshot.instrument.id)}`} className="min-w-0 flex-1 truncate text-[11.5px] text-ink-secondary no-underline hover:text-accent">
        {displayName(snapshot.instrument, locale)}
      </Link>
      <span className="w-[58px] text-right"><PriceText snapshot={snapshot} size="sm" /></span>
      <span className="w-[58px] text-right"><ChangeText snapshot={snapshot} size="sm" showGlyph={false} /></span>
    </div>
  );
}

