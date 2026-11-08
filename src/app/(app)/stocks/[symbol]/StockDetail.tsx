'use client';
import { usePrefs } from '@/stores/prefs';
import { Picker } from '@/app/(app)/watchlist/page';
import { PriceChart } from '@/components/charts/PriceChart';
import { Block } from '@/components/Page';
import { ChangeText,PriceText,QualityBadge,StampLine,StateBadge,displayName } from '@/components/quote';
import { Button,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { EMPTY,formatMarketCap,formatPercent,formatPrice,formatValue,formatVolume,formatVolumePrecise } from '@/lib/format';
import { assetLabel,marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import { useInterest } from '@/lib/useInterest';
import type { BarRange,ExchangeCode,Instrument,MarketStatus } from '@/server/types';
import type { BarsResponse,DetailResponse } from '@/shared/api';
import { useLive } from '@/stores/live';
import { useUserData } from '@/stores/userdata';
import { ArrowLeft,Bell,BookmarkCheck,BookmarkPlus,ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback,useEffect,useMemo,useState } from 'react';


/**
 * Instrument detail.
 *
 * The header answers the five questions a trader has in order — what is it,
 * what is it worth now, how has it moved, is that number current, and is the
 * venue open. Fundamentals that no provider supplied stay visibly absent: the
 * metric is either shown with its source timestamp or replaced with an
 * explicit "unavailable", never a zero.
 */
export function StockDetail({
  instrumentId,
  initialStatus,
  candidates,
}: {
  instrumentId: string;
  initialStatus?: MarketStatus;
  candidates?: Instrument[];
}) {
  const { t, locale, zoneOf } = useI18n();
  const refreshPolicy = usePrefs((s) => s.refreshPolicy);
  const [range, setRange] = useState<BarRange>('3M');
  const [pickOpen, setPickOpen] = useState(false);
  const snapshots = useLive((s) => s.snapshots);
  const groups = useUserData((s) => s.groups);
  const addSymbol = useUserData((s) => s.addSymbol);
  const activeGroupId = useUserData((s) => s.activeGroupId);

  const detail = useAsync(
    useCallback(async () => (await api.detail(instrumentId)).data as DetailResponse | null, [instrumentId]),
    [instrumentId],
  );
  const bars = useAsync(
    useCallback(async () => (await api.bars(instrumentId, range)).data as BarsResponse | null, [instrumentId, range]),
    [instrumentId, range],
  );

  const reloadBars = bars.reload;
  useEffect(() => {
    if (refreshPolicy === 'off') return;
    const timer = setInterval(() => { if (!document.hidden) reloadBars(); }, 60_000);
    const catchUp = () => { if (!document.hidden) reloadBars(); };
    document.addEventListener('visibilitychange', catchUp);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', catchUp); };
  }, [reloadBars, refreshPolicy, instrumentId, range]);

  useInterest([instrumentId]);

  const instrument = detail.data?.instrument ?? null;
  const live = snapshots[instrumentId];
  const snapshot = live ?? detail.data?.snapshot ?? null;
  const quote = snapshot?.quote ?? null;
  const meta = detail.data?.metadata ?? null;
  /**
   * A well-formed id can still name something no provider covers — a typo, a
   * delisted line, or a vendor gap. Showing a page of em dashes would imply the
   * instrument exists but is stale, so this state says so plainly instead.
   */
  const nothingToShow =
    Boolean(instrument) &&
    !detail.loading &&
    !quote &&
    !meta &&
    !bars.loading &&
    !bars.data?.series;

  useEffect(() => {
    void useUserData.getState().load();
  }, []);

  const inList = useMemo(() => groups.some((g) => g.instrumentIds.includes(instrumentId)), [groups, instrumentId]);

  if (candidates && candidates.length > 1) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-8">
        <h1 className="text-[17px] font-semibold text-ink">{locale === 'zh' ? '这个代码对应多个市场' : 'This symbol resolves to more than one venue'}</h1>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          {locale === 'zh' ? 'TomTrader 不会猜测你指的是哪一个。请选择：' : 'TomTrader will not guess which one you meant. Choose:'}
        </p>
        <ul className="mt-4 divide-y divide-line rounded-[var(--t-radius)] border border-line bg-surface">
          {candidates.map((c) => (
            <li key={c.id}>
              <Link href={`/stocks/${encodeURIComponent(c.id)}`} className="flex items-center gap-3 px-3 py-2.5 no-underline hover:bg-surface-alt">
                <span className="num w-[92px] text-[13px] font-semibold text-ink">{c.displaySymbol}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-secondary">{displayName(c, locale)}</span>
                <span className="text-[11px] text-ink-muted">{marketName(locale, c.market)} · {c.currency}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (detail.loading && !instrument) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  if (nothingToShow && instrument?.name === instrument?.displaySymbol) {
    return (
      <div className="mx-auto max-w-[620px] px-4 py-16 text-center">
        <h1 className="text-[16px] font-semibold text-ink">{t('detail.noDataTitle')}</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{t('detail.noDataBody')}</p>
        <p className="num mt-3 break-all text-[11px] text-ink-faint">{instrumentId}</p>
        <p className="num mt-1 text-[11px] text-ink-faint">{detail.data?.metadataIssue ?? ''}</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button size="sm" variant="primary" onClick={() => { detail.reload(); bars.reload(); }}>
            {t('common.retry')}
          </Button>
          <Link href="/" className="inline-flex items-center gap-1 text-[12px] text-accent">
            <ArrowLeft size={12} /> {t('common.back')}
          </Link>
        </div>
      </div>
    );
  }

  if (!instrument) {
    // A failed request and an unknown identifier are different facts, and
    // conflating them would tell a user a real security does not exist.
    const unknown = detail.data !== null || (detail.error ?? '').includes('unknown-instrument');
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center">
        <h1 className="text-[16px] font-semibold text-ink">{unknown ? t('common.notFound') : t('common.error')}</h1>
        <p className="mt-1 text-[12.5px] text-ink-muted">{unknown ? t('common.notFoundBody') : t('common.errorBody')}</p>
        <p className="num mt-3 break-all text-[11px] text-ink-faint">{instrumentId}</p>
        {detail.error && !unknown ? <p className="num mt-2 text-[11px] text-[var(--t-warn)]">{detail.error}</p> : null}
        <div className="mt-4 flex items-center justify-center gap-3">
          {!unknown ? (
            <Button size="sm" variant="primary" onClick={detail.reload}>
              {t('common.retry')}
            </Button>
          ) : null}
          <Link href="/" className="inline-flex items-center gap-1 text-[12px] text-accent">
            <ArrowLeft size={12} /> {t('common.back')}
          </Link>
        </div>
      </div>
    );
  }


  return (
    <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-4 px-4 py-4 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-ink-muted">
            <Link href="/" className="inline-flex items-center gap-1 no-underline hover:text-accent">
              <ArrowLeft size={11} /> {t('app.overview')}
            </Link>
            <span>·</span>
            <span>{marketName(locale, instrument.market)}</span>
            <span>·</span>
            <span>{assetLabel(locale, instrument.assetType)}</span>
            <span>·</span>
            <span className="num">{instrument.exchange}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-1">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{displayName(instrument, locale)}</h1>
            <span className="num text-[13px] text-ink-muted">{instrument.displaySymbol}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            <PriceText snapshot={snapshot} size="xl" />
            <div className="flex items-end gap-2 pb-[3px]">
              <ChangeText snapshot={snapshot} size="lg" absolute />
              <span className="num pb-[2px] text-[11px] text-ink-faint">{instrument.currency}</span>
            </div>
            <div className="flex flex-col gap-1 pb-1">
              <StateBadge status={snapshot?.status ?? initialStatus} showReason />
              <div className="flex items-center gap-2">
                <QualityBadge snapshot={snapshot} />
                <StampLine snapshot={snapshot} exchange={instrument.exchange} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={inList ? 'default' : 'primary'}
            onClick={async () => {
              if (inList) return;
              const group = groups.find((g) => g.id === activeGroupId) ?? groups[0];
              if (!group) {
                setPickOpen(true);
                return;
              }
              await addSymbol(group.id, instrument.id);
            }}
          >
            {inList ? <BookmarkCheck size={12} /> : <BookmarkPlus size={12} />}
            {inList ? t('detail.addedToWatchlist') : t('detail.addToWatchlist')}
          </Button>
          <Link href={`/alerts?symbol=${encodeURIComponent(instrument.id)}`} className="inline-flex h-[30px] items-center gap-1.5 rounded-[var(--t-radius-sm)] border border-line bg-surface px-2.5 text-[13px] font-medium text-ink-secondary no-underline hover:border-line-strong hover:text-ink">
            <Bell size={12} /> {t('detail.setAlert')}
          </Link>
          <Picker open={pickOpen} onClose={() => setPickOpen(false)} onPick={async (id) => { const g = groups[0]; if (g) await addSymbol(g.id, id); setPickOpen(false); }} />
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Block flush className="p-3">
            <PriceChart
              response={bars.data}
              loading={bars.loading}
              error={bars.error}
              range={range}
              onRange={setRange}
              exchange={instrument.exchange as ExchangeCode}
              instrument={instrument}
              onRetry={bars.reload}
              height={typeof window === 'undefined' ? 380 : Math.max(280, Math.min(460, window.innerHeight - 420))}
            />
          </Block>

          <div className="grid gap-4 sm:grid-cols-2">
            <Block title={t('detail.tradingView')}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 text-[12px]">
                <Metric label={t('detail.open')} value={formatPrice(quote?.open ?? null, instrument, locale, { symbol: false })?.text ?? EMPTY} />
                <Metric label={t('detail.previousClose')} value={formatPrice(quote?.previousClose ?? null, instrument, locale, { symbol: false })?.text ?? EMPTY} />
                <Metric label={t('detail.volume')} value={formatVolumePrecise(quote?.volume ?? null, locale)} />
                <Metric label={t('detail.avgVolume')} value={formatVolume(meta?.averageVolume ?? null, locale)} />
              </dl>
              <div className="border-t border-line px-3 py-2.5">
                <RangeBar label={t('detail.dayRange')} low={quote?.dayLow ?? null} high={quote?.dayHigh ?? null} last={quote?.last ?? null} lowLabel={formatPrice(quote?.dayLow ?? null, instrument, locale, { symbol: false })?.text} highLabel={formatPrice(quote?.dayHigh ?? null, instrument, locale, { symbol: false })?.text} />
              </div>
              <div className="border-t border-line px-3 py-2.5">
                <RangeBar label={t('detail.weekRange')} low={meta?.week52Low ?? null} high={meta?.week52High ?? null} last={quote?.last ?? null} lowLabel={formatPrice(meta?.week52Low ?? null, instrument, locale, { symbol: false })?.text} highLabel={formatPrice(meta?.week52High ?? null, instrument, locale, { symbol: false })?.text} />
              </div>
            </Block>

            <Block title={t('detail.overview')} subtitle={meta ? `source: ${meta.provider}` : undefined}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 text-[12px]">
                <Metric label={t('detail.marketCap')} value={meta?.marketCap ? formatMarketCap(meta.marketCap, instrument.currency, locale) : EMPTY} missing={!meta?.marketCap} />
                <Metric label={t('detail.pe')} value={meta?.peRatio ? formatValue(meta.peRatio, locale, 2) : EMPTY} missing={!meta?.peRatio} />
                <Metric label={t('detail.eps')} value={meta?.eps ? formatValue(meta.eps, locale, 2) : EMPTY} missing={!meta?.eps} />
                <Metric label={t('detail.divYield')} value={meta?.dividendYield !== null && meta?.dividendYield !== undefined ? formatPercent(meta.dividendYield * 100, locale) : EMPTY} missing={meta?.dividendYield == null} />
                <Metric label={t('detail.shares')} value={meta?.sharesOutstanding ? formatVolume(meta.sharesOutstanding, locale) : EMPTY} missing={!meta?.sharesOutstanding} />
                <Metric label={t('detail.sector')} value={meta?.sector ?? instrument.sector ?? EMPTY} missing={!meta?.sector && !instrument.sector} />
              </dl>
              {detail.data?.metadataIssue ? (
                <p className="border-t border-line px-3 py-2 text-[10.5px] leading-relaxed text-[var(--t-warn)]">
                  {t('detail.noFundamentals')}: {detail.data.metadataIssue}
                </p>
              ) : null}
            </Block>
          </div>

          <Block title={t('detail.about')}>
            <div className="flex flex-col gap-2 p-3 text-[12px] leading-relaxed text-ink-secondary">
              {meta?.description ? <p>{meta.description}</p> : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Metric label={t('detail.industry')} value={meta?.industry ?? EMPTY} missing={!meta?.industry} />
                <Metric label={t('detail.hq')} value={meta?.headquarters ?? EMPTY} missing={!meta?.headquarters} />
                <Metric label={t('detail.founded')} value={meta?.founded ? String(meta.founded) : EMPTY} missing={!meta?.founded} />
                <Metric label={t('detail.employees')} value={meta?.employees ? formatValue(meta.employees, locale, 0) : EMPTY} missing={!meta?.employees} />
              </dl>
              {meta?.website ? (
                <a href={meta.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[12px] text-accent">
                  {t('detail.website')} <ExternalLink size={11} />
                </a>
              ) : null}
              <p className="num text-[10.5px] text-ink-faint">
                {t('detail.instrumentId')}: {instrument.id} · {t('detail.currency')}: {instrument.currency} · {t('detail.timezone')}: {zoneOf(instrument.exchange as ExchangeCode)}
              </p>
            </div>
          </Block>
        </div>

        <aside className="flex flex-col gap-4">
          <Block title={locale === 'zh' ? '相关证券' : 'Same market'}>
            {(detail.data?.related ?? []).length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-ink-muted">{EMPTY}</p>
            ) : (
              <div className="divide-y divide-line-faint">
                {(detail.data?.related ?? []).map((snap) => (
                  <Link key={snap.instrument.id} href={`/stocks/${encodeURIComponent(snap.instrument.id)}`} className="flex items-center gap-2 px-3 py-[7px] no-underline hover:bg-surface-alt">
                    <div className="min-w-0 flex-1">
                      <p className="num truncate text-[11.5px] font-medium text-ink">{snap.instrument.displaySymbol}</p>
                      <p className="truncate text-[10.5px] text-ink-faint">{displayName(snap.instrument, locale)}</p>
                    </div>
                    <div className="w-[64px] text-right"><PriceText snapshot={snap} size="sm" /></div>
                    <div className="w-[58px] text-right"><ChangeText snapshot={snap} size="sm" showGlyph={false} /></div>
                  </Link>
                ))}
              </div>
            )}
          </Block>

          <Block title={t('quality.sourceTime')} subtitle={quote ? `${t('quality.provider')}: ${quote.provider}` : undefined}>
            <div className="flex flex-col gap-2 p-3 text-[11.5px]">
              <p className="num text-ink-secondary">{quote?.exchangeTimestamp ? new Date(quote.exchangeTimestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : EMPTY}</p>
              <p className="num text-ink-muted">{t('quality.receivedTime')}: {quote ? new Date(quote.receivedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : EMPTY}</p>
              <p className="text-[10.5px] leading-relaxed text-ink-faint">
                {quote?.session ? `${t('quality.tier')}: ${quote.tier} · session: ${quote.session}` : ''}
              </p>
            </div>
          </Block>
        </aside>
      </div>


    </div>
  );
}

function Metric({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className={`num ${missing ? 'text-ink-faint' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

function RangeBar({
  label,
  low,
  high,
  last,
  lowLabel,
  highLabel,
}: {
  label: string;
  low: number | null | undefined;
  high: number | null | undefined;
  last: number | null;
  lowLabel?: string;
  highLabel?: string;
}) {
  const lo = typeof low === 'number' && Number.isFinite(low) ? low : null;
  const hi = typeof high === 'number' && Number.isFinite(high) ? high : null;
  const pct = lo !== null && hi !== null && last !== null && hi > lo ? Math.max(0, Math.min(100, ((last - lo) / (hi - lo)) * 100)) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-[11px] text-ink">{lowLabel ?? EMPTY}</span>
        <span className="text-[10px] uppercase tracking-[0.05em] text-ink-faint">{label}</span>
        <span className="num text-[11px] text-ink">{highLabel ?? EMPTY}</span>
      </div>
      <div className="relative mt-1.5 h-[3px] rounded-full bg-surface-inset">
        {pct !== null ? <span className="absolute top-[-3px] h-[9px] w-[2px] rounded bg-accent" style={{ left: `${pct}%` }} /> : null}
      </div>
    </div>
  );
}

