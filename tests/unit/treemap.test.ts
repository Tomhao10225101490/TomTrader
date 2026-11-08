import { __internals } from '@/components/charts/Treemap';
import type { HeatmapCell } from '@/shared/api';
import { describe,expect,it } from 'vitest';

const { squarify, layoutHeatmap, quantile } = __internals;

function cell(symbol: string, pct: number, weight: number, source: 'market-cap' | 'equal' = 'market-cap', sector = 'Technology'): HeatmapCell {
  return {
    instrumentId: `equity:US:${symbol}`,
    name: symbol,
    nameZh: null,
    market: 'US',
    sector,
    changePercent: pct,
    last: 100,
    marketCap: source === 'market-cap' ? weight : null,
    weight,
    weightSource: source,
    quality: 'delayed',
  };
}

const RECT = { x: 0, y: 0, w: 800, h: 400 };

describe('squarified treemap', () => {
  it('fills the container exactly', () => {
    const cells = [cell('A', 1, 40), cell('B', -2, 30), cell('C', 0.5, 20), cell('D', -1, 10)];
    const placed = squarify(cells.map((c) => ({ cell: c, weight: c.weight })), RECT) as never as (typeof cells)[number] & { x: number; y: number; w: number; h: number }[];
    const area = (placed as unknown as { w: number; h: number }[]).reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBeCloseTo(RECT.w * RECT.h, 1);
  });

  it('gives tiles area proportional to weight', () => {
    const placed = squarify(
      [cell('BIG', 1, 99), cell('small', 1, 1)].map((c) => ({ cell: c, weight: c.weight })),
      RECT,
    ) as unknown as { w: number; h: number; cell: HeatmapCell }[];
    const byId = new Map(placed.map((p) => [p.cell.instrumentId, p]));
    const big = byId.get('equity:US:BIG')!;
    const small = byId.get('equity:US:small')!;
    expect((big.w * big.h) / (small.w * small.h)).toBeGreaterThan(50);
  });

  it('keeps aspect ratios close to square', () => {
    const weights = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 10, 8];
    const placed = squarify(weights.map((w, i) => ({ cell: cell(`S${i}`, 1, w), weight: w })), RECT) as unknown as { w: number; h: number }[];
    const worst = Math.max(...placed.map((p) => Math.max(p.w / p.h, p.h / p.w)));
    expect(worst).toBeLessThan(8);
  });

  it('never places a tile outside the rectangle', () => {
    const placed = squarify([1, 2, 3, 5, 8, 13, 21].map((w, i) => ({ cell: cell(`X${i}`, 1, w), weight: w })), RECT) as unknown as {
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.x + p.w).toBeLessThanOrEqual(RECT.w + 0.001);
      expect(p.y + p.h).toBeLessThanOrEqual(RECT.h + 0.001);
    }
  });

  it('does not overlap siblings', () => {
    const placed = squarify([8, 4, 4, 2, 2, 1, 1].map((w, i) => ({ cell: cell(`Y${i}`, 1, w), weight: w })), RECT) as unknown as {
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(overlapX * overlapY).toBeLessThan(0.01);
      }
    }
  });

  it('survives degenerate inputs', () => {
    expect(squarify([], RECT)).toEqual([]);
    expect(squarify([{ cell: cell('Z', 1, 0), weight: 0 }], RECT)).toEqual([]);
    expect(squarify([{ cell: cell('Z', 1, 1), weight: 1 }], { x: 0, y: 0, w: 0, h: 100 })).toEqual([]);
  });
});

describe('heatmap layout over real cells', () => {
  it('drops instruments with no change data', () => {
    const withData = [cell('A', 1, 10), cell('B', -2, 20)];
    const missing = cell('C', 0, 30);
    missing.changePercent = null;
    const laid = layoutHeatmap([...withData, missing], RECT, false);
    expect(laid).toHaveLength(2);
  });

  it('uses equal area when the feed had no market cap', () => {
    const cells = [cell('A', 1, 1, 'equal'), cell('B', -2, 1, 'equal'), cell('C', 3, 1, 'equal')];
    const laid = layoutHeatmap(cells, RECT, false);
    const areas = laid.map((p) => p.w * p.h);
    expect(Math.max(...areas) - Math.min(...areas)).toBeLessThan(1);
  });

  it('groups by sector without losing tiles', () => {
    const cells = [
      cell('A', 1, 10, 'market-cap', 'Energy'),
      cell('B', 2, 10, 'market-cap', 'Energy'),
      cell('C', -1, 40, 'market-cap', 'Health Care'),
      cell('D', -3, 5, 'market-cap', 'Utilities'),
    ];
    const laid = layoutHeatmap(cells, RECT, true);
    expect(laid).toHaveLength(4);
  });

  it('computes the legend quantile without exploding on empty input', () => {
    expect(quantile([], 0.95)).toBe(0);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
  });
});
