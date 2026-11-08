import { EXCHANGES } from '@/server/exchanges';
import { CALENDARS,CALENDAR_VERSION } from '@/server/holidays';
import { OVERVIEW_GROUPS } from '@/server/instruments';
import { addDaysToLocalDate,zoned } from '@/server/marketstatus';
import { getSnapshots,marketStatusFor } from '@/server/service';
import type { ExchangeCode,MarketCode } from '@/server/types';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

/** Exchange reference table: sessions, time zone, status, next known closure. */
export async function GET() {
  const now = Date.now();
  return guarded(async () => {
    const rows = await Promise.all(
      (Object.keys(EXCHANGES) as ExchangeCode[])
        .filter((code) => code !== 'OTC')
        .map(async (code) => {
          const info = EXCHANGES[code];
          const cal = CALENDARS[code];
          const today = zoned(now, info.timezone).date;
          const group = OVERVIEW_GROUPS.find((g) => g.market === marketOf(code));
          const snaps = group ? await getSnapshots(group.instrumentIds.slice(0, 2), { mode: 'stale' }) : [];
          return {
            code,
            name: info.name,
            nameZh: info.nameZh,
            country: info.country,
            countryZh: info.countryZh,
            timezone: info.timezone,
            city: info.city,
            currency: info.currency,
            sessions: info.sessions.map((s) => ({ open: minutesToLabel(s.openMin), close: minutesToLabel(s.closeMin) })),
            supportsExtendedHours: info.supportsExtendedHours,
            partialCalendar: Boolean(cal.partial),
            note: cal.note ?? null,
            status: marketStatusFor(code, now),
            headline: snaps.map((s) => ({ id: s.instrument.id, name: s.instrument.name, quote: s.quote })),
            nextClosures: nextKnownClosure(cal.holidays, today),
          };
        }),
    );
    return { rows, calendarVersion: CALENDAR_VERSION, generatedAt: now };
  }, 'markets');
}

const MARKET_BY_EXCHANGE: Partial<Record<ExchangeCode, MarketCode>> = {
  XNYS: 'US',
  XNAS: 'US',
  ARCX: 'US',
  CNE: 'CN',
  XSHE: 'CN',
  HKEX: 'HK',
  XTKS: 'JP',
  KRX: 'KR',
  TWSE: 'TW',
  NSE: 'IN',
  BSE: 'IN',
  ASX: 'AU',
  XETRA: 'DE',
  XEUR: 'EU',
  XLON: 'GB',
  XPAF: 'FR',
  BVMF: 'BR',
};

function marketOf(code: ExchangeCode): MarketCode | undefined {
  return MARKET_BY_EXCHANGE[code];
}

function nextKnownClosure(holidays: { date: string; name: string; nameZh: string; confidence: 'high' | 'best-effort' }[], today: string) {
  return holidays
    .filter((h) => h.date >= today && h.date <= addDaysToLocalDate(today, 120))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((c) => ({ date: c.date, name: c.name, nameZh: c.nameZh, confidence: c.confidence }));
}

function minutesToLabel(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
