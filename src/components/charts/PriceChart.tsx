'use client';
import { EmptyState,ErrorState,Segmented,Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBarTime,formatVolumePrecise } from '@/lib/format';
import { useI18n } from '@/lib/i18n-context';
import { tierLabel } from '@/lib/i18n';
import type { Bar,BarInterval,BarRange,Bars,ExchangeCode } from '@/server/types';
import type { BarsResponse } from '@/shared/api';
import {
AreaSeries,
CandlestickSeries,
ColorType,
HistogramSeries,
LineSeries,
createChart,
type AreaData,
type BarData,
type BusinessDay,
type CandlestickData,
type HistogramData,
type IChartApi,
type ISeriesApi,
type TickMarkType,
type Time,
type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect,useMemo,useRef,useState } from 'react';

/**
 * The price chart.
 *
 * Four behaviours matter more here than visuals:
 *
 *  1. True UTC bar instants, formatted per bar in the selected IANA timezone.
 *     Axis and crosshair agree across historical daylight-saving transitions.
 *  2. Live updates never steal your position. Streaming data calls
 *     `series.update()`; `fitContent()` runs only when the instrument or range
 *     changes — a chart that jumps back to the right edge every poll is
 *     unusable.
 *  3. The crosshair legend reads the bar under the cursor, not the last price,
 *     so O/H/L/C/V always describe what you are pointing at.
 *  4. Colours come from the app's CSS variables, so theme and price-convention
 *     switches reach the chart with no re-implementation.
 */

export type ChartKind = 'area' | 'line' | 'candles';

const RANGE_ORDER: BarRange[] = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

interface Palette {
  up: string;
  down: string;
  accent: string;
  grid: string;
  border: string;
  text: string;
  bg: string;
  crosshair: string;
}

export function PriceChart({
  response,
  loading,
  error,
  range,
  onRange,
  exchange,
  instrument,
  onRetry,
  height = 380,
}: {
  response: BarsResponse | null;
  loading: boolean;
  error: string | null;
  range: BarRange;
  onRange: (r: BarRange) => void;
  exchange: ExchangeCode;
  instrument: { displaySymbol: string; name: string; currency: string; assetType: string } | null;
  onRetry?: () => void;
  height?: number;
}) {
  const { locale, resolvedTheme, convention, zoneOf } = useI18n();
  const zone = zoneOf(exchange);
  const [kind, setKind] = useState<ChartKind>(instrument?.assetType === 'index' ? 'area' : 'candles');
  const [showVolume, setShowVolume] = useState(true);
  const [legend, setLegend] = useState<LegendState>({});
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | ISeriesApi<'Line'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lastRenderedKey = useRef<string>('');
  const lastBarTime = useRef<number>(0);

  const series: Bars | null = response?.series ?? null;
  const responseRef = useRef<Bars | null>(null);
  useEffect(() => { responseRef.current = series; }, [series]);
  const intraday = series ? isIntraday(series.interval) : false;
  const hasSeries = Boolean(series);

  const palette = useMemo<Palette>(() => {
    // Same literal design tokens as globals.css; use semantic price convention.
    const dark = resolvedTheme === 'dark';
    const green = dark ? '#4cb17c' : '#177245';
    const red = dark ? '#e4695f' : '#b0342c';
    return {
      up: convention === 'cn' ? red : green,
      down: convention === 'cn' ? green : red,
      accent: dark ? '#6ea3d6' : '#2f5d8a',
      grid: dark ? '#1f242a' : '#ededea',
      border: dark ? '#262b31' : '#e4e4e0',
      text: dark ? '#828a93' : '#767b80',
      bg: dark ? '#16191d' : '#ffffff',
      crosshair: dark ? '#333941' : '#d3d3ce',
    };
  }, [resolvedTheme, convention]);

  /* create/destroy the chart when the palette or bar granularity changes */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: palette.bg }, textColor: palette.text, fontSize: 11 },
      grid: { vertLines: { color: palette.grid, visible: true }, horzLines: { color: palette.grid, visible: true } },
      rightPriceScale: { borderVisible: true, borderColor: palette.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderVisible: true,
        borderColor: palette.border,
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: zone, ...(type <= 2 ? { month: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit', hour12: false }) }).format(businessToSeconds(time) * 1000),
        rightOffset: 5,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: palette.crosshair, style: 2, labelVisible: true },
        horzLine: { color: palette.crosshair, style: 2, labelVisible: true },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true },
      localization: { locale: locale === 'zh' ? 'zh-CN' : 'en-GB', timeFormatter: (time: Time) => formatBarTime(businessToSeconds(time), zone, locale, intraday) },
    });

    const onCrosshair = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
      const main = mainRef.current;
      if (!param.time || !param.point || !main) {
        setLegend({});
        return;
      }
      const bar = param.seriesData.get(main) as Partial<BarData<Time> & { value?: number }> | undefined;
      if (!bar) return;
      const original = responseRef.current?.bars.find((b) => b.time === businessToSeconds(param.time!));
      const vol = volumeRef.current ? (param.seriesData.get(volumeRef.current) as HistogramData | undefined)?.value : undefined;
      setLegend({
        time: typeof param.time === 'number' ? param.time : businessToSeconds(param.time),
        open: original?.open ?? bar.open,
        high: original?.high ?? bar.high,
        low: original?.low ?? bar.low,
        close: original?.close ?? bar.close ?? bar.value,
        volume: original?.volume ?? vol ?? null,
      });
    };
    chart.subscribeCrosshairMove(onCrosshair);

    chartRef.current = chart;
    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      volumeRef.current = null;
      lastRenderedKey.current = '';
    };
  }, [palette, intraday, locale, hasSeries, zone]);

  /* (re)create series when the drawing kind or volume visibility changes */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (mainRef.current) {
      chart.removeSeries(mainRef.current);
      mainRef.current = null;
    }
    if (volumeRef.current) {
      chart.removeSeries(volumeRef.current);
      volumeRef.current = null;
    }

    if (kind === 'candles') {
      mainRef.current = chart.addSeries(CandlestickSeries, {
        upColor: palette.up,
        downColor: palette.down,
        borderUpColor: palette.up,
        borderDownColor: palette.down,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
      });
    } else if (kind === 'line') {
      mainRef.current = chart.addSeries(LineSeries, { color: palette.accent, lineWidth: 2, priceLineVisible: false });
    } else {
      mainRef.current = chart.addSeries(AreaSeries, {
        lineColor: palette.accent,
        topColor: withAlpha(palette.accent, 0.24),
        bottomColor: withAlpha(palette.accent, 0.02),
        lineWidth: 2,
        priceLineVisible: false,
      });
    }

    if (showVolume) {
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeRef.current = volume;
    }
    // Series objects must be rebuilt before data can be pushed into them.
    lastRenderedKey.current = '';
  }, [kind, showVolume, palette, intraday, hasSeries, zone, locale]);

  /* data */
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainRef.current;
    const volume = volumeRef.current;
    if (!chart || !main || !series || series.bars.length === 0) return;

    const offsetMinutes = response?.axisOffsetMinutes ?? 0;
    const daily = !isIntraday(series.interval);
    const key = `${series.instrumentId}|${series.range}|${series.interval}|${kind}`;

    if (key !== lastRenderedKey.current) {
      main.setData(buildMainData(series.bars, kind, daily, offsetMinutes) as never);
      if (volume) volume.setData(buildVolumeData(series.bars, daily, offsetMinutes, palette) as never);
      lastRenderedKey.current = key;
      lastBarTime.current = series.bars.at(-1)?.time ?? 0;
      chart.timeScale().fitContent();
    } else {
      // Include every bar received since the last refresh, including catch-up after a hidden tab.
      for (const bar of series.bars) {
        if (bar.time < lastBarTime.current) continue;
        main.update(buildPoint(bar, kind, daily, offsetMinutes) as never);
        if (volume && bar.volume !== null && bar.volume !== undefined) {
          volume.update({ time: timeFor(bar.time, daily, offsetMinutes), value: bar.volume,
            color: bar.close >= bar.open ? withAlpha(palette.up, 0.45) : withAlpha(palette.down, 0.45) } as never);
        }
      }
      lastBarTime.current = series.bars.at(-1)?.time ?? lastBarTime.current;
    }
  }, [series, kind, showVolume, palette, intraday, response?.axisOffsetMinutes, zone, locale]);

  const lastBar = series?.bars.at(-1) ?? null;

  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          ariaLabel={locale === 'zh' ? '图表类型' : 'chart type'}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'candles', label: locale === 'zh' ? 'K线' : 'Candles' },
            { value: 'area', label: locale === 'zh' ? '面积' : 'Area' },
            { value: 'line', label: locale === 'zh' ? '折线' : 'Line' },
          ]}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-muted">
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} className="h-3 w-3 accent-[var(--t-accent)]" />
          {locale === 'zh' ? '成交量' : 'Volume'}
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-0.5">
          {RANGE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRange(r)}
              className={cn(
                'num rounded-[3px] px-1.5 py-[3px] text-[11px] font-medium',
                r === range ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
              )}
              aria-current={r === range ? 'true' : undefined}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {loading && !series ? (
        <div className="flex items-center justify-center border border-line bg-surface" style={{ height }}>
          <Spinner label={locale === 'zh' ? '加载历史数据…' : 'Loading history…'} />
        </div>
      ) : error && !series ? (
        <ErrorState
          title={locale === 'zh' ? '历史数据不可用' : 'History unavailable'}
          body={error}
          onRetry={onRetry}
        />
      ) : !series ? (
        <div className="border border-line bg-surface">
          <EmptyState
            title={locale === 'zh' ? '没有可用的历史序列' : 'No historical series available'}
            body={
              locale === 'zh'
                ? '已连接的数据源未提供该证券的历史数据。TomTrader 不会用模拟数据填补空白。'
                : 'The connected providers do not return history for this instrument. TomTrader will not fill the gap with simulated data.'
            }
          />
        </div>
      ) : (
        <>
          <ChartLegend
            legend={legend}
            lastBar={lastBar}
            series={series}
            zone={zone}
            intraday={intraday}
            locale={locale}
            currency={instrument?.currency ?? ''}
          />
          <div
            ref={hostRef}
            className="chart-host border border-line bg-surface"
            style={{ height }}
            role="img"
            aria-label={`${instrument?.displaySymbol ?? ''} ${range} chart, ${series.bars.length} bars`}
          />
          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            {series.meta.provider} · {tierLabel(locale, series.meta.tier)} · {locale === 'zh' ? '末根' : 'Last bar'} {series.meta.lastBarAt === null ? '—' : formatBarTime(series.meta.lastBarAt, zone, locale, intraday)} · {tZoneNote(locale, zone)} · {series.bars.length} {locale === 'zh' ? '根' : 'bars'} · {tAdjustment(locale, series)}
            {response?.issue === 'refresh-failed' ? (
              <span className="ml-2 text-[var(--t-warn)]">{locale === 'zh' ? '刷新失败，显示最后存储的序列' : 'refresh failed — last stored series'}</span>
            ) : null}
          </p>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ points */

interface LegendState {
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number | null;
}

function ChartLegend({
  legend,
  lastBar,
  series,
  zone,
  intraday,
  locale,
  currency,
}: {
  legend: LegendState;
  lastBar: Bar | null;
  series: Bars;
  zone: string;
  intraday: boolean;
  locale: 'en' | 'zh';
  currency: string;
}) {
  const hovering = legend.time !== undefined;
  const shown: { time: number; open?: number; high?: number; low?: number; close?: number; volume?: number | null } = hovering
    ? { ...legend, time: legend.time as number }
    : lastBar ?? { time: 0 };
  if (!hovering && !lastBar) return null;
  const anchor = shown.time;
  const decimals = decimalsFor(series.bars, shown.close ?? lastBar?.close);

  const fmt = (v: number | undefined | null) =>
    v === undefined || v === null || !Number.isFinite(Number(v))
      ? '—'
      : new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(Number(v));

  const items: [string, string][] = [
    [locale === 'zh' ? '时间' : 'Time', formatBarTime(anchor, zone, locale, intraday)],
    [locale === 'zh' ? '开' : 'O', fmt(shown.open)],
    [locale === 'zh' ? '高' : 'H', fmt(shown.high)],
    [locale === 'zh' ? '低' : 'L', fmt(shown.low)],
    [locale === 'zh' ? '收' : 'C', fmt(shown.close)],
    [locale === 'zh' ? '量' : 'Vol', shown.volume === null || shown.volume === undefined ? '—' : formatVolumePrecise(Number(shown.volume), locale)],
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[var(--t-radius-sm)] border border-line bg-surface px-3 py-1.5 text-[11px]">
      <span className="num text-ink-muted">{currency}</span>
      {items.map(([label, value], i) => (
        <span key={label} className={cn('flex items-baseline gap-1', i === 0 && 'mr-1')}>
          <span className="text-ink-faint">{label}</span>
          <span className="num text-ink">{value}</span>
        </span>
      ))}
      {!hovering ? <span className="ml-auto text-[10px] text-ink-faint">{locale === 'zh' ? '悬停查看每根 K 线' : 'hover for a bar'}</span> : null}
    </div>
  );
}

function decimalsFor(bars: Bar[], value?: number): number {
  const sample = value ?? bars.at(-1)?.close ?? 1;
  if (sample >= 10000) return 2;
  if (sample >= 100) return 2;
  if (sample >= 10) return 2;
  if (sample >= 1) return 2;
  return 4;
}

function isIntraday(interval: BarInterval | string): boolean {
  return interval === '1m' || interval === '5m' || interval === '15m' || interval === '1h';
}

/** Chart values retain true UTC instants; axis/legend format each instant in its IANA zone. */
function timeFor(seconds: number, _daily: boolean, _offsetMinutes: number): Time {
  return seconds as UTCTimestamp;
}

function businessToSeconds(time: Time): number {
  if (typeof time === 'number') return time;
  if (typeof time === 'string') return Math.floor(Date.parse(time) / 1000);
  const business = time as BusinessDay;
  return Math.floor(Date.UTC(business.year, business.month - 1, business.day) / 1000);
}

function buildPoint(bar: Bar, kind: ChartKind, daily: boolean, offsetMinutes: number) {
  const time = timeFor(bar.time, daily, offsetMinutes);
  if (kind === 'candles') return { time, open: bar.open, high: bar.high, low: bar.low, close: bar.close } satisfies CandlestickData<Time>;
  return { time, value: bar.close } satisfies AreaData<Time>;
}

function buildMainData(bars: Bar[], kind: ChartKind, daily: boolean, offsetMinutes: number): (CandlestickData<Time> | AreaData<Time>)[] {
  return bars.map((bar) => buildPoint(bar, kind, daily, offsetMinutes));
}

function buildVolumeData(bars: Bar[], daily: boolean, offsetMinutes: number, palette: Palette): HistogramData[] {
  return bars
    .filter((b) => b.volume !== null && b.volume !== undefined)
    .map((b) => ({
      time: timeFor(b.time, daily, offsetMinutes),
      value: b.volume as number,
      color: b.close >= b.open ? withAlpha(palette.up, 0.42) : withAlpha(palette.down, 0.42),
    }));
}

/** Hex → rgba without a colour library; charts need alpha, CSS already has it. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.trim();
  if (value.startsWith('#')) {
    const digits = value.slice(1);
    const full = digits.length === 3 ? digits.split('').map((c) => c + c).join('') : digits;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const fallback = value.includes('rgb') ? value.replace(/,\s*[\d.]+\)$/, `, ${alpha})`) : value;
  return fallback;
}

function tZoneNote(locale: 'en' | 'zh', zone: string): string {
  const city = zone.split('/').pop()?.replace(/_/g, ' ') ?? zone;
  return locale === 'zh' ? `时间轴：${city} 当地时间` : `Axis in ${city} local time`;
}

function tAdjustment(locale: 'en' | 'zh', series: Bars): string {
  const en: Record<string, string> = {
    'split-only': 'split-adjusted',
    'dividend-adjusted': 'dividend + split adjusted',
    raw: 'raw prices',
    unknown: 'adjustment not declared',
  };
  const zh: Record<string, string> = {
    'split-only': '拆股复权',
    'dividend-adjusted': '前复权（含股息）',
    raw: '原始价格',
    unknown: '数据源未说明复权方式',
  };
  const key = series.adjustment in en ? series.adjustment : 'unknown';
  const table = locale === 'zh' ? zh : en;
  return series.adjusted ? table[key] : `${table[key]} · ${locale === 'zh' ? '未复权' : 'unadjusted'}`;
}
