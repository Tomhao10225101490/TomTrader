'use client';
import { HeatmapTreemap } from '@/components/charts/Treemap';
import { Block,Page } from '@/components/Page';
import { StockModal } from '@/components/StockModal';
import { ErrorState,Segmented,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import type { HeatmapCell,HeatmapResponse } from '@/shared/api';
import { useCallback,useMemo,useState } from 'react';

/**
 * Heatmap page. Pool, period and grouping are explicit; the coverage note
 * under the chart states how many of the requested instruments actually
 * returned change data, and the area legend states what the tile size means.
 */
export default function HeatmapPage() {
  const { t, locale } = useI18n();
  const [pool, setPool] = useState('US');
  const [period, setPeriod] = useState<'intraday' | '5d' | '1m'>('intraday');
  const [grouped, setGrouped] = useState(true);
  const [selected, setSelected] = useState<HeatmapCell | null>(null);

  const load = useAsync(
    useCallback(async () => (await api.heatmap(pool, period)).data as HeatmapResponse | null, [pool, period]),
    [pool, period],
  );

  const cells = useMemo(() => load.data?.cells ?? [], [load.data]);
  const maxAbs = useMemo(() => {
    const values = cells.map((c) => Math.abs(c.changePercent ?? 0)).sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length * 0.9)] : 0;
  }, [cells]);

  return (
    <Page
      title={t('heatmap.title')}
      subtitle={
        load.data
          ? t('heatmap.coverage', { n: load.data.coverage.withData, total: load.data.coverage.requested }) +
            ` · ±${maxAbs.toFixed(1)}%` +
            ` · ${cells.some((c) => c.weightSource === 'market-cap') ? t('heatmap.weightMarketCap') : t('heatmap.weightEqual')}`
          : undefined
      }
      actions={
        <>
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
              { value: 'INDICES', label: t('heatmap.pool.INDICES') },
            ]}
          />
          <Segmented
            size="sm"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'intraday', label: t('heatmap.period.intraday') },
              { value: '5d', label: t('heatmap.period.5d') },
              { value: '1m', label: t('heatmap.period.1m') },
            ]}
          />
          <Segmented
            size="sm"
            value={grouped ? 'sector' : 'flat'}
            onChange={(v) => setGrouped(v === 'sector')}
            options={[
              { value: 'sector', label: t('heatmap.bySector') },
              { value: 'flat', label: t('heatmap.flat') },
            ]}
          />
        </>
      }
    >
      {load.loading && !cells.length ? <Spinner label={t('common.loading')} /> : null}
      {load.error ? <ErrorState title={load.error} onRetry={load.reload} /> : null}

      <Block flush>
        <div className="p-2">
          <HeatmapTreemap cells={cells} groupBySector={grouped} height={560} onSelect={setSelected} />
        </div>
        {load.data ? (
          <p className="border-t border-line px-3 py-1.5 text-[10.5px] leading-relaxed text-ink-faint">
            {load.data.coverage.note} {period !== 'intraday' ? (locale === 'zh' ? '· 颜色按区间内首末收盘计算' : '· colour uses first-to-last close over the period') : ''}
          </p>
        ) : null}
      </Block>

      <StockModal cell={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}
