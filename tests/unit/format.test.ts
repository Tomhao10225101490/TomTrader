import {
currencySymbol,
decimalsFor,
digitDiff,
directionGlyph,
directionOf,
EMPTY,
formatAgo,
formatChange,
formatClock,
formatMarketCap,
formatPercent,
formatPlain,
formatPrice,
formatVolume,
zoneFor,
} from '@/lib/format';
import { describe,expect,it } from 'vitest';

const equity = { assetType: 'equity' as const, currency: 'USD' as const };
const index = { assetType: 'index' as const, currency: 'USD' as const };

describe('price decimals', () => {
  it('respects zero-decimal currencies for securities but not for indices', () => {
    expect(decimalsFor({ assetType: 'equity', currency: 'JPY' }, 2855)).toBe(0);
    expect(decimalsFor({ assetType: 'equity', currency: 'KRW' }, 82000)).toBe(0);
    expect(decimalsFor({ assetType: 'index', currency: 'KRW' }, 5059.69)).toBe(2);
    expect(decimalsFor({ assetType: 'equity', currency: 'USD' }, 342.37)).toBe(2);
  });

  it('gives FX more precision than equities', () => {
    expect(decimalsFor({ assetType: 'currency', currency: 'USD' }, 1.1143)).toBe(4);
    expect(decimalsFor({ assetType: 'currency', currency: 'JPY' }, 158.369)).toBe(3);
    expect(decimalsFor({ assetType: 'currency', currency: 'USD' }, 1356.675)).toBe(2);
  });

  it('handles sub-dollar and large prices', () => {
    expect(decimalsFor(equity, 0.8734)).toBe(4);
    expect(decimalsFor(equity, 7.42)).toBe(3);
    expect(decimalsFor(equity, 1234.5)).toBe(2);
  });
});

describe('price formatting', () => {
  it('prefixes the currency symbol for securities and indices', () => {
    expect(formatPrice(342.37, equity, 'en')?.text).toBe('$ 342.37');
    expect(formatPrice(3649.18, { assetType: 'index', currency: 'CNY' }, 'zh')?.text).toBe('¥ 3,649.18');
    // JPY and CNY both write ¥, so the product spells the yen out.
    expect(currencySymbol('JPY')).toBe('JP¥');
    expect(formatPrice(2855, { assetType: 'equity', currency: 'JPY' }, 'en', { symbol: true })?.text).toBe('JP¥ 2,855');
  });

  it('never prefixes a currency onto an FX pair or future', () => {
    expect(formatPrice(1.1143, { assetType: 'currency', currency: 'USD' }, 'en')?.text).toBe('1.1143');
    expect(formatPrice(4079.5, { assetType: 'commodity', currency: 'USD' }, 'en')?.text).toBe('4,079.50');
  });

  it('returns null for missing values instead of a zero', () => {
    expect(formatPrice(null, equity, 'en')).toBeNull();
    expect(formatPrice(Number.NaN, equity, 'en')).toBeNull();
    expect(formatPrice(undefined, equity, 'en')).toBeNull();
    expect(formatPlain(null, 'en')).toBe(EMPTY);
  });

  it('groups with the locale’s separators', () => {
    expect(formatPlain(1234567.89, 'zh', 2)).toContain(',');
    expect(formatPrice(1234567.89, index, 'en')?.text).toBe('$ 1,234,567.89');
  });
});

describe('percentage and change', () => {
  it('always carries a sign, so colour is not the only cue', () => {
    expect(formatPercent(0.85, 'en')).toBe('+0.85%');
    expect(formatPercent(-2.57, 'en')).toBe('−2.57%');
    expect(formatPercent(0, 'en')).toBe('0.00%');
    expect(formatChange(-1.8, 'en')).toBe('−1.80');
    expect(formatChange(23.13, 'en')).toBe('+23.13');
  });

  it('drops a decimal for absurd magnitudes rather than overflowing the cell', () => {
    expect(formatPercent(12345.67, 'en')).toBe('+12,345.7%');
  });

  it('is honest about unknown', () => {
    expect(formatPercent(null, 'en')).toBe(EMPTY);
  });

  it('uses a minus sign that is not a hyphen, and a real glyph per direction', () => {
    expect(directionOf({ change: 1, changePercent: 0.3 })).toBe('up');
    expect(directionOf({ change: -1, changePercent: -0.3 })).toBe('down');
    expect(directionOf({ change: 0, changePercent: 0 })).toBe('flat');
    expect(directionOf(null)).toBe('flat');
    expect(directionGlyph('up', 'cn')).toBe('▲');
    expect(directionGlyph('down', 'cn')).toBe('▼');
  });
});

describe('volumes and capitalisation', () => {
  it('compacts in the reader’s grouping system', () => {
    expect(formatVolume(44703806, 'en')).toBe('44.7M');
    // Chinese compact notation groups by 万/亿 — the difference between a
    // translated UI and one that merely relabels buttons.
    expect(formatVolume(44703806, 'zh')).toBe('4470.38万');
    expect(formatVolume(null, 'en')).toBe(EMPTY);
  });

  it('prints market cap with the trading currency', () => {
    expect(formatMarketCap(4.97e12, 'USD', 'en')).toBe('$4.97T');
    expect(formatMarketCap(6.38e13, 'CNY', 'zh')).toContain('万亿');
    expect(formatMarketCap(0, 'USD', 'en')).toBe(EMPTY);
  });
});

describe('time', () => {
  it('renders the same instant in different zones', () => {
    const at = Date.parse('2026-11-06T21:00:00Z');
    expect(formatClock(at, 'America/New_York', 'en')).toMatch(/^04:00/);
    expect(formatClock(at, 'Asia/Shanghai', 'en')).toMatch(/^05:00/);
    expect(formatClock(at, 'UTC', 'en')).toMatch(/^09:00/);
  });

  it('resolves the display zone from the user’s mode', () => {
    expect(zoneFor('utc', 'Asia/Tokyo')).toBe('UTC');
    expect(zoneFor('newyork', 'Asia/Tokyo')).toBe('America/New_York');
    expect(zoneFor('exchange', 'Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(zoneFor('local', 'Asia/Tokyo')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('formats relative age within sensible buckets', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    expect(formatAgo(now - 30_000, now, 'en')).toContain('second');
    expect(formatAgo(now - 5 * 60_000, now, 'en')).toContain('minute');
    expect(formatAgo(now - 3 * 3_600_000, now, 'en')).toContain('hour');
    expect(formatAgo(now - 2 * 86_400_000, now, 'en')).toContain('day');
    expect(formatAgo(now - 5 * 60_000, now, 'zh')).toContain('分钟');
  });
});

describe('digit-level change detection', () => {
  it('splits at the first differing character', () => {
    expect(digitDiff('$ 342.37', '$ 342.38')).toEqual({ stable: '$ 342.3', changed: '8' });
    expect(digitDiff(null, '100.00')).toEqual({ stable: '', changed: '100.00' });
    expect(digitDiff('100.00', '100.00')).toEqual({ stable: '100.00', changed: '' });
  });
});
