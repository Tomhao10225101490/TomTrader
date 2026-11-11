'use client';
import { StatusDot } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
digitDiff,
directionGlyph,
directionOf,
EMPTY,
formatAgo,
formatChange,
formatPercent,
formatPrice,
} from '@/lib/format';
import { useFlashDirection,useNow,usePrevious } from '@/lib/hooks';
import { assetLabel,marketName,qualityExplain,qualityLabel,stateLabel,tierLabel } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import type { DataQuality,ExchangeCode,Instrument,MarketStatus } from '@/server/types';
import type { QuoteSnapshot } from '@/shared/api';
import Link from 'next/link';
import { memo,useMemo } from 'react';

/**
 * Quote display atoms.
 *
 * Three rules keep this family honest and calm:
 *  1. Colour is applied to *change*, never to the price itself, and direction
 *     is carried by a glyph and a sign as well as the hue, so the information
 *     survives greyscale, colour-blindness and a printed screenshot.
 *  2. A missing value is an em dash with a reason, never `0`.
 *  3. Each cell states which provider produced it and when, in the label
 *     itself — the freshness badge is not hidden behind a tooltip.
 */

function sizeClass(size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): string {
  switch (size) {
    case 'xs':
      return 'text-[11px]';
    case 'sm':
      return 'text-[12px]';
    case 'md':
      return 'text-[13px]';
    case 'lg':
      return 'text-[18px] font-medium';
    case 'xl':
      return 'text-[34px] leading-[1.05] font-medium tracking-[-0.02em]';
  }
}

export const PriceText = memo(function PriceText({
  snapshot,
  className,
  decimals,
  showSymbol,
  size = 'md',
}: {
  snapshot: QuoteSnapshot | null | undefined;
  className?: string;
  decimals?: number;
  showSymbol?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}) {
  const { locale, t } = useI18n();
  const quote = snapshot?.quote ?? null;
  const instrument = snapshot?.instrument ?? null;
  const value = quote && Number.isFinite(quote.last) ? quote.last : null;

  const formatted = useMemo(() => {
    if (value === null || !instrument) return null;
    return formatPrice(value, instrument, locale, { decimals, symbol: showSymbol })?.text ?? null;
  }, [value, instrument, decimals, showSymbol, locale]);

  const prev = usePrevious(formatted);
  const flash = useFlashDirection(formatted, prev);
  const { stable, changed } = digitDiff(prev, formatted ?? '');

  if (formatted === null) {
    return (
      <span className={cn('num text-ink-faint', sizeClass(size), className)} title={t('common.unavailable')}>
        {EMPTY}
      </span>
    );
  }

  return (
    <span className={cn('num whitespace-nowrap text-ink', sizeClass(size), className)}>
      {stable}
      {changed ? <span className={cn(flash === 'up' && 'flash-up', flash === 'down' && 'flash-down')}>{changed}</span> : null}
    </span>
  );
});

export const ChangeText = memo(function ChangeText({
  snapshot,
  showGlyph = true,
  absolute = false,
  className,
  size = 'md',
}: {
  snapshot: QuoteSnapshot | null | undefined;
  showGlyph?: boolean;
  absolute?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const { locale, convention } = useI18n();
  const quote = snapshot?.quote ?? null;
  if (!quote || quote.changePercent === null || !Number.isFinite(quote.changePercent)) {
    return <span className={cn('num text-ink-faint', sizeClass(size), className)}>{EMPTY}</span>;
  }
  const dir = directionOf(quote);
  // The convention lives entirely in CSS variables: `--t-up` is red in the
  // mainland reading, green in the international one, everywhere at once.
  const tone = dir === 'up' ? 'text-[var(--t-up)]' : dir === 'down' ? 'text-[var(--t-down)]' : 'text-[var(--t-flat)]';
  return (
    <span className={cn('num inline-flex items-baseline justify-end gap-1 whitespace-nowrap', sizeClass(size), tone, className)}>
      {showGlyph ? (
        <span aria-hidden className="text-[0.76em] leading-none">
          {directionGlyph(dir, convention)}
        </span>
      ) : null}
      <span>{formatPercent(quote.changePercent, locale)}</span>
      {absolute ? <span className="text-ink-muted">{formatChange(quote.change, locale)}</span> : null}
    </span>
  );
});

function qualityTone(quality: DataQuality): 'ok' | 'warn' | 'bad' | 'muted' | 'demo' {
  switch (quality) {
    case 'realtime':
      return 'ok';
    case 'delayed':
    case 'end-of-day':
      return 'muted';
    case 'cached':
      return 'warn';
    case 'stale':
      return 'bad';
    case 'demo':
      return 'demo';
    case 'unavailable':
      return 'muted';
  }
}

export const QualityBadge = memo(function QualityBadge({
  snapshot,
  className,
}: {
  snapshot: QuoteSnapshot | null | undefined;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const quality = snapshot?.quote?.quality ?? 'unavailable';
  const tone = qualityTone(quality);
  const title = [
    qualityExplain(locale, quality),
    snapshot?.quote ? `${t('quality.provider')}: ${snapshot.quote.provider}` : null,
    snapshot?.quote ? `${t('quality.tier')}: ${tierLabel(locale, snapshot.quote.tier)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      title={title}
      data-quality={quality}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[2px] border px-1 py-[1px] text-[10px] font-medium uppercase leading-none tracking-[0.04em]',
        tone === 'ok' && 'border-[var(--t-up)]/35 bg-[var(--t-up-soft)] text-[var(--t-up-strong)]',
        tone === 'muted' && 'border-line bg-surface-alt text-ink-muted',
        tone === 'warn' && 'border-[var(--t-warn)]/35 bg-[var(--t-warn-soft)] text-[var(--t-warn)]',
        tone === 'bad' && 'border-[var(--t-down)]/40 bg-[var(--t-down-soft)] text-[var(--t-down-strong)]',
        tone === 'demo' && 'border-[var(--t-warn)] bg-[var(--t-warn-soft)] font-semibold text-[var(--t-warn)]',
        className,
      )}
    >
      {snapshot?.quote ? <span className="normal-case tracking-normal">{({ eastmoney: locale === 'zh' ? '东财' : 'Eastmoney', tencent: locale === 'zh' ? '腾讯' : 'Tencent', yahoo: 'Yahoo', finnhub: 'Finnhub', demo: 'Demo', 'fx-open.er-api': 'FX' } as Record<string, string>)[snapshot.quote.provider] ?? snapshot.quote.provider} · </span> : null}
      {quality === 'delayed' && snapshot?.quote?.tier === 'unverified' ? (locale === 'zh' ? '延迟未核实' : 'Delay unverified') : qualityLabel(locale, quality)}
    </span>
  );
});

const STATE_TONE: Record<MarketStatus['state'], { tone: 'up' | 'down' | 'flat' | 'accent' | 'warn'; pulse: boolean }> = {
  open: { tone: 'up', pulse: true },
  'pre-market': { tone: 'warn', pulse: false },
  'after-hours': { tone: 'warn', pulse: false },
  closed: { tone: 'flat', pulse: false },
  holiday: { tone: 'flat', pulse: false },
  weekend: { tone: 'flat', pulse: false },
  unavailable: { tone: 'flat', pulse: false },
};

export const StateBadge = memo(function StateBadge({
  status,
  showReason = false,
  className,
}: {
  status: Pick<MarketStatus, 'state' | 'reason' | 'isHalfDay'> | null | undefined;
  showReason?: boolean;
  className?: string;
}) {
  const { locale, t } = useI18n();
  if (!status) return <span className={cn('text-[11px] text-ink-faint', className)}>{EMPTY}</span>;
  const tone = STATE_TONE[status.state];
  const isBreak = status.reason === 'Midday session break';
  const label = isBreak ? t('state.midday-break') : stateLabel(locale, status.state);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[11px]', className)}>
      <StatusDot tone={tone.tone} pulse={tone.pulse} />
      <span className={cn('truncate', status.state === 'open' ? 'text-ink-secondary' : 'text-ink-muted')} data-market-state={status.state}>
        {label}
      </span>
      {/* The reason is only worth printing when it says more than the state does. */}
      {showReason && status.reason && !isBreak && !/^Weekend$/i.test(status.reason) ? (
        <span className="truncate text-ink-faint" title={status.reason}>· {status.reason}</span>
      ) : null}
      {status.isHalfDay ? <span className="text-[var(--t-warn)]">{t('clock.halfDay')}</span> : null}
    </span>
  );
});

/**
 * Two timestamps, always distinct: the exchange's own print time, and the
 * moment our server received it. Collapsing the two is how terminals hide
 * staleness, so this component refuses to render only one of them.
 */
export const StampLine = memo(function StampLine({
  snapshot,
  exchange,
  className,
}: {
  snapshot: QuoteSnapshot | null | undefined;
  exchange?: ExchangeCode;
  className?: string;
}) {
  const { locale, t, zoneOf, timeIn } = useI18n();
  const now = useNow(15_000);
  const quote = snapshot?.quote ?? null;
  const zone = zoneOf(exchange);
  const zoneLabel = zone.split('/').pop()?.replace(/_/g, ' ') ?? zone;

  if (!quote || now === null) {
    return (
      <span className={cn('text-[11px] text-ink-faint', className)}>
        {quote ? '\u00a0' : t('quality.unavailable')}
      </span>
    );
  }

  const source = quote.exchangeTimestamp ? quote.exchangeTimestamp * 1000 : null;
  return (
    <span className={cn('num inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-muted', className)}>
      <span title={`${t('quality.sourceTime')} · ${zone}`}>
        {source ? timeIn(source, exchange, { seconds: false, date: true }) : t('common.unknown')}
        <span className="ml-1 text-ink-faint">{zoneLabel}</span>
      </span>
      <span className="text-line-strong">·</span>
      <span title={`${t('quality.receivedTime')} ${timeIn(quote.receivedAt, exchange, { seconds: true })}`}>
        {t('quality.receivedTime')} {formatAgo(quote.receivedAt, now, locale)}
      </span>
    </span>
  );
});

export function Sparkline({
  values,
  direction,
  width = 76,
  height = 20,
  className,
}: {
  values: number[] | null | undefined;
  direction: 'up' | 'down' | 'flat';
  width?: number;
  height?: number;
  className?: string;
}) {
  const path = useMemo(() => {
    if (!values || values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.abs(max) * 0.001 || 1;
    const stepX = width / (values.length - 1);
    const y = (v: number) => height - 1.5 - ((v - min) / span) * (height - 3);
    let d = '';
    values.forEach((v, i) => {
      d += `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${y(v).toFixed(2)}`;
    });
    return { d, area: `${d}L${width.toFixed(2)},${height}L0,${height}Z`, lastX: width, lastY: y(values[values.length - 1]) };
  }, [values, width, height]);

  if (!path) {
    // No series, no line: a flat stroke here would read as "price unchanged".
    return <span className={cn('inline-block shrink-0', className)} style={{ width, height }} aria-hidden />;
  }

  const color = direction === 'up' ? 'var(--t-up)' : direction === 'down' ? 'var(--t-down)' : 'var(--t-flat)';
  return (
    <svg width={width} height={height} className={cn('shrink-0 overflow-visible', className)} aria-hidden focusable="false">
      <path d={path.area} fill={color} opacity={0.1} />
      <path d={path.d} fill="none" stroke={color} strokeWidth={1.15} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={path.lastX} cy={path.lastY} r={1.5} fill={color} />
    </svg>
  );
}

/** Link to a detail page using the stable instrument id, never a bare ticker. */
export function InstrumentLink({
  instrument,
  className,
  children,
}: {
  instrument: Instrument;
  className?: string;
  children?: React.ReactNode;
}) {
  const { locale, t } = useI18n();
  return (
    <Link
      href={stockHref(instrument)}
      prefetch={false}
      className={cn('underline-offset-2 decoration-line-strong hover:underline', className)}
      title={`${instrument.name} · ${marketName(locale, instrument.market)} · ${instrument.currency} · ${assetLabel(locale, instrument.assetType)} · ${t('detail.instrumentId')} ${instrument.id}`}
    >
      {children ?? instrument.displaySymbol}
    </Link>
  );
}

export function stockHref(instrument: Pick<Instrument, 'id'>): string {
  return `/stocks/${encodeURIComponent(instrument.id)}`;
}

export function displayName(instrument: Instrument, locale: 'en' | 'zh'): string {
  return locale === 'zh' && instrument.nameZh ? instrument.nameZh : instrument.name;
}

/**
 * The overview board row: name, price, change, trend, venue state and both
 * timestamps, in one dense line with no card chrome.
 */
export const QuoteBoardRow = memo(function QuoteBoardRow({
  snapshot,
  hideStateIf,
}: {
  snapshot: QuoteSnapshot;
  /**
   * A board groups rows by venue, and the group header already prints that
   * venue's state. Repeating it on every row is noise; so a row stays quiet
   * when its state matches the header's and speaks up when it differs
   * (Shanghai vs Shenzhen, a half day, a holiday on one leg of a joint index).
   */
  hideStateIf?: MarketStatus['state'];
}) {
  const { locale } = useI18n();
  const dir = directionOf(snapshot.quote);
  const unavailable = !snapshot.quote;
  return (
    <div
      data-index-card={snapshot.instrument.id}
      className={
        'grid grid-cols-[minmax(0,1fr)_92px_70px] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_72px_96px_86px] sm:gap-x-3 overflow-hidden border-t border-line-faint px-3 py-[6px] first:border-t-0 hover:bg-surface-alt' +
        (unavailable ? ' opacity-70' : '')
      }
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <InstrumentLink
          instrument={snapshot.instrument}
          className="min-w-0 truncate text-[13px] font-medium text-ink no-underline hover:text-accent"
        >
          {displayName(snapshot.instrument, locale)}
        </InstrumentLink>
        <span className="num hidden shrink-0 text-[10.5px] uppercase sm:inline tracking-[0.03em] text-ink-faint">
          {snapshot.instrument.displaySymbol}
        </span>
      </div>
      <div className="hidden justify-end sm:flex">
        <Sparkline values={snapshot.sparkline} direction={dir} width={72} height={17} />
      </div>
      <div className="min-w-0 text-right" data-price={snapshot.instrument.id}>
        <PriceText snapshot={snapshot} />
      </div>
      <div className="min-w-0 text-right">
        <ChangeText snapshot={snapshot} />
      </div>

      <div className="col-span-3 flex min-w-0 flex-wrap items-center justify-between gap-1 pt-[1px] sm:col-span-4 sm:gap-2">
        {snapshot.status.state === hideStateIf ? (
          <span className="text-[11px] text-ink-faint">{snapshot.sparkline ? '' : '\u00a0'}</span>
        ) : (
          <StateBadge status={snapshot.status} showReason className="min-w-0" />
        )}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:flex-nowrap sm:gap-2">
          <QualityBadge snapshot={snapshot} />
          <StampLine snapshot={snapshot} exchange={snapshot.instrument.exchange} className="w-full justify-end sm:w-auto" />
        </div>
      </div>
    </div>
  );
});
