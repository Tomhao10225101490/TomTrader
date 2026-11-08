import type { AssetType,CurrencyCode,ExchangeCode,Instrument,MarketCode,ProviderId } from './types';
import { makeInstrumentId } from './vendorsymbols';

/**
 * Curated instrument universe.
 *
 * Two things live here that a vendor API cannot give us cheaply:
 *  1. stable, collision-free identity per instrument (one row, many vendor spellings)
 *  2. coarse sector labels for the heatmap, so grouping does not cost one
 *     fundamentals request per symbol.
 *
 * Sector values are GICS-style broad buckets, curated by hand for this list.
 * Instruments outside the universe get the provider's own sector on the detail
 * page, and the heatmap then groups them as "Unclassified".
 */

interface Row {
  a: AssetType;
  m: MarketCode;
  x: ExchangeCode;
  s: string;
  y?: string;
  e?: string;
  tc?: string;
  c: CurrencyCode;
  n: string;
  zh: string | null;
  sec?: string;
  ind?: string;
  al?: string[];
}

const R = (r: Row): Instrument => ({
  id: makeInstrumentId(r.a, r.m, r.s),
  displaySymbol: r.s,
  vendorSymbol: r.y ?? r.e ?? null,
  providerSymbols: {
    ...(r.y ? { yahoo: r.y } : {}),
    ...(r.e ? { eastmoney: `em:${r.e}` } : {}),
    ...(r.tc ? { tencent: `tc:${r.tc}` } : {}),
  } as Partial<Record<ProviderId, string>>,
  name: r.n,
  nameZh: r.zh,
  assetType: r.a,
  market: r.m,
  exchange: r.x,
  currency: r.c,
  sector: r.sec ?? null,
  industry: r.ind ?? null,
  aliases: r.al ?? [],
});

/* ------------------------------------------------------------------- indices */

const INDICES: Row[] = [
  // United States
  { a: 'index', m: 'US', x: 'XNYS', s: '^GSPC', y: '^GSPC', e: '100.SPX', c: 'USD', n: 'S&P 500', zh: '标普500', al: ['SPX', 'SP500'] },
  { a: 'index', m: 'US', x: 'XNAS', s: '^IXIC', y: '^IXIC', e: '100.NDX', c: 'USD', n: 'Nasdaq Composite', zh: '纳斯达克综合指数', al: ['NASDAQ', 'COMP'] },
  { a: 'index', m: 'US', x: 'XNYS', s: '^DJI', y: '^DJI', e: '100.DJIA', c: 'USD', n: 'Dow Jones Industrial Average', zh: '道琼斯工业平均指数', al: ['DJIA', 'DOW'] },
  { a: 'index', m: 'US', x: 'XNYS', s: '^RUT', y: '^RUT', c: 'USD', n: 'Russell 2000', zh: '罗素2000', al: ['RUT'] },
  { a: 'index', m: 'US', x: 'XNYS', s: '^VIX', y: '^VIX', c: 'USD', n: 'CBOE Volatility Index', zh: '芝加哥期权交易所波动率指数', al: ['VIX', 'VOL'] },

  // China
  { a: 'index', m: 'CN', x: 'CNE', s: '000001', y: '000001.SS', e: '1.000001', c: 'CNY', n: 'SSE Composite', zh: '上证指数', al: ['SHCOMP', '上证'] },
  { a: 'index', m: 'CN', x: 'XSHE', s: '399001', y: '399001.SZ', e: '0.399001', c: 'CNY', n: 'SZSE Component', zh: '深证成指', al: ['SZCE', '深成'] },
  { a: 'index', m: 'CN', x: 'XSHE', s: '399006', y: '399006.SZ', e: '0.399006', c: 'CNY', n: 'ChiNext Index', zh: '创业板指', al: ['CYB'] },
  { a: 'index', m: 'CN', x: 'CNE', s: '000300', y: '000300.SS', e: '1.000300', c: 'CNY', n: 'CSI 300', zh: '沪深300', al: ['CSI300'] },
  { a: 'index', m: 'CN', x: 'CNE', s: '000688', y: '000688.SS', e: '1.000688', c: 'CNY', n: 'STAR 50 (SSE STAR Market)', zh: '科创50', al: ['KC50', 'STAR50'] },

  // Hong Kong
  { a: 'index', m: 'HK', x: 'HKEX', s: '^HSI', y: '^HSI', e: '100.HSI', tc: 'hkHSI', c: 'HKD', n: 'Hang Seng Index', zh: '恒生指数', al: ['HSI', '恒指'] },
  { a: 'index', m: 'HK', x: 'HKEX', s: '^HSTECH', y: '^HSTECH', e: '124.HSTECH', tc: 'hkHSTECH', c: 'HKD', n: 'Hang Seng TECH Index', zh: '恒生科技指数', al: ['HSTECH'] },

  // Japan
  { a: 'index', m: 'JP', x: 'XTKS', s: '^N225', y: '^N225', e: '100.N225', c: 'JPY', n: 'Nikkei 225', zh: '日经225', al: ['NKY'] },
  { a: 'index', m: 'JP', x: 'XTKS', s: '^TPX', y: '^TPX', c: 'JPY', n: 'TOPIX', zh: '东证指数', al: ['TOPX'] },

  // Korea / Taiwan
  { a: 'index', m: 'KR', x: 'KRX', s: '^KS11', y: '^KS11', e: '100.KS11', c: 'KRW', n: 'KOSPI Composite', zh: '韩国综合指数', al: ['KOSPI'] },
  { a: 'index', m: 'NL', x: 'XEUR', s: '^AEX', y: '^AEX', e: '100.AEX', c: 'EUR', n: 'AEX (Euronext Amsterdam)', zh: '荷兰AEX', al: ['AEX'] },
  { a: 'index', m: 'TW', x: 'TWSE', s: '^TWII', y: '^TWII', e: '100.TWII', c: 'TWD', n: 'TAIEX', zh: '台湾加权指数', al: ['TAIEX', '加权'] },

  // Europe
  { a: 'index', m: 'EU', x: 'XEUR', s: '^STOXX', y: '^STOXX', e: '100.SX5E', c: 'EUR', n: 'STOXX 50', zh: '欧洲STOXX50', al: ['STOXX50'] },
  { a: 'index', m: 'EU', x: 'XEUR', s: '^SXXP', y: '^SXXP', e: '100.SXXP', c: 'EUR', n: 'STOXX Europe 600', zh: '欧洲STOXX600', al: ['SXXP', 'STOXX600'] },
  { a: 'index', m: 'DE', x: 'XETRA', s: '^GDAXI', y: '^GDAXI', e: '100.GDAXI', c: 'EUR', n: 'DAX', zh: '德国DAX', al: ['DAX', 'DAX30'] },
  { a: 'index', m: 'GB', x: 'XLON', s: '^FTSE', y: '^FTSE', e: '100.FTSE', tc: 'ukUKX', c: 'GBP', n: 'FTSE 100', zh: '英国富时100', al: ['UKX', 'FTSE'] },
  { a: 'index', m: 'FR', x: 'XPAF', s: '^FCHI', y: '^FCHI', e: '100.FCHI', c: 'EUR', n: 'CAC 40', zh: '法国CAC40', al: ['CAC'] },

  // Other
  { a: 'index', m: 'AU', x: 'ASX', s: '^AXJO', y: '^AXJO', e: '100.AS51', c: 'AUD', n: 'S&P/ASX 200', zh: '澳证200', al: ['ASX200'] },
  { a: 'index', m: 'IN', x: 'NSE', s: '^NSEI', y: '^NSEI', c: 'INR', n: 'NIFTY 50', zh: '印度NIFTY50', al: ['NIFTY'] },
  { a: 'index', m: 'IN', x: 'BSE', s: '^BSESN', y: '^BSESN', e: '100.SENSEX', c: 'INR', n: 'BSE SENSEX', zh: '印度孟买SENSEX', al: ['SENSEX'] },
  { a: 'index', m: 'BR', x: 'BVMF', s: '^BVSP', y: '^BVSP', e: '100.BVSP', c: 'BRL', n: 'Bovespa (Ibovespa)', zh: '巴西BOVESPA', al: ['IBOV', 'BOVESPA'] },
];

/* --------------------------------------------------------------------- equities */

const US_EQ: Row[] = [
  { a: 'equity', m: 'US', x: 'XNAS', s: 'AAPL', y: 'AAPL', e: '105.AAPL', c: 'USD', n: 'Apple', zh: '苹果', sec: 'Information Technology', ind: 'Consumer Electronics', al: ['AAPL.US'] },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'MSFT', y: 'MSFT', e: '105.MSFT', c: 'USD', n: 'Microsoft', zh: '微软', sec: 'Information Technology', ind: 'Software' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'NVDA', y: 'NVDA', e: '105.NVDA', c: 'USD', n: 'NVIDIA', zh: '英伟达', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'GOOGL', y: 'GOOGL', e: '105.GOOGL', c: 'USD', n: 'Alphabet (Class A)', zh: '谷歌-A', sec: 'Communication Services', ind: 'Internet Content' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'META', y: 'META', e: '105.META', c: 'USD', n: 'Meta Platforms', zh: 'Meta（Facebook）', sec: 'Communication Services', ind: 'Internet Content' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'TSLA', y: 'TSLA', e: '105.TSLA', c: 'USD', n: 'Tesla', zh: '特斯拉', sec: 'Consumer Discretionary', ind: 'Automobiles' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'AMZN', y: 'AMZN', e: '105.AMZN', c: 'USD', n: 'Amazon', zh: '亚马逊', sec: 'Consumer Discretionary', ind: 'Broadline Retail' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'AVGO', y: 'AVGO', e: '105.AVGO', c: 'USD', n: 'Broadcom', zh: '博通', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'AMD', y: 'AMD', e: '105.AMD', c: 'USD', n: 'Advanced Micro Devices', zh: '超微半导体', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'INTC', y: 'INTC', e: '105.INTC', c: 'USD', n: 'Intel', zh: '英特尔', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'NFLX', y: 'NFLX', e: '105.NFLX', c: 'USD', n: 'Netflix', zh: '奈飞', sec: 'Communication Services', ind: 'Entertainment' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'COST', y: 'COST', e: '105.COST', c: 'USD', n: 'Costco Wholesale', zh: '好市多', sec: 'Consumer Staples', ind: 'Heavy Retail' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'JPM', y: 'JPM', e: '106.JPM', c: 'USD', n: 'JPMorgan Chase', zh: '摩根大通', sec: 'Financials', ind: 'Banks' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'GS', y: 'GS', e: '106.GS', c: 'USD', n: 'Goldman Sachs', zh: '高盛', sec: 'Financials', ind: 'Capital Markets' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'BRK-B', y: 'BRK-B', e: '106.BRK-B', c: 'USD', n: 'Berkshire Hathaway (Class B)', zh: '伯克希尔·哈撒韦-B', sec: 'Financials', ind: 'Multi-Line Insurance' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'XOM', y: 'XOM', e: '106.XOM', c: 'USD', n: 'Exxon Mobil', zh: '埃克森美孚', sec: 'Energy', ind: 'Integrated Oil' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'WMT', y: 'WMT', e: '106.WMT', c: 'USD', n: 'Walmart', zh: '沃尔玛', sec: 'Consumer Staples', ind: 'Heavy Retail' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'KO', y: 'KO', e: '106.KO', c: 'USD', n: 'Coca-Cola', zh: '可口可乐', sec: 'Consumer Staples', ind: 'Beverages' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'PG', y: 'PG', e: '106.PG', c: 'USD', n: 'Procter & Gamble', zh: '宝洁', sec: 'Consumer Staples', ind: 'Household Products' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'PFE', y: 'PFE', e: '106.PFE', c: 'USD', n: 'Pfizer', zh: '辉瑞', sec: 'Health Care', ind: 'Pharmaceuticals' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'LLY', y: 'LLY', e: '106.LLY', c: 'USD', n: 'Eli Lilly', zh: '礼来', sec: 'Health Care', ind: 'Pharmaceuticals' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'UNH', y: 'UNH', e: '106.UNH', c: 'USD', n: 'UnitedHealth', zh: '联合健康', sec: 'Health Care', ind: 'Managed Health' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'CAT', y: 'CAT', e: '106.CAT', c: 'USD', n: 'Caterpillar', zh: '卡特彼勒', sec: 'Industrials', ind: 'Construction Machinery' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'BA', y: 'BA', e: '106.BA', c: 'USD', n: 'Boeing', zh: '波音', sec: 'Industrials', ind: 'Aerospace' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'DIS', y: 'DIS', e: '106.DIS', c: 'USD', n: 'Walt Disney', zh: '迪士尼', sec: 'Communication Services', ind: 'Entertainment' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'NKE', y: 'NKE', e: '106.NKE', c: 'USD', n: 'Nike', zh: '耐克', sec: 'Consumer Discretionary', ind: 'Apparel' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'BABA', y: 'BABA', e: '106.BABA', c: 'USD', n: 'Alibaba Group (ADR)', zh: '阿里巴巴（美股ADR）', sec: 'Consumer Discretionary', ind: 'Broadline Retail', al: ['BABA.N'] },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'JD', y: 'JD', e: '105.JD', c: 'USD', n: 'JD.com (ADR)', zh: '京东（美股ADR）', sec: 'Consumer Discretionary', ind: 'Broadline Retail' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'NIO', y: 'NIO', e: '105.NIO', c: 'USD', n: 'NIO (ADR)', zh: '蔚来（美股ADR）', sec: 'Consumer Discretionary', ind: 'Automobiles' },
  { a: 'equity', m: 'US', x: 'XNAS', s: 'TSM', y: 'TSM', e: '106.TSM', c: 'USD', n: 'TSMC (ADR)', zh: '台积电（美股ADR）', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'UBER', y: 'UBER', e: '106.UBER', c: 'USD', n: 'Uber Technologies', zh: '优步', sec: 'Industrials', ind: 'Passenger Landlines' },
  { a: 'equity', m: 'US', x: 'XNYS', s: 'PLTR', y: 'PLTR', e: '106.PLTR', c: 'USD', n: 'Palantir Technologies', zh: 'Palantir', sec: 'Information Technology', ind: 'Software' },
];

const CN_EQ: Row[] = [
  { a: 'equity', m: 'CN', x: 'CNE', s: '600519', y: '600519.SS', e: '1.600519', c: 'CNY', n: 'Kweichow Moutai', zh: '贵州茅台', sec: 'Consumer Staples', ind: 'Baijiu', al: ['茅台'] },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '300750', y: '300750.SZ', e: '0.300750', c: 'CNY', n: 'CATL', zh: '宁德时代', sec: 'Industrials', ind: 'Batteries', al: ['宁德'] },
  { a: 'equity', m: 'CN', x: 'CNE', s: '601318', y: '601318.SS', e: '1.601318', c: 'CNY', n: 'Ping An Insurance', zh: '中国平安', sec: 'Financials', ind: 'Insurance', al: ['平安'] },
  { a: 'equity', m: 'CN', x: 'CNE', s: '600036', y: '600036.SS', e: '1.600036', c: 'CNY', n: 'China Merchants Bank', zh: '招商银行', sec: 'Financials', ind: 'Banks' },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '000858', y: '000858.SZ', e: '0.000858', c: 'CNY', n: 'Wuliangye Yibin', zh: '五粮液', sec: 'Consumer Staples', ind: 'Baijiu' },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '002594', y: '002594.SZ', e: '0.002594', c: 'CNY', n: 'BYD', zh: '比亚迪', sec: 'Consumer Discretionary', ind: 'Automobiles' },
  { a: 'equity', m: 'CN', x: 'CNE', s: '688981', y: '688981.SS', e: '1.688981', c: 'CNY', n: 'SMIC (STAR)', zh: '中芯国际（科创板）', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'CN', x: 'CNE', s: '601899', y: '601899.SS', e: '1.601899', c: 'CNY', n: 'Zijin Mining', zh: '紫金矿业', sec: 'Materials', ind: 'Gold & Copper' },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '000333', y: '000333.SZ', e: '0.000333', c: 'CNY', n: 'Midea Group', zh: '美的集团', sec: 'Industrials', ind: 'Home Appliances' },
  { a: 'equity', m: 'CN', x: 'CNE', s: '601012', y: '601012.SS', e: '1.601012', c: 'CNY', n: 'LONGi Green Energy', zh: '隆基绿能', sec: 'Industrials', ind: 'Solar Equipment' },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '300502', y: '300502.SZ', e: '0.300502', c: 'CNY', n: 'Eoptolink Technology', zh: '新易盛', sec: 'Information Technology', ind: 'Optical Modules' },
  { a: 'equity', m: 'CN', x: 'CNE', s: '600900', y: '600900.SS', e: '1.600900', c: 'CNY', n: 'China Yangtze Power', zh: '长江电力', sec: 'Utilities', ind: 'Hydropower' },
  { a: 'equity', m: 'CN', x: 'CNE', s: '601857', y: '601857.SS', e: '1.601857', c: 'CNY', n: 'PetroChina', zh: '中国石油', sec: 'Energy', ind: 'Integrated Oil' },
  { a: 'equity', m: 'CN', x: 'CNE', s: '600030', y: '600030.SS', e: '1.600030', c: 'CNY', n: 'CITIC Securities', zh: '中信证券', sec: 'Financials', ind: 'Brokerage' },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '000063', y: '000063.SZ', e: '0.000063', c: 'CNY', n: 'ZTE', zh: '中兴通讯', sec: 'Information Technology', ind: 'Telecom Equipment' },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '002415', y: '002415.SZ', e: '0.002415', c: 'CNY', n: 'Hikvision', zh: '海康威视', sec: 'Information Technology', ind: 'Electronic Security' },
  { a: 'equity', m: 'CN', x: 'CNE', s: '688041', y: '688041.SS', e: '1.688041', c: 'CNY', n: 'Hygon Information Technology', zh: '海光信息', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'CN', x: 'XSHE', s: '300059', y: '300059.SZ', e: '0.300059', c: 'CNY', n: 'East Money Information', zh: '东方财富', sec: 'Financials', ind: 'Brokerage' },
];

const HK_EQ: Row[] = [
  { a: 'equity', m: 'HK', x: 'HKEX', s: '00700', y: '0700.HK', e: '116.00700', c: 'HKD', n: 'Tencent Holdings', zh: '腾讯控股', sec: 'Communication Services', ind: 'Internet Platforms', al: ['0700', '0700.HK', '腾讯'] },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '09988', y: '9988.HK', e: '116.09988', c: 'HKD', n: 'Alibaba Group', zh: '阿里巴巴-W', sec: 'Consumer Discretionary', ind: 'Broadline Retail', al: ['9988', 'BABA-HK'] },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '03690', y: '3690.HK', e: '116.03690', c: 'HKD', n: 'Meituan', zh: '美团-W', sec: 'Consumer Discretionary', ind: 'Internet Services', al: ['3690'] },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '01299', y: '1299.HK', e: '116.01299', c: 'HKD', n: 'AIA Group', zh: '友邦保险', sec: 'Financials', ind: 'Insurance' },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '00005', y: '0005.HK', e: '116.00005', c: 'HKD', n: 'HSBC Holdings', zh: '汇丰控股', sec: 'Financials', ind: 'Banks', al: ['0005'] },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '02318', y: '2318.HK', e: '116.02318', c: 'HKD', n: 'Ping An Insurance', zh: '中国平安', sec: 'Financials', ind: 'Insurance' },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '01810', y: '1810.HK', e: '116.01810', c: 'HKD', n: 'Xiaomi', zh: '小米集团-W', sec: 'Information Technology', ind: 'Consumer Electronics' },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '00981', y: '981.HK', e: '116.00981', c: 'HKD', n: 'SMIC', zh: '中芯国际', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '00388', y: '388.HK', e: '116.00388', c: 'HKD', n: 'HK Exchanges & Clearing', zh: '港交所', sec: 'Financials', ind: 'Capital Markets' },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '03988', y: '3988.HK', e: '116.03988', c: 'HKD', n: 'Bank of China', zh: '中国银行', sec: 'Financials', ind: 'Banks' },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '00883', y: '883.HK', e: '116.00883', c: 'HKD', n: 'CNOOC', zh: '中国海洋石油', sec: 'Energy', ind: 'Oil & Gas' },
  { a: 'equity', m: 'HK', x: 'HKEX', s: '02015', y: '2015.HK', e: '116.02015', c: 'HKD', n: 'Li Auto', zh: '理想汽车-W', sec: 'Consumer Discretionary', ind: 'Automobiles' },
];

const APAC_EQ: Row[] = [
  { a: 'equity', m: 'JP', x: 'XTKS', s: '7203', y: '7203.T', c: 'JPY', n: 'Toyota Motor', zh: '丰田汽车', sec: 'Consumer Discretionary', ind: 'Automobiles', al: ['7203.T', 'TM'] },
  { a: 'equity', m: 'JP', x: 'XTKS', s: '6758', y: '6758.T', c: 'JPY', n: 'Sony Group', zh: '索尼集团', sec: 'Consumer Discretionary', ind: 'Entertainment' },
  { a: 'equity', m: 'JP', x: 'XTKS', s: '9983', y: '9983.T', c: 'JPY', n: 'Fanuc', zh: '发那科', sec: 'Industrials', ind: 'Factory Automation' },
  { a: 'equity', m: 'JP', x: 'XTKS', s: '8035', y: '8035.T', c: 'JPY', n: 'Tokyo Electron', zh: '东京电子', sec: 'Information Technology', ind: 'Semiconductor Equipment' },
  { a: 'equity', m: 'JP', x: 'XTKS', s: '9432', y: '9432.T', c: 'JPY', n: 'NTT', zh: '日本电信电话', sec: 'Communication Services', ind: 'Telecom' },
  { a: 'equity', m: 'KR', x: 'KRX', s: '005930', y: '005930.KS', c: 'KRW', n: 'Samsung Electronics', zh: '三星电子', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'KR', x: 'KRX', s: '000660', y: '000660.KS', c: 'KRW', n: 'SK hynix', zh: 'SK海力士', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'KR', x: 'KRX', s: '035420', y: '035420.KS', c: 'KRW', n: 'Naver', zh: 'NAVER', sec: 'Communication Services', ind: 'Internet Platforms' },
  { a: 'equity', m: 'TW', x: 'TWSE', s: '2317', y: '2317.TW', c: 'TWD', n: 'TSMC', zh: '台积电', sec: 'Information Technology', ind: 'Semiconductors' },
  { a: 'equity', m: 'TW', x: 'TWSE', s: '2330', y: '2330.TW', c: 'TWD', n: 'Foxconn (Hon Hai)', zh: '鸿海精密', sec: 'Information Technology', ind: 'Electronic Manufacturing' },
  { a: 'equity', m: 'AU', x: 'ASX', s: 'BHP', y: 'BHP.AX', c: 'AUD', n: 'BHP Group', zh: '必和必拓', sec: 'Materials', ind: 'Diversified Mining' },
  { a: 'equity', m: 'AU', x: 'ASX', s: 'CBA', y: 'CBA.AX', c: 'AUD', n: 'Commonwealth Bank of Australia', zh: '澳大利亚联邦银行', sec: 'Financials', ind: 'Banks' },
  { a: 'equity', m: 'IN', x: 'NSE', s: 'RELIANCE', y: 'RELIANCE.NS', c: 'INR', n: 'Reliance Industries', zh: '信实工业', sec: 'Energy', ind: 'Refining' },
  { a: 'equity', m: 'IN', x: 'NSE', s: 'HDFCBANK', y: 'HDFCBANK.NS', c: 'INR', n: 'HDFC Bank', zh: 'HDFC银行', sec: 'Financials', ind: 'Banks' },
  { a: 'equity', m: 'IN', x: 'NSE', s: 'INFY', y: 'INFY.NS', c: 'INR', n: 'Infosys', zh: '印孚瑟斯', sec: 'Information Technology', ind: 'IT Services' },
  { a: 'equity', m: 'BR', x: 'BVMF', s: 'PETR4', y: 'PETR4.SA', c: 'BRL', n: 'Petrobras (PN)', zh: '巴西石油（优先股）', sec: 'Energy', ind: 'Integrated Oil' },
];

const EU_EQ: Row[] = [
  { a: 'equity', m: 'NL', x: 'XEUR', s: 'ASML', y: 'ASML.AS', c: 'EUR', n: 'ASML Holding', zh: '阿斯麦', sec: 'Information Technology', ind: 'Semiconductor Equipment' },
  { a: 'equity', m: 'DE', x: 'XETRA', s: 'SAP', y: 'SAP.DE', c: 'EUR', n: 'SAP', zh: '思爱普', sec: 'Information Technology', ind: 'Software' },
  { a: 'equity', m: 'DE', x: 'XETRA', s: 'SIE', y: 'SIE.DE', c: 'EUR', n: 'Siemens', zh: '西门子', sec: 'Industrials', ind: 'Industrial Group' },
  { a: 'equity', m: 'FR', x: 'XPAF', s: 'MC', y: 'MC.PA', c: 'EUR', n: 'LVMH', zh: '路威酩轩', sec: 'Consumer Discretionary', ind: 'Luxury Goods' },
  { a: 'equity', m: 'FR', x: 'XPAF', s: 'TTE', y: 'TTE.PA', c: 'EUR', n: 'TotalEnergies', zh: '道达尔能源', sec: 'Energy', ind: 'Integrated Oil' },
  { a: 'equity', m: 'GB', x: 'XLON', s: 'SHEL', y: 'SHEL.L', c: 'GBP', n: 'Shell', zh: '壳牌', sec: 'Energy', ind: 'Integrated Oil' },
  { a: 'equity', m: 'GB', x: 'XLON', s: 'AZN', y: 'AZN.L', c: 'GBP', n: 'AstraZeneca', zh: '阿斯利康', sec: 'Health Care', ind: 'Pharmaceuticals' },
  { a: 'equity', m: 'GB', x: 'XLON', s: 'HSBA', y: 'HSBA.L', c: 'GBP', n: 'HSBC Holdings (London)', zh: '汇丰控股（伦敦）', sec: 'Financials', ind: 'Banks' },
];

/* ---------------------------------------------------------------------- ETFs */

const ETF: Row[] = [
  { a: 'etf', m: 'US', x: 'ARCX', s: 'SPY', y: 'SPY', e: '106.SPY', c: 'USD', n: 'SPDR S&P 500 ETF', zh: '标普500 ETF（SPDR）', sec: 'ETF', ind: 'US Large Cap' },
  { a: 'etf', m: 'US', x: 'XNAS', s: 'QQQ', y: 'QQQ', e: '105.QQQ', c: 'USD', n: 'Invesco QQQ (Nasdaq-100)', zh: '纳指100 ETF', sec: 'ETF', ind: 'US Tech' },
  { a: 'etf', m: 'US', x: 'ARCX', s: 'IWM', y: 'IWM', e: '106.IWM', c: 'USD', n: 'iShares Russell 2000 ETF', zh: '罗素2000 ETF', sec: 'ETF', ind: 'US Small Cap' },
  { a: 'etf', m: 'US', x: 'ARCX', s: 'VOO', y: 'VOO', e: '106.VOO', c: 'USD', n: 'Vanguard S&P 500 ETF', zh: '先锋标普500 ETF', sec: 'ETF', ind: 'US Large Cap' },
  { a: 'etf', m: 'US', x: 'XNAS', s: 'ARKK', y: 'ARKK', e: '105.ARKK', c: 'USD', n: 'ARK Innovation ETF', zh: 'ARK创新ETF', sec: 'ETF', ind: 'Disruptive Tech' },
  { a: 'etf', m: 'US', x: 'ARCX', s: 'GLD', y: 'GLD', e: '106.GLD', c: 'USD', n: 'SPDR Gold Shares', zh: '黄金ETF（SPDR）', sec: 'ETF', ind: 'Gold' },
  { a: 'etf', m: 'CN', x: 'CNE', s: '510300', y: '510300.SS', e: '1.510300', c: 'CNY', n: 'Huatai-PineBridge CSI 300 ETF', zh: '沪深300ETF', sec: 'ETF', ind: 'CN Large Cap' },
  { a: 'etf', m: 'CN', x: 'CNE', s: '588000', y: '588000.SS', e: '1.588000', c: 'CNY', n: 'STAR 50 ETF', zh: '科创50ETF', sec: 'ETF', ind: 'CN Tech' },
  { a: 'etf', m: 'HK', x: 'HKEX', s: '02828', y: '2828.HK', e: '116.02828', c: 'HKD', n: 'Hang Seng China Enterprises ETF', zh: '恒生中国企业ETF', sec: 'ETF', ind: 'HK Mainland-linked' },
];

/* ----------------------------------------------------- commodities and FX */

/**
 * Futures rows are front-month continuous contracts, not spot. The UI says so.
 * They exist to answer "what is gold/oil doing", not "what can I buy".
 */
const COMMODITY: Row[] = [
  // Front-month continuous contracts. Yahoo spells them `GC=F`, Eastmoney
  // `101.GC00Y` (101 = COMEX, 102 = NYMEX). Contract-roll conventions differ
  // between vendors, so a futures figure is labelled as a continuous contract
  // and never presented as a spot price.
  { a: 'commodity', m: 'US', x: 'XNYS', s: 'GC=F', y: 'GC=F', e: '101.GC00Y', c: 'USD', n: 'Gold — COMEX front month', zh: '黄金 · COMEX 主力连续', sec: 'Commodity', ind: 'Metals' },
  { a: 'commodity', m: 'US', x: 'XNYS', s: 'SI=F', y: 'SI=F', e: '101.SI00Y', c: 'USD', n: 'Silver — COMEX front month', zh: '白银 · COMEX 主力连续', sec: 'Commodity', ind: 'Metals' },
  { a: 'commodity', m: 'US', x: 'XNYS', s: 'HG=F', y: 'HG=F', e: '101.HG00Y', c: 'USD', n: 'Copper — COMEX front month', zh: '铜 · COMEX 主力连续', sec: 'Commodity', ind: 'Metals' },
  { a: 'commodity', m: 'US', x: 'XNYS', s: 'CL=F', y: 'CL=F', e: '102.CL00Y', c: 'USD', n: 'WTI Crude — NYMEX front month', zh: 'WTI原油 · NYMEX 主力连续', sec: 'Commodity', ind: 'Energy' },
  { a: 'commodity', m: 'US', x: 'XNYS', s: 'NG=F', y: 'NG=F', e: '102.NG00Y', c: 'USD', n: 'Natural Gas — NYMEX front month', zh: '天然气 · NYMEX 主力连续', sec: 'Commodity', ind: 'Energy' },
];

const FX: Row[] = [
  { a: 'currency', m: 'US', x: 'OTC', s: 'EURUSD=X', y: 'EURUSD=X', c: 'USD', n: 'EUR/USD', zh: '欧元/美元', sec: 'FX', ind: 'Major' },
  { a: 'currency', m: 'US', x: 'OTC', s: 'USDJPY=X', y: 'USDJPY=X', c: 'JPY', n: 'USD/JPY', zh: '美元/日元', sec: 'FX', ind: 'Major' },
  { a: 'currency', m: 'US', x: 'OTC', s: 'GBPUSD=X', y: 'GBPUSD=X', c: 'USD', n: 'GBP/USD', zh: '英镑/美元', sec: 'FX', ind: 'Major' },
  { a: 'currency', m: 'US', x: 'OTC', s: 'USDCNY=X', y: 'USDCNY=X', c: 'CNY', n: 'USD/CNY', zh: '美元/人民币', sec: 'FX', ind: 'Major' },
  { a: 'currency', m: 'US', x: 'OTC', s: 'USDHKD=X', y: 'USDHKD=X', c: 'HKD', n: 'USD/HKD', zh: '美元/港币', sec: 'FX', ind: 'Pegged' },
  { a: 'currency', m: 'US', x: 'OTC', s: 'USDKRW=X', y: 'USDKRW=X', c: 'KRW', n: 'USD/KRW', zh: '美元/韩元', sec: 'FX', ind: 'Major' },
];

export const UNIVERSE: Instrument[] = [
  ...INDICES,
  ...US_EQ,
  ...CN_EQ,
  ...HK_EQ,
  ...APAC_EQ,
  ...EU_EQ,
  ...ETF,
  ...COMMODITY,
  ...FX,
].map(R);

export const BY_ID = new Map<string, Instrument>(UNIVERSE.map((i) => [i.id, i]));

export function instrumentById(id: string): Instrument | null {
  return BY_ID.get(id) ?? null;
}

/** Indices shown in the global overview, grouped market by market. */
export const OVERVIEW_GROUPS: { market: MarketCode; instrumentIds: string[] }[] = [
  {
    market: 'US',
    instrumentIds: ['index:US:^GSPC', 'index:US:^IXIC', 'index:US:^DJI', 'index:US:^RUT', 'index:US:^VIX'],
  },
  {
    market: 'CN',
    instrumentIds: ['index:CN:000001', 'index:CN:399001', 'index:CN:399006', 'index:CN:000300', 'index:CN:000688'],
  },
  { market: 'HK', instrumentIds: ['index:HK:^HSI', 'index:HK:^HSTECH'] },
  { market: 'JP', instrumentIds: ['index:JP:^N225', 'index:JP:^TPX'] },
  { market: 'KR', instrumentIds: ['index:KR:^KS11'] },
  { market: 'TW', instrumentIds: ['index:TW:^TWII'] },
  { market: 'EU', instrumentIds: ['index:EU:^SXXP', 'index:EU:^STOXX'] },
  { market: 'DE', instrumentIds: ['index:DE:^GDAXI'] },
  { market: 'GB', instrumentIds: ['index:GB:^FTSE'] },
  { market: 'FR', instrumentIds: ['index:FR:^FCHI'] },
  { market: 'AU', instrumentIds: ['index:AU:^AXJO'] },
  { market: 'IN', instrumentIds: ['index:IN:^NSEI', 'index:IN:^BSESN'] },
  { market: 'BR', instrumentIds: ['index:BR:^BVSP'] },
];

export const ALL_INDEX_IDS = OVERVIEW_GROUPS.flatMap((g) => g.instrumentIds);

/** Watchlist seed groups. */
export const DEFAULT_GROUPS: { name: string; ids: string[] }[] = [
  {
    name: 'My Watchlist',
    ids: ['equity:US:AAPL', 'equity:US:NVDA', 'equity:HK:00700', 'equity:CN:600519', 'equity:US:TSLA', 'equity:JP:7203'],
  },
  {
    name: 'US Stocks',
    ids: US_EQ.slice(0, 12).map((r) => `equity:US:${r.s}`),
  },
  {
    name: 'China Stocks',
    ids: [...CN_EQ.slice(0, 8).map((r) => `equity:CN:${r.s}`), ...HK_EQ.slice(0, 4).map((r) => `equity:HK:${r.s}`)],
  },
  {
    name: 'Tech',
    ids: [
      'equity:US:AAPL',
      'equity:US:MSFT',
      'equity:US:NVDA',
      'equity:US:AVGO',
      'equity:TW:2317',
      'equity:KR:005930',
      'equity:NL:ASML',
      'equity:CN:688981',
      'equity:HK:00981',
    ],
  },
  { name: 'ETFs', ids: ETF.map((r) => `etf:${r.m}:${r.s}`) },
];

/** Equity pools for the market heatmap. */
export const HEATMAP_POOLS: { key: string; market: MarketCode | 'GLOBAL'; ids: string[] }[] = [
  { key: 'US', market: 'US', ids: US_EQ.map((r) => `equity:US:${r.s}`) },
  { key: 'CN', market: 'CN', ids: CN_EQ.map((r) => `equity:CN:${r.s}`) },
  { key: 'HK', market: 'HK', ids: HK_EQ.map((r) => `equity:HK:${r.s}`) },
  { key: 'APAC', market: 'JP', ids: APAC_EQ.map((r) => makeInstrumentId(r.a, r.m, r.s)) },
  { key: 'EU', market: 'DE', ids: EU_EQ.map((r) => makeInstrumentId(r.a, r.m, r.s)) },
  {
    key: 'INDICES',
    market: 'GLOBAL',
    ids: ALL_INDEX_IDS,
  },
];

/** Instruments that need a live poll for the homepage to feel current. */
export const FEATURED_IDS: string[] = [
  ...ALL_INDEX_IDS,
  ...['equity:US:AAPL', 'equity:US:NVDA', 'equity:US:TSLA', 'equity:US:BABA', 'equity:HK:00700', 'equity:CN:600519'],
  ...COMMODITY.map((r) => `commodity:US:${r.s}`),
  ...FX.map((r) => `currency:US:${r.s}`),
];

export const MARKET_LABEL: Record<MarketCode, { en: string; zh: string }> = {
  US: { en: 'United States', zh: '美国' },
  CN: { en: 'China A-shares', zh: '中国 A 股' },
  HK: { en: 'Hong Kong', zh: '中国香港' },
  JP: { en: 'Japan', zh: '日本' },
  KR: { en: 'South Korea', zh: '韩国' },
  TW: { en: 'Taiwan', zh: '中国台湾' },
  IN: { en: 'India', zh: '印度' },
  AU: { en: 'Australia', zh: '澳大利亚' },
  DE: { en: 'Germany', zh: '德国' },
  FR: { en: 'France', zh: '法国' },
  GB: { en: 'United Kingdom', zh: '英国' },
  NL: { en: 'Netherlands', zh: '荷兰' },
  EU: { en: 'Europe', zh: '欧洲' },
  BR: { en: 'Brazil', zh: '巴西' },
  FX: { en: 'Currencies', zh: '货币' },
};
