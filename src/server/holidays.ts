import type { ExchangeCode } from './types';

/**
 * Curated cash-market calendars with explicit verified-year coverage.
 * Official 2026 source links and limitations: docs/DATA_ACCURACY.md.
 * Unverified/partial calendars never declare a market open. Best-effort
 * half-day boundaries also report unavailable rather than invented hours.
 */

export type Confidence = 'high' | 'best-effort';

export interface Holiday {
  /** Exchange-local calendar date, yyyy-mm-dd. */
  date: string;
  name: string;
  nameZh: string;
  confidence: Confidence;
}

export interface EarlyClose {
  date: string;
  /** Exchange-local close minute for that day. */
  closeMin: number;
  name: string;
  nameZh: string;
  confidence: Confidence;
}

interface CalendarEntry {
  /** Years verified against the official cash-market schedule. */
  verifiedYears?: number[];
  holidays: Holiday[];
  earlyCloses: EarlyClose[];
  /** True when we know the list is incomplete for this venue. */
  partial?: boolean;
  note?: string;
}

const US: Holiday[] = [
  // 2025
  { date: '2025-01-01', name: "New Year's Day", nameZh: '元旦', confidence: 'high' },
  { date: '2025-01-09', name: 'National Day of Mourning (J. Carter)', nameZh: '全国哀悼日', confidence: 'high' },
  { date: '2025-01-20', name: 'Martin Luther King Jr. Day', nameZh: '马丁·路德·金纪念日', confidence: 'high' },
  { date: '2025-02-17', name: "Presidents' Day", nameZh: '总统日', confidence: 'high' },
  { date: '2025-04-18', name: 'Good Friday', nameZh: '耶稣受难日', confidence: 'high' },
  { date: '2025-05-26', name: 'Memorial Day', nameZh: '阵亡将士纪念日', confidence: 'high' },
  { date: '2025-06-19', name: 'Juneteenth', nameZh: '六月节', confidence: 'high' },
  { date: '2025-07-04', name: 'Independence Day', nameZh: '独立日', confidence: 'high' },
  { date: '2025-09-01', name: 'Labor Day', nameZh: '劳动节', confidence: 'high' },
  { date: '2025-11-27', name: 'Thanksgiving', nameZh: '感恩节', confidence: 'high' },
  { date: '2025-12-25', name: 'Christmas Day', nameZh: '圣诞节', confidence: 'high' },
  // 2026
  { date: '2026-01-01', name: "New Year's Day", nameZh: '元旦', confidence: 'high' },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day', nameZh: '马丁·路德·金纪念日', confidence: 'high' },
  { date: '2026-02-16', name: "Presidents' Day", nameZh: '总统日', confidence: 'high' },
  { date: '2026-04-03', name: 'Good Friday', nameZh: '耶稣受难日', confidence: 'high' },
  { date: '2026-05-25', name: 'Memorial Day', nameZh: '阵亡将士纪念日', confidence: 'high' },
  { date: '2026-06-19', name: 'Juneteenth', nameZh: '六月节', confidence: 'high' },
  { date: '2026-07-03', name: 'Independence Day (observed)', nameZh: '独立日（补休）', confidence: 'high' },
  { date: '2026-09-07', name: 'Labor Day', nameZh: '劳动节', confidence: 'high' },
  { date: '2026-11-26', name: 'Thanksgiving', nameZh: '感恩节', confidence: 'high' },
  { date: '2026-12-25', name: 'Christmas Day', nameZh: '圣诞节', confidence: 'high' },
  // 2027
  { date: '2027-01-01', name: "New Year's Day", nameZh: '元旦', confidence: 'high' },
  { date: '2027-01-18', name: 'Martin Luther King Jr. Day', nameZh: '马丁·路德·金纪念日', confidence: 'high' },
  { date: '2027-02-15', name: "Presidents' Day", nameZh: '总统日', confidence: 'high' },
  { date: '2027-03-26', name: 'Good Friday', nameZh: '耶稣受难日', confidence: 'high' },
  { date: '2027-05-31', name: 'Memorial Day', nameZh: '阵亡将士纪念日', confidence: 'high' },
  { date: '2027-06-18', name: 'Juneteenth (observed)', nameZh: '六月节（补休）', confidence: 'high' },
  { date: '2027-07-05', name: 'Independence Day (observed)', nameZh: '独立日（补休）', confidence: 'high' },
  { date: '2027-09-06', name: 'Labor Day', nameZh: '劳动节', confidence: 'high' },
  { date: '2027-11-25', name: 'Thanksgiving', nameZh: '感恩节', confidence: 'high' },
  { date: '2027-12-24', name: 'Christmas Day (observed)', nameZh: '圣诞节（补休）', confidence: 'high' },
];

const US_EARLY: EarlyClose[] = [
  { date: '2025-07-03', closeMin: 13 * 60, name: 'Early close', nameZh: '提前收盘', confidence: 'high' },
  { date: '2025-11-28', closeMin: 13 * 60, name: 'Early close (Black Friday)', nameZh: '提前收盘（黑色星期五）', confidence: 'high' },
  { date: '2025-12-24', closeMin: 13 * 60, name: 'Early close (Christmas Eve)', nameZh: '提前收盘（平安夜）', confidence: 'high' },
  { date: '2026-11-27', closeMin: 13 * 60, name: 'Early close (Black Friday)', nameZh: '提前收盘（黑色星期五）', confidence: 'high' },
  { date: '2026-12-24', closeMin: 13 * 60, name: 'Early close (Christmas Eve)', nameZh: '提前收盘（平安夜）', confidence: 'high' },
  { date: '2026-12-31', closeMin: 13 * 60, name: 'Early close (New Year’s Eve)', nameZh: '提前收盘（跨年夜）', confidence: 'best-effort' },
  { date: '2027-11-26', closeMin: 13 * 60, name: 'Early close (Black Friday)', nameZh: '提前收盘（黑色星期五）', confidence: 'high' },
];

const UK: Holiday[] = [
  '2025-01-01|New Year’s Day|元旦|high',
  '2025-04-18|Good Friday|耶稣受难日|high',
  '2025-04-21|Easter Monday|复活节星期一|high',
  '2025-05-05|Early May Bank Holiday|五月初银行假日|high',
  '2025-05-26|Spring Bank Holiday|春季银行假日|high',
  '2025-08-25|Summer Bank Holiday|夏季银行假日|high',
  '2025-12-25|Christmas Day|圣诞节|high',
  '2025-12-26|Boxing Day|节礼日|high',
  '2026-01-01|New Year’s Day|元旦|high',
  '2026-04-03|Good Friday|耶稣受难日|high',
  '2026-04-06|Easter Monday|复活节星期一|high',
  '2026-05-04|Early May Bank Holiday|五月初银行假日|high',
  '2026-05-25|Spring Bank Holiday|春季银行假日|high',
  '2026-08-31|Summer Bank Holiday|夏季银行假日|high',
  '2026-12-25|Christmas Day|圣诞节|high',
  '2026-12-28|Boxing Day (observed)|节礼日（补休）|high',
  '2027-01-01|New Year’s Day|元旦|high',
  '2027-03-26|Good Friday|耶稣受难日|high',
  '2027-03-29|Easter Monday|复活节星期一|high',
  '2027-05-03|Early May Bank Holiday|五月初银行假日|high',
  '2027-05-31|Spring Bank Holiday|春季银行假日|high',
  '2027-08-30|Summer Bank Holiday|夏季银行假日|high',
  '2027-12-27|Christmas Day (observed)|圣诞节（补休）|high',
  '2027-12-28|Boxing Day (observed)|节礼日（补休）|high',
].map(parseLine);


/** Xetra reduces its session on these days. */


const JP: Holiday[] = [
  // Year-end / New Year market closure
  '2025-12-31|Year-end closing|年末休市|high',
  '2026-01-01|New Year’s Day|元旦|high',
  '2026-01-02|New Year holidays|新年振替休|high',
  '2026-01-03|New Year holidays|新年振替休|high',
  '2026-01-12|Coming of Age Day|成人之日|high',
  '2026-02-11|National Foundation Day|建国纪念日|high',
  '2026-02-23|Emperor’s Birthday|天皇诞生日|high',
  '2026-03-20|Vernal Equinox Day|春分之日|high',
  '2026-04-29|Showa Day|昭和之日|high',
  '2026-05-03|Constitution Memorial Day|宪法纪念日|high',
  '2026-05-04|Greenery Day|绿之日|high',
  '2026-05-05|Children’s Day|儿童之日|high',
  '2026-05-06|Substitute holiday|振替休日|high',
  '2026-07-20|Marine Day|海之日|high',
  '2026-08-11|Mountain Day|山之日|high',
  '2026-09-21|Respect for the Aged Day|敬老之日|high',
  '2026-09-22|Citizens’ Holiday (sandwiched)|国民休日|best-effort',
  '2026-09-23|Autumnal Equinox Day|秋分之日|best-effort',
  '2026-10-12|Sports Day|体育之日|high',
  '2026-11-03|Culture Day|文化之日|high',
  '2026-11-23|Labor Thanksgiving Day|勤劳感谢日|high',
  '2027-01-01|New Year’s Day|元旦|high',
  '2027-01-11|Coming of Age Day|成人之日|high',
  '2027-02-11|National Foundation Day|建国纪念日|high',
  '2027-02-23|Emperor’s Birthday|天皇诞生日|high',
  '2027-03-22|Vernal Equinox Day|春分之日|best-effort',
  '2027-04-29|Showa Day|昭和之日|high',
  '2027-05-03|Constitution Memorial Day|宪法纪念日|high',
  '2027-05-04|Greenery Day|绿之日|high',
  '2027-05-05|Children’s Day|儿童之日|high',
  '2027-07-19|Marine Day|海之日|high',
  '2027-08-11|Mountain Day|山之日|high',
  '2027-09-20|Respect for the Aged Day|敬老之日|high',
  '2027-09-22|Autumnal Equinox Day|秋分之日|best-effort',
  '2027-10-11|Sports Day|体育之日|high',
  '2027-11-03|Culture Day|文化之日|high',
  '2027-11-23|Labor Thanksgiving Day|勤劳感谢日|high',
  '2027-12-31|Year-end closing|年末休市|high',
].map(parseLine);



const KR: Holiday[] = [
  '2026-01-01|New Year’s Day|元旦|high',
  '2026-02-16|Lunar New Year (Eve)|春节前一天|best-effort',
  '2026-02-17|Lunar New Year|春节|best-effort',
  '2026-02-18|Lunar New Year (Day 2)|春节后一天|best-effort',
  '2026-03-02|Independence Movement Day (observed)|三一节（补休）|best-effort',
  '2026-05-05|Children’s Day|儿童节|high',
  '2026-05-25|Buddha’s Birthday (observed)|佛诞日（补休）|best-effort',
  '2026-06-06|Memorial Day|显忠日|high',
  '2026-08-17|Liberation Day (observed)|光复节（补休）|best-effort',
  '2026-10-05|Chuseok (Eve)|秋夕前一天|best-effort',
  '2026-10-06|Chuseok|秋夕|best-effort',
  '2026-10-07|Chuseok (Day 2)|秋夕后一天|best-effort',
  '2026-10-09|Hangul Day|韩文日|high',
  '2026-12-25|Christmas Day|圣诞节|high',
].map(parseLine);

const TW: Holiday[] = [
  '2026-01-01|New Year’s Day|元旦|high',
  '2026-02-16|Lunar New Year|春节|best-effort',
  '2026-02-17|Lunar New Year|春节除夕|best-effort',
  '2026-02-18|Lunar New Year|大年初一|best-effort',
  '2026-02-19|Lunar New Year|春节假期|best-effort',
  '2026-02-20|Lunar New Year|春节假期|best-effort',
  '2026-02-27|Peace Memorial Day (observed)|二二八和平纪念日（补休）|best-effort',
  '2026-04-03|Tomb Sweeping Day (observed)|清明节（补休）|best-effort',
  '2026-05-01|Labour Day|劳动节|high',
  '2026-09-28|Teachers’ Day|教师节|high',
  '2026-10-09|Double Tenth Day (observed)|国庆日（补休）|best-effort',
  '2026-12-31|Year-end rest|年底假日|high',
].map(parseLine);

const IN: Holiday[] = [
  '2026-01-26|Republic Day|共和国日|high',
  '2026-04-03|Good Friday|耶稣受难日|high',
  '2026-08-15|Independence Day|独立日|high',
  '2026-10-02|Gandhi Jayanti|圣雄甘地诞辰|high',
  '2026-12-25|Christmas Day|圣诞节|high',
].map(parseLine);

const AU: Holiday[] = [
  '2026-01-01|New Year’s Day|元旦|high',
  '2026-01-26|Australia Day|澳大利亚日|high',
  '2026-04-03|Good Friday|耶稣受难日|high',
  '2026-04-06|Easter Monday|复活节星期一|high',
  '2026-06-08|King’s Birthday|国王诞辰|high',
  '2026-12-25|Christmas Day|圣诞节|high',
  '2026-12-28|Boxing Day (observed)|节礼日（补休）|high',
  '2027-01-01|New Year’s Day|元旦|high',
  '2027-01-26|Australia Day|澳大利亚日|high',
  '2027-03-26|Good Friday|耶稣受难日|high',
  '2027-03-29|Easter Monday|复活节星期一|high',
  '2027-06-14|King’s Birthday|国王诞辰|high',
  '2027-12-27|Christmas Day (observed)|圣诞节（补休）|high',
  '2027-12-28|Boxing Day (observed)|节礼日（补休）|high',
].map(parseLine);

const BR: Holiday[] = [
  '2026-01-01|New Year’s Day|元旦|high',
  '2026-02-16|Carnival|狂欢节|best-effort',
  '2026-02-17|Carnival|狂欢节|best-effort',
  '2026-04-03|Good Friday|耶稣受难日|high',
  '2026-04-21|Tiradentes Day|蒂拉登特斯日|high',
  '2026-05-01|Labour Day|劳动节|high',
  '2026-06-04|Corpus Christi|圣体节|best-effort',
  '2026-09-07|Independence Day|独立日|high',
  '2026-10-12|Our Lady of Aparecida|圣母节|high',
  '2026-11-02|Day of the Dead|亡灵节|high',
  '2026-11-15|Proclamation of the Republic|共和国宣言日|high',
  '2026-11-20|Black Consciousness Day|黑人意识日|high',
  '2026-12-25|Christmas Day|圣诞节|high',
].map(parseLine);

function parseLine(line: string): Holiday {
  const [date, name, nameZh, confidence] = line.split('|');
  return { date, name, nameZh, confidence: (confidence as Confidence) ?? 'best-effort' };
}

// 2026 corrections verified 2026-11-08. Source links: docs/DATA_ACCURACY.md.
function dates(list: string[], name: string, nameZh: string): Holiday[] {
  return list.map((date) => ({ date, name, nameZh, confidence: 'high' }));
}
function halfDays(list: string[], closeMin: number): EarlyClose[] {
  return list.map((date) => ({ date, closeMin, name: 'Early close', nameZh: '提前收盘', confidence: 'high' }));
}
const CN_2026 = dates([
  '2026-01-01', '2026-01-02', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
  '2026-04-06', '2026-05-01', '2026-05-04', '2026-05-05', '2026-06-19', '2026-09-25',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
], 'Exchange holiday', '交易所节假日休市');
const HK_2026 = dates([
  '2026-01-01', '2026-02-17', '2026-02-18', '2026-02-19', '2026-04-03', '2026-04-06', '2026-04-07',
  '2026-05-01', '2026-05-25', '2026-06-19', '2026-07-01', '2026-10-01', '2026-10-19', '2026-12-25',
], 'Exchange holiday', '交易所节假日休市');
const DE_2026 = dates(['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31'], 'Exchange holiday', '交易所节假日休市');
const EURONEXT_2026 = dates(['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-25'], 'Exchange holiday', '交易所节假日休市');

export const CALENDARS: Record<ExchangeCode, CalendarEntry> = {
  XNYS: { holidays: US, earlyCloses: US_EARLY.filter((d) => d.date !== '2026-12-31'), verifiedYears: [2025, 2026, 2027] },
  XNAS: { holidays: US, earlyCloses: US_EARLY.filter((d) => d.date !== '2026-12-31'), verifiedYears: [2025, 2026, 2027] },
  ARCX: { holidays: US, earlyCloses: US_EARLY.filter((d) => d.date !== '2026-12-31'), verifiedYears: [2025, 2026, 2027] },
  CNE: { holidays: CN_2026, earlyCloses: [], verifiedYears: [2026], note: 'SSE 2025 announcement 45; weekend make-up workdays remain closed.' },
  XSHE: { holidays: CN_2026, earlyCloses: [], verifiedYears: [2026] },
  HKEX: { holidays: HK_2026, earlyCloses: halfDays(['2026-02-16','2026-12-24','2026-12-31'], 720), verifiedYears: [2026] },
  XTKS: { holidays: [...JP, ...dates(['2026-12-31'], 'Market holiday', '交易所休市')], earlyCloses: [], verifiedYears: [2026] },
  KRX: { holidays: KR, earlyCloses: [], partial: true },
  TWSE: { holidays: TW, earlyCloses: [], partial: true },
  NSE: { holidays: IN, earlyCloses: [], partial: true },
  BSE: { holidays: IN, earlyCloses: [], partial: true },
  ASX: { holidays: AU, earlyCloses: halfDays(['2026-12-24','2026-12-31'], 850), verifiedYears: [2026] },
  XETRA: { holidays: DE_2026, earlyCloses: [], verifiedYears: [2026] },
  XEUR: { holidays: EURONEXT_2026, earlyCloses: halfDays(['2026-12-24','2026-12-31'], 845).map((d) => ({ ...d, confidence: 'best-effort' as const })), verifiedYears: [2026] },
  XLON: { holidays: UK, earlyCloses: halfDays(['2026-12-24','2026-12-31'], 750), verifiedYears: [2026] },
  XPAF: { holidays: EURONEXT_2026, earlyCloses: halfDays(['2026-12-24','2026-12-31'], 845).map((d) => ({ ...d, confidence: 'best-effort' as const })), verifiedYears: [2026] },
  BVMF: { holidays: BR, earlyCloses: [], partial: true },
  OTC: { holidays: [], earlyCloses: [], partial: true },
};

export const CALENDAR_VERSION = '2026.11.08';

export function calendarVerified(exchange: ExchangeCode, date: string): boolean {
  const calendar = CALENDARS[exchange];
  return !calendar.partial && Boolean(calendar.verifiedYears?.includes(Number(date.slice(0, 4))));
}
