'use client';
import { PriceChart } from '@/components/charts/PriceChart';
import { ChangeText,PriceText,displayName,stockHref } from '@/components/quote';
import { ErrorState,Modal,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { resolveInstrument } from '@/lib/clientInstruments';
import { marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import type { BarRange } from '@/server/types';
import type { BarsResponse,HeatmapCell } from '@/shared/api';
import Link from 'next/link';
import { useCallback,useMemo,useState } from 'react';

/**
 * Quick look from the heatmap: identity, live quote and a real chart, without
 * losing the page the user was scanning. The full page is one click away and
 * the header states the stable instrument id so nothing is ambiguous.
 */
export function StockModal({ cell, onClose }: { cell: HeatmapCell | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<BarRange>('3M');
  const instrument = useMemo(() => (cell ? resolveInstrument(cell.instrumentId) : null), [cell]);

  const bars = useAsync(
    useCallback(async () => (instrument ? ((await api.bars(instrument.id, range)).data as BarsResponse | null) : null), [instrument, range]),
    [instrument?.id, range],
  );


  return (
    <Modal open={Boolean(cell)} onClose={onClose} title={cell?.name ?? ''} width={760}>
      {cell ? (
        <div className="flex flex-col gap-3">
          <header className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[12px] text-ink-muted">
                <span className="num font-medium text-ink">{instrument?.displaySymbol}</span> ·{' '}
                {marketName(locale, cell.market)} · {instrument?.currency} ·{' '}
                <span className="num text-[10.5px] text-ink-faint">{cell.instrumentId}</span>
              </p>
              <div className="mt-1 flex items-end gap-2">
                <PriceText snapshot={{ instrument: instrument!, quote: { last: cell.last, changePercent: cell.changePercent, quality: cell.quality } as never, status: undefined } as never} size="lg" />
                <ChangeText snapshot={{ instrument: instrument!, quote: { changePercent: cell.changePercent } as never, status: undefined } as never} size="lg" />
              </div>
            </div>
            <Link href={stockHref({ id: cell.instrumentId })} className="text-[11.5px] text-accent">
              {t('common.openDetail')} →
            </Link>
          </header>

          {bars.loading && !bars.data ? <Spinner /> : null}
          {bars.error && !bars.data ? <ErrorState title={bars.error} onRetry={bars.reload} /> : null}
          {instrument ? (
            <PriceChart
              response={bars.data}
              loading={bars.loading}
              error={bars.error}
              range={range}
              onRange={setRange}
              exchange={instrument.exchange}
              instrument={instrument}
              onRetry={bars.reload}
              height={280}
            />
          ) : null}

          <footer className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span>{locale === 'zh' ? '数据来自行情快照，弹窗不改变任何自选或持仓' : 'Snapshot data; this dialog changes nothing'}</span>
            {displayName(instrument ?? { name: cell.name, nameZh: cell.nameZh } as never, locale)}
          </footer>
        </div>
      ) : null}
    </Modal>
  );
}
