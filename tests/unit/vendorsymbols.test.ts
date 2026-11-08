import {
assertInstrumentId,
currencyForMarket,
makeInstrumentId,
mapVendorAssetType,
normalizeCurrency,
resolveVendorExchange,
} from '@/server/vendorsymbols';
import { describe,expect,it } from 'vitest';

describe('vendor exchange normalisation', () => {
  it('maps the codes the two vendors actually emit', () => {
    expect(resolveVendorExchange('SHH')).toEqual({ exchange: 'CNE', market: 'CN' });
    expect(resolveVendorExchange('SHE')).toEqual({ exchange: 'XSHE', market: 'CN' });
    expect(resolveVendorExchange('HKG')).toEqual({ exchange: 'HKEX', market: 'HK' });
    expect(resolveVendorExchange('NGS')).toEqual({ exchange: 'XNAS', market: 'US' });
    expect(resolveVendorExchange('NYQ')).toEqual({ exchange: 'XNYS', market: 'US' });
    expect(resolveVendorExchange('TYO')).toEqual({ exchange: 'XTKS', market: 'JP' });
    expect(resolveVendorExchange('ASX')).toEqual({ exchange: 'ASX', market: 'AU' });
    expect(resolveVendorExchange('ERX')).toEqual({ exchange: 'XETRA', market: 'DE' });
  });

  it('falls back to the display name when the code is unknown', () => {
    expect(resolveVendorExchange('ZZZ', 'Korea Exchange')?.exchange).toBe('KRX');
    expect(resolveVendorExchange('???', 'Shanghai Stock Exchange')?.exchange).toBe('CNE');
    expect(resolveVendorExchange('???', 'Euronext Paris')?.exchange).toBe('XPAF');
    expect(resolveVendorExchange(undefined, undefined)).toBeNull();
  });

  it('does not confuse the London and US listings of the same company', () => {
    expect(resolveVendorExchange('LSE')!.market).toBe('GB');
    expect(resolveVendorExchange('NYQ')!.market).toBe('US');
  });
});

describe('currency rules', () => {
  it('assigns the trading currency by market', () => {
    expect(currencyForMarket('CN')).toBe('CNY');
    expect(currencyForMarket('JP')).toBe('JPY');
    expect(currencyForMarket('NL')).toBe('EUR');
    expect(currencyForMarket('BR')).toBe('BRL');
  });

  it('normalises the vendor aliases for renminbi', () => {
    for (const alias of ['RMB', 'SHB', 'CHY']) expect(normalizeCurrency(alias, 'USD')).toBe('CNY');
    expect(normalizeCurrency('usd', 'CNY')).toBe('USD');
    expect(normalizeCurrency('ZAR', 'USD')).toBe('USD');
    expect(normalizeCurrency(undefined, 'HKD')).toBe('HKD');
  });
});

describe('instrument identity', () => {
  it('builds ids that cannot collide across markets', () => {
    expect(makeInstrumentId('equity', 'JP', '7203')).toBe('equity:JP:7203');
    expect(makeInstrumentId('index', 'CN', '000001')).toBe('index:CN:000001');
    expect(makeInstrumentId('equity', 'CN', '000001')).toBe('equity:CN:000001');
  });

  it('accepts the shapes the router must reject or parse', () => {
    expect(assertInstrumentId('equity:HK:00700')).toBe(true);
    expect(assertInstrumentId('index:US:^GSPC')).toBe(true);
    expect(assertInstrumentId('commodity:US:GC=F')).toBe(true);
    expect(assertInstrumentId('equity:US:BRK-B')).toBe(true);
    expect(assertInstrumentId('AAPL')).toBe(false);
    expect(assertInstrumentId('equity:US:')).toBe(false);
    expect(assertInstrumentId('equity:XXXX:AAPL')).toBe(false);
    expect(assertInstrumentId('equity:US:<script>')).toBe(false);
  });

  it('maps vendor asset types and drops the ones TomTrader will not show', () => {
    expect(mapVendorAssetType('EQUITY')).toBe('equity');
    expect(mapVendorAssetType('ETF')).toBe('etf');
    expect(mapVendorAssetType('INDEX')).toBe('index');
    expect(mapVendorAssetType('OPT')).toBeNull();
    expect(mapVendorAssetType('CRYPTOCURRENCY')).toBeNull();
  });
});
