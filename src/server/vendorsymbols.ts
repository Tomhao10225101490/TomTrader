import type { AssetType,CurrencyCode,ExchangeCode,MarketCode } from './types';

/**
 * Vendor exchange-code normalization.
 *
 * Every provider names venues differently (`NGS`, `HKG`, `SHH`, `TYO`, `erx`…),
 * and the same instrument id can be quoted on several venues. TomTrader's
 * instrument identity is `(assetType, market, displaySymbol)`, so vendor codes
 * must be resolved to our own enum before an id is ever written to disk.
 */

const EXCH_BY_VENDOR: Record<string, { exchange: ExchangeCode; market: MarketCode }> = {
  // United States
  nas: { exchange: 'XNAS', market: 'US' },
  nasdaqcm: { exchange: 'XNAS', market: 'US' },
  nasdaqgm: { exchange: 'XNAS', market: 'US' },
  nasdaqgs: { exchange: 'XNAS', market: 'US' },
  ngm: { exchange: 'XNAS', market: 'US' },
  ngs: { exchange: 'XNAS', market: 'US' },
  ncm: { exchange: 'XNAS', market: 'US' },
  nms: { exchange: 'XNAS', market: 'US' },
  nyq: { exchange: 'XNYS', market: 'US' },
  nyse: { exchange: 'XNYS', market: 'US' },
  arca: { exchange: 'ARCX', market: 'US' },
  arcx: { exchange: 'ARCX', market: 'US' },
  pac: { exchange: 'ARCX', market: 'US' },
  pin: { exchange: 'ARCX', market: 'US' },
  otc: { exchange: 'OTC', market: 'US' },
  pink: { exchange: 'OTC', market: 'US' },
  pnk: { exchange: 'OTC', market: 'US' },
  // China
  shh: { exchange: 'CNE', market: 'CN' },
  shenzhen: { exchange: 'XSHE', market: 'CN' },
  she: { exchange: 'XSHE', market: 'CN' },
  // Hong Kong
  hkg: { exchange: 'HKEX', market: 'HK' },
  hkex: { exchange: 'HKEX', market: 'HK' },
  // Japan
  tyo: { exchange: 'XTKS', market: 'JP' },
  tok: { exchange: 'XTKS', market: 'JP' },
  osa: { exchange: 'XTKS', market: 'JP' },
  ngo: { exchange: 'XTKS', market: 'JP' },
  // Korea
  krx: { exchange: 'KRX', market: 'KR' },
  seu: { exchange: 'KRX', market: 'KR' },
  // Taiwan
  tai: { exchange: 'TWSE', market: 'TW' },
  tse: { exchange: 'TWSE', market: 'TW' },
  roi: { exchange: 'TWSE', market: 'TW' },
  // India
  nsi: { exchange: 'NSE', market: 'IN' },
  bom: { exchange: 'BSE', market: 'IN' },
  // Australia
  asx: { exchange: 'ASX', market: 'AU' },
  // Germany
  erx: { exchange: 'XETRA', market: 'DE' },
  xet: { exchange: 'XETRA', market: 'DE' },
  gru: { exchange: 'XETRA', market: 'DE' },
  muc: { exchange: 'XETRA', market: 'DE' },
  ber: { exchange: 'XETRA', market: 'DE' },
  stu: { exchange: 'XETRA', market: 'DE' },
  fra: { exchange: 'XETRA', market: 'DE' },
  // Europe (index / multilateral)
  eur: { exchange: 'XEUR', market: 'EU' },
  par: { exchange: 'XPAF', market: 'FR' },
  dbe: { exchange: 'XPAF', market: 'FR' },
  'epa': { exchange: 'XPAF', market: 'FR' },
  ami: { exchange: 'XPAF', market: 'FR' },
  // UK
  lse: { exchange: 'XLON', market: 'GB' },
  lnd: { exchange: 'XLON', market: 'GB' },
  ioe: { exchange: 'XLON', market: 'GB' },
  asl: { exchange: 'XLON', market: 'GB' },
  // Brazil
  sao: { exchange: 'BVMF', market: 'BR' },
  bvmf: { exchange: 'BVMF', market: 'BR' },
};

const NAME_HINTS: [RegExp, ExchangeCode, MarketCode][] = [
  [/shanghai/i, 'CNE', 'CN'],
  [/shenzhen/i, 'XSHE', 'CN'],
  [/hong\s*kong|hkex/i, 'HKEX', 'HK'],
  [/tokyo/i, 'XTKS', 'JP'],
  [/korea|kosdaq/i, 'KRX', 'KR'],
  [/taiwan|taipei/i, 'TWSE', 'TW'],
  [/national stock exchange of india|\bNSE\b/i, 'NSE', 'IN'],
  [/bombay/i, 'BSE', 'IN'],
  [/australia|\bASX\b/i, 'ASX', 'AU'],
  [/xetra|deutsche|frankfurt/i, 'XETRA', 'DE'],
  [/euronext paris|paris|\bEPA\b/i, 'XPAF', 'FR'],
  [/euronext|stoxx|eurex/i, 'XEUR', 'EU'],
  [/london/i, 'XLON', 'GB'],
  [/b3|brazil|s[aã]o paulo/i, 'BVMF', 'BR'],
  [/new york|nyse/i, 'XNYS', 'US'],
  [/nasdaq/i, 'XNAS', 'US'],
];

export function resolveVendorExchange(vendorCode?: string, vendorName?: string): { exchange: ExchangeCode; market: MarketCode } | null {
  if (vendorCode) {
    const hit = EXCH_BY_VENDOR[vendorCode.toLowerCase()];
    if (hit) return hit;
  }
  if (vendorName) {
    for (const [re, exchange, market] of NAME_HINTS) {
      if (re.test(vendorName)) return { exchange, market };
    }
  }
  return null;
}

export function currencyForMarket(market: MarketCode): CurrencyCode {
  switch (market) {
    case 'US':
      return 'USD';
    case 'CN':
      return 'CNY';
    case 'HK':
      return 'HKD';
    case 'JP':
      return 'JPY';
    case 'KR':
      return 'KRW';
    case 'TW':
      return 'TWD';
    case 'IN':
      return 'INR';
    case 'AU':
      return 'AUD';
    case 'DE':
    case 'EU':
    case 'FR':
    case 'NL':
      return 'EUR';
    case 'GB':
      return 'GBP';
    case 'BR':
      return 'BRL';
    case 'FX':
      return 'USD';
  }
}

/** Yahoo quotes Chinese A-shares as `CNY` but occasionally as `RMB`/`SHB`. */
export function normalizeCurrency(raw: string | undefined, fallback: CurrencyCode): CurrencyCode {
  if (!raw) return fallback;
  const up = raw.toUpperCase();
  if (up === 'RMB' || up === 'SHB' || up === 'CHY') return 'CNY';
  const known: CurrencyCode[] = ['USD', 'CNY', 'HKD', 'JPY', 'EUR', 'GBP', 'KRW', 'TWD', 'INR', 'AUD', 'BRL'];
  return (known as string[]).includes(up) ? (up as CurrencyCode) : fallback;
}

export function mapVendorAssetType(quoteType: string | undefined): AssetType | null {
  switch (quoteType) {
    case 'EQUITY':
      return 'equity';
    case 'ETF':
      return 'etf';
    case 'INDEX':
      return 'index';
    case 'COMMODITY':
      return 'commodity';
    case 'CURRENCY':
      return 'currency';
    default:
      return null;
  }
}

/** Vendor symbols can contain characters that are unsafe in a URL path. */
/**
 * Instrument id grammar: `<assetType>:<market>:<symbol>`.
 *
 * The symbol part keeps `=` because vendor spellings for futures are `GC=F`;
 * it still rejects anything with a slash, a quote, a space or angle brackets,
 * which is what makes the id safe to put in a URL path segment and an SQL
 * parameter without a second layer of escaping.
 */
export function assertInstrumentId(id: string): boolean {
  return /^[a-z]+:[A-Z]{2,3}:[A-Za-z0-9^._\-–=]{1,32}$/.test(id);
}

export function makeInstrumentId(assetType: AssetType, market: MarketCode, symbol: string): string {
  return `${assetType}:${market}:${symbol}`;
}
