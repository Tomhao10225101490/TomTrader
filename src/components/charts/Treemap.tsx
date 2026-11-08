'use client';
import { cn } from '@/lib/cn';
import { formatMarketCap,formatPercent,formatPrice } from '@/lib/format';
import { useI18n } from '@/lib/i18n-context';
import type { HeatmapCell } from '@/shared/api';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';

/**
 * Market heatmap — a squarified treemap over the instruments a pool actually
 * returned, not a decorative grid of equal squares.
 *
 * Two honesty rules are baked in:
 *  - tile area is market cap when the quote feed has one, and equal-area when
 *    it does not, with the choice printed under the chart (`weightSource`
 *    travels with every cell);
 *  - colour encodes percentage change through the same CSS variables as the
 *    rest of the app, so switching the price convention repaints the map and
 *    the tables identically.
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedCell extends Rect {
  cell: HeatmapCell;
}

export function HeatmapTreemap({
  cells,
  groupBySector,
  height = 440,
  onSelect,
}: {
  cells: HeatmapCell[];
  groupBySector: boolean;
  height?: number;
  onSelect?: (cell: HeatmapCell) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(960);
  const [hover, setHover] = useState<HeatmapCell | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0) setWidth(Math.round(box.width));
    });
    ro.observe(el);
    setWidth(el.clientWidth || 960);
    return () => ro.disconnect();
  }, []);

  const { locale } = useI18n();
  const layout = useMemo(
    () => layoutHeatmap(cells, { x: 0, y: 0, w: width, h: height }, groupBySector),
    [cells, width, height, groupBySector],
  );

  const maxAbs = useMemo(() => {
    const values = cells.map((c) => Math.abs(c.changePercent ?? 0));
    return Math.max(1.5, Math.min(6, quantile(values, 0.95)));
  }, [cells]);

  const place = useCallback(
    (cell: HeatmapCell) => {
      setHover(cell);
      if (onSelect) onSelect(cell);
    },
    [onSelect],
  );

  return (
    <div className="flex flex-col gap-2">
      <div ref={hostRef} className="relative w-full overflow-hidden rounded-[var(--t-radius)] border border-line bg-surface" style={{ height }}>
        {layout.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-ink-muted">
            {locale === 'zh' ? '数据源未返回该市场池的涨跌数据。' : 'The connected providers returned no change data for this pool.'}
          </div>
        ) : null}
        {layout.map(({ cell, x, y, w, h }) => {
          const pct = cell.changePercent ?? 0;
          const tone = toneFor(pct, maxAbs);
          const showName = w > 46 && h > 22;
          const showPct = w > 40 && h > 34;
          return (
            <button
              key={cell.instrumentId}
              type="button"
              data-heatmap-tile={cell.instrumentId}
              onClick={() => place(cell)}
              onMouseEnter={() => setHover(cell)}
              onFocus={() => setHover(cell)}
              onMouseLeave={() => setHover(null)}
              title={cellTitle(cell, locale)}
              className={cn('absolute overflow-hidden p-1 text-left transition-[filter] duration-75 hover:brightness-[1.06] focus-visible:outline-2')}
              style={{
                left: x + 1,
                top: y + 1,
                width: Math.max(0, w - 2),
                height: Math.max(0, h - 2),
                background: tone.background,
                color: tone.foreground,
                borderRadius: 2,
                boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--t-canvas) 55%, transparent)',
              }}
              aria-label={`${cell.name}: ${formatPercent(pct, locale)}`}
            >
              {showName ? (
                <span className="block truncate text-[10.5px] font-semibold leading-tight opacity-95">{cell.name}</span>
              ) : null}
              {showPct ? <span className="num block text-[10px] leading-tight opacity-85">{formatPercent(pct, locale)}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[10.5px] text-ink-faint">
        <Legend maxAbs={maxAbs} />
        <span>
          {hover ? cellTitle(hover, locale) : locale === 'zh' ? '悬停查看明细，点击打开证券' : 'hover for detail, click to open'}
        </span>
      </div>
    </div>
  );
}

function cellTitle(cell: HeatmapCell, locale: 'en' | 'zh'): string {
  const price = cell.last !== null ? formatPrice(cell.last, { assetType: 'equity', currency: cell.market === 'CN' ? 'CNY' : 'USD' } as never, locale, { symbol: false })?.text : '—';
  const cap = cell.marketCap ? formatMarketCap(cell.marketCap, cell.market === 'US' ? 'USD' : cell.market === 'CN' ? 'CNY' : cell.market === 'HK' ? 'HKD' : 'USD', locale) : '—';
  return `${cell.name} · ${formatPercent(cell.changePercent, locale)} · ${price} · cap ${cap} · ${cell.weightSource === 'market-cap' ? (locale === 'zh' ? '面积=市值' : 'area = market cap') : locale === 'zh' ? '等面积（无市值）' : 'equal area (no cap)'}`;
}

function Legend({ maxAbs }: { maxAbs: number }) {
  const { locale } = useI18n();
  const stops = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
  return (
    <span className="flex items-center gap-2">
      <span className="uppercase tracking-[0.05em]">{locale === 'zh' ? '涨跌幅' : 'change'}</span>
      <span className="flex items-center overflow-hidden rounded-[2px]">
        {stops.map((s, i) => (
          <span
            key={i}
            className="num flex h-[14px] w-[42px] items-center justify-center text-[9.5px]"
            style={{ ...toneFor(s, maxAbs), background: toneFor(s, maxAbs).background }}
          >
            {formatPercent(s, locale, { decimals: 1 })}
          </span>
        ))}
      </span>
    </span>
  );
}

function toneFor(pct: number, maxAbs: number): { background: string; foreground: string } {
  const t = Math.max(0, Math.min(1, Math.abs(pct) / maxAbs));
  // A perceptual ramp anchored at the app's own up/down variables: the map
  // changes with the convention switch because the variables do.
  const mix = 8 + t * 72;
  const direction = pct > 0.0001 ? 'up' : pct < -0.0001 ? 'down' : 'flat';
  if (direction === 'flat') {
    return { background: 'var(--t-flat-soft)', foreground: 'var(--t-ink-secondary)' };
  }
  const base = direction === 'up' ? 'var(--t-up)' : 'var(--t-down)';
  const strong = t > 0.55;
  return {
    background: `color-mix(in oklab, ${base} ${mix.toFixed(0)}%, var(--t-surface))`,
    foreground: strong ? '#fff' : 'var(--t-ink)',
  };
}

/* ----------------------------------------------------------- layout */


function weightOf(c: HeatmapCell): number {
  // Market cap when the feed supplied one, otherwise equal tiles — and the
  // cell keeps its `weightSource` so the caption can say which this was.
  return c.weightSource === 'market-cap' && c.weight > 0 ? c.weight : 1;
}

function layoutHeatmap(cells: HeatmapCell[], rect: Rect, groupBySector: boolean): PlacedCell[] {
  const usable = cells.filter((c) => c.changePercent !== null);
  if (!usable.length) return [];

  if (!groupBySector) {
    return squarify(usable.map((cell) => ({ cell, weight: weightOf(cell) })), rect);
  }

  const bySector = new Map<string, HeatmapCell[]>();
  for (const cell of usable) {
    const list = bySector.get(cell.sector) ?? [];
    list.push(cell);
    bySector.set(cell.sector, list);
  }

  const groups = [...bySector.entries()]
    .map(([sector, list]) => ({ sector, list, weight: list.reduce((sum, c) => sum + weightOf(c), 0) }))
    .sort((a, b) => b.weight - a.weight);

  const groupRects = squarify(
    groups.map((g) => ({ cell: g.list[0], weight: g.weight })),
    rect,
  );

  const out: PlacedCell[] = [];
  groupRects.forEach((placed, i) => {
    const group = groups[i];
    if (!group) return;
    const inner: Rect = { x: placed.x + 1, y: placed.y + 1, w: Math.max(0, placed.w - 2), h: Math.max(0, placed.h - 2) };
    const header = inner.w > 70 && inner.h > 44 ? 13 : 0;
    out.push(
      ...squarify(
        group.list.map((cell) => ({ cell, weight: weightOf(cell) })),
        { x: inner.x, y: inner.y + header, w: inner.w, h: Math.max(0, inner.h - header) },
      ),
    );
  });
  return out;
}

/**
 * Squarified treemap (Bruls, Huiling & van Wijk) in ~40 lines.
 *
 * Rows are always laid along the longer remaining edge of the rectangle, which
 * is what drives tile aspect ratios toward 1 and keeps short labels legible on
 * small tiles.
 */
function squarify<T extends { weight: number }>(items: T[], rect: Rect): (T & Rect)[] {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];

  const scale = (rect.w * rect.h) / total;
  let queue = items.map((item) => ({ item, area: Math.max(1e-6, item.weight * scale) })).sort((a, b) => b.area - a.area);

  const out: (T & Rect)[] = [];
  let x = rect.x;
  let y = rect.y;
  let w = rect.w;
  let h = rect.h;

  while (queue.length) {
    const horizontal = w >= h;
    const base = horizontal ? w : h;

    const thicknessOf = (row: typeof queue) => row.reduce((s, r) => s + r.area, 0) / base;
    const worstRatio = (row: typeof queue) => {
      const thickness = thicknessOf(row);
      if (thickness <= 0) return Number.POSITIVE_INFINITY;
      let max = 0;
      let min = Number.POSITIVE_INFINITY;
      for (const entry of row) {
        const side = entry.area / thickness;
        max = Math.max(max, side);
        min = Math.min(min, side);
      }
      return Math.max((thickness * thickness) / (max * max), (max * max) / (thickness * thickness));
    };

    let row: typeof queue = [queue[0]];
    let rest = queue.slice(1);
    while (rest.length && worstRatio([...row, rest[0]]) <= worstRatio(row)) {
      row = [...row, rest[0]];
      rest = rest.slice(1);
    }

    const thickness = thicknessOf(row);
    let offset = 0;
    for (const entry of row) {
      const side = entry.area / thickness;
      if (horizontal) {
        out.push({ ...entry.item, x: x + offset, y, w: side, h: thickness });
        offset += side;
      } else {
        out.push({ ...entry.item, x, y: y + offset, w: thickness, h: side });
        offset += side;
      }
    }

    if (horizontal) {
      y += thickness;
      h = Math.max(0, h - thickness);
    } else {
      x += thickness;
      w = Math.max(0, w - thickness);
    }

    queue = rest;
    if (w < 1 || h < 1) break;
  }

  return out;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[index];
}

export const __internals = { squarify, layoutHeatmap, weightOf, quantile, toneFor };
