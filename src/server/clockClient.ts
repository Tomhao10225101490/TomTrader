import { EXCHANGES,PRIMARY_CLOCK_EXCHANGES } from './exchanges';
import { calendarVerified } from './holidays';
import { getMarketStatus,planDay,zoned } from './marketstatus';
import type { ExchangeCode,MarketState } from './types';

/**
 * Market clock projection for the browser.
 *
 * The session math itself lives server-side (`marketstatus.ts`) and is unit
 * tested there; this module only reshapes it into what the timeline needs, and
 * is deliberately free of vendor data so it can run in a component without a
 * round trip.
 */

export interface ClockSegment {
  openAt: number;
  closeAt: number;
  date: string;
  earlyClose: boolean;
}

export interface ClockRowLite {
  exchange: ExchangeCode;
  state: MarketState;
  reason: string | null;
  localNowMs: number;
  minutesToNextOpen: number | null;
  minutesToNextClose: number | null;
  segmentsToday: ClockSegment[];
  timezone: string;
}

export function buildClock(now = Date.now(), exchanges: ExchangeCode[] = PRIMARY_CLOCK_EXCHANGES): ClockRowLite[] {
  return exchanges.map((exchange) => {
    const info = EXCHANGES[exchange];
    const status = getMarketStatus(exchange, now);
    const today = zoned(now, info.timezone).date;
    const plan = planDay(exchange, today);
    const minutesToNextOpen = status.nextOpenAt === null ? null : Math.round((status.nextOpenAt - now) / 60000);
    const minutesToNextClose = status.nextCloseAt === null ? null : Math.round((status.nextCloseAt - now) / 60000);
    return {
      exchange,
      state: status.state,
      reason: status.reason,
      localNowMs: now,
      minutesToNextOpen,
      minutesToNextClose,
      segmentsToday: (calendarVerified(exchange, today) ? plan.segments : []).map((s) => ({ openAt: s.openAt, closeAt: s.closeAt, date: today, earlyClose: s.earlyClose })),
      timezone: info.timezone,
    };
  });
}
