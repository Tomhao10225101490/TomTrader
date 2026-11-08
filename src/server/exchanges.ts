import type { ExchangeCode,ExchangeInfo } from './types';

/**
 * Exchange reference data.
 *
 * Sessions are stored as *exchange-local wall clock* minutes and combined with
 * an IANA timezone, so daylight saving is handled by the timezone database
 * rather than by a fixed offset. All comparisons happen in UTC instants.
 */

export const EXCHANGES: Record<ExchangeCode, ExchangeInfo> = {
  XNYS: {
    code: 'XNYS',
    name: 'New York Stock Exchange',
    nameZh: '纽约证券交易所',
    country: 'United States',
    countryZh: '美国',
    timezone: 'America/New_York',
    city: 'New York',
    currency: 'USD',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: true,
    sessions: [{ openMin: 9 * 60 + 30, closeMin: 16 * 60, preOpenMin: 4 * 60, afterCloseMin: 20 * 60 }],
  },
  XNAS: {
    code: 'XNAS',
    name: 'Nasdaq Stock Market',
    nameZh: '纳斯达克证券交易所',
    country: 'United States',
    countryZh: '美国',
    timezone: 'America/New_York',
    city: 'New York',
    currency: 'USD',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: true,
    sessions: [{ openMin: 9 * 60 + 30, closeMin: 16 * 60, preOpenMin: 4 * 60, afterCloseMin: 20 * 60 }],
  },
  ARCX: {
    code: 'ARCX',
    name: 'NYSE Arca (ETFs)',
    nameZh: '纽交所 Arca（ETF）',
    country: 'United States',
    countryZh: '美国',
    timezone: 'America/New_York',
    city: 'New York',
    currency: 'USD',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: true,
    sessions: [{ openMin: 9 * 60 + 30, closeMin: 16 * 60, preOpenMin: 4 * 60, afterCloseMin: 20 * 60 }],
  },
  CNE: {
    code: 'CNE',
    name: 'Shanghai Stock Exchange',
    nameZh: '上海证券交易所',
    country: 'China (A-shares)',
    countryZh: '中国 A 股',
    timezone: 'Asia/Shanghai',
    city: 'Shanghai',
    currency: 'CNY',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [
      { openMin: 9 * 60 + 30, closeMin: 11 * 60 + 30 },
      { openMin: 13 * 60, closeMin: 15 * 60 },
    ],
  },
  XSHE: {
    code: 'XSHE',
    name: 'Shenzhen Stock Exchange',
    nameZh: '深圳证券交易所',
    country: 'China (A-shares)',
    countryZh: '中国 A 股',
    timezone: 'Asia/Shanghai',
    city: 'Shenzhen',
    currency: 'CNY',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [
      { openMin: 9 * 60 + 30, closeMin: 11 * 60 + 30 },
      { openMin: 13 * 60, closeMin: 15 * 60 },
    ],
  },
  HKEX: {
    code: 'HKEX',
    name: 'Hong Kong Exchange',
    nameZh: '香港交易所',
    country: 'Hong Kong',
    countryZh: '中国香港',
    timezone: 'Asia/Hong_Kong',
    city: 'Hong Kong',
    currency: 'HKD',
    days: [1, 2, 3, 4, 5],
    // HK runs a 09:00–09:30 pre-open call auction and a 16:00–16:10 closing
    // auction; neither is a continuous trading session.
    supportsExtendedHours: true,
    sessions: [
      { openMin: 9 * 60 + 30, closeMin: 12 * 60, preOpenMin: 9 * 60 },
      { openMin: 13 * 60, closeMin: 16 * 60, afterCloseMin: 16 * 60 + 10 },
    ],
  },
  XTKS: {
    code: 'XTKS',
    name: 'Tokyo Stock Exchange',
    nameZh: '东京证券交易所',
    country: 'Japan',
    countryZh: '日本',
    timezone: 'Asia/Tokyo',
    city: 'Tokyo',
    currency: 'JPY',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    // TSE moved the afternoon close to 15:30 in November 2024.
    sessions: [
      { openMin: 9 * 60, closeMin: 11 * 60 + 30 },
      { openMin: 12 * 60 + 30, closeMin: 15 * 60 + 30 },
    ],
  },
  KRX: {
    code: 'KRX',
    name: 'Korea Exchange',
    nameZh: '韩国交易所',
    country: 'South Korea',
    countryZh: '韩国',
    timezone: 'Asia/Seoul',
    city: 'Seoul',
    currency: 'KRW',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60, closeMin: 15 * 60 + 30 }],
  },
  TWSE: {
    code: 'TWSE',
    name: 'Taiwan Stock Exchange',
    nameZh: '台湾证券交易所',
    country: 'Taiwan',
    countryZh: '中国台湾',
    timezone: 'Asia/Taipei',
    city: 'Taipei',
    currency: 'TWD',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60, closeMin: 13 * 60 + 30 }],
  },
  NSE: {
    code: 'NSE',
    name: 'National Stock Exchange of India',
    nameZh: '印度国家证券交易所',
    country: 'India',
    countryZh: '印度',
    timezone: 'Asia/Kolkata',
    city: 'Mumbai',
    currency: 'INR',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60 + 15, closeMin: 15 * 60 + 30 }],
  },
  BSE: {
    code: 'BSE',
    name: 'Bombay Stock Exchange',
    nameZh: '孟买证券交易所',
    country: 'India',
    countryZh: '印度',
    timezone: 'Asia/Kolkata',
    city: 'Mumbai',
    currency: 'INR',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60, closeMin: 15 * 30 }],
  },
  ASX: {
    code: 'ASX',
    name: 'Australian Securities Exchange',
    nameZh: '澳大利亚证券交易所',
    country: 'Australia',
    countryZh: '澳大利亚',
    timezone: 'Australia/Sydney',
    city: 'Sydney',
    currency: 'AUD',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 10 * 60, closeMin: 16 * 60 }],
  },
  XETRA: {
    code: 'XETRA',
    name: 'Deutsche Börse Xetra',
    nameZh: '德国 Xetra',
    country: 'Germany',
    countryZh: '德国',
    timezone: 'Europe/Berlin',
    city: 'Frankfurt',
    currency: 'EUR',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60, closeMin: 17 * 60 + 30 }],
  },
  XEUR: {
    code: 'XEUR',
    name: 'Eurex / STOXX (European index)',
    nameZh: 'Eurex / STOXX（欧洲指数）',
    country: 'Eurozone',
    countryZh: '欧元区',
    timezone: 'Europe/Berlin',
    city: 'Frankfurt',
    currency: 'EUR',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60, closeMin: 17 * 60 + 30 }],
  },
  XLON: {
    code: 'XLON',
    name: 'London Stock Exchange',
    nameZh: '伦敦证券交易所',
    country: 'United Kingdom',
    countryZh: '英国',
    timezone: 'Europe/London',
    city: 'London',
    currency: 'GBP',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 8 * 60, closeMin: 16 * 60 + 30 }],
  },
  XPAF: {
    code: 'XPAF',
    name: 'Euronext Paris',
    nameZh: '巴黎泛欧交易所',
    country: 'France',
    countryZh: '法国',
    timezone: 'Europe/Paris',
    city: 'Paris',
    currency: 'EUR',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60, closeMin: 17 * 60 + 30 }],
  },
  BVMF: {
    code: 'BVMF',
    name: 'B3 — Brasil, Bolsa, Balcão',
    nameZh: '巴西证券交易所 B3',
    country: 'Brazil',
    countryZh: '巴西',
    timezone: 'America/Sao_Paulo',
    city: 'São Paulo',
    currency: 'BRL',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 10 * 60, closeMin: 17 * 60 }],
  },
  OTC: {
    code: 'OTC',
    name: 'Over-the-counter',
    nameZh: '场外市场',
    country: '—',
    countryZh: '—',
    timezone: 'America/New_York',
    city: '—',
    currency: 'USD',
    days: [1, 2, 3, 4, 5],
    supportsExtendedHours: false,
    sessions: [{ openMin: 9 * 60 + 30, closeMin: 16 * 60 }],
  },
};

/** Index/concept feeds whose "exchange" is really a calculation venue. */
export const MARKET_TO_EXCHANGE: Record<string, ExchangeCode> = {
  US: 'XNYS',
  CN: 'CNE',
  HK: 'HKEX',
  JP: 'XTKS',
  KR: 'KRX',
  TW: 'TWSE',
  IN: 'NSE',
  AU: 'ASX',
  DE: 'XETRA',
  EU: 'XEUR',
  GB: 'XLON',
  FR: 'XPAF',
  BR: 'BVMF',
  FX: 'OTC',
};

export function exchangeFor(code: ExchangeCode): ExchangeInfo {
  return EXCHANGES[code];
}

/** Exchanges rendered on the Global Market Clock timeline. */
export const CLOCK_EXCHANGES: ExchangeCode[] = [
  'XNYS', // New York
  'XLON', // London
  'XETRA', // Frankfurt
  'XEUR', // Europe (STOXX)
  'XPAF', // Paris
  'HKEX', // Hong Kong
  'CNE', // Shanghai
  'XTKS', // Tokyo
  'KRX', // Seoul
  'TWSE', // Taipei
  'ASX', // Sydney
  'NSE', // Mumbai
  'BVMF', // São Paulo
];

/** Cities shown in the headline clock strip, the ones users scan first. */
export const PRIMARY_CLOCK_EXCHANGES: ExchangeCode[] = ['XNYS', 'XLON', 'XETRA', 'HKEX', 'CNE', 'XTKS', 'ASX'];
