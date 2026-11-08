import { EXCHANGES } from './exchanges';
import { CALENDARS,calendarVerified } from './holidays';
import type { ExchangeCode,MarketState,MarketStatus } from './types';

/* ---------------------------------------------------------------------------
 * Timezone primitives
 * ------------------------------------------------------------------------- */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    partsCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

export interface ZonedDateTime {
  /** yyyy-mm-dd in the exchange's own calendar. */
  date: string;
  year: number;
  month: number;
  day: number;
  /** Minutes since local midnight. */
  minutes: number;
  /** Seconds since local midnight (full precision). */
  secondsOfDay: number;
  weekday: number;
}

/** Wall-clock reading of an instant in a named zone. DST-correct by definition. */
export function zoned(instantMs: number, tz: string): ZonedDateTime {
  const parts = fmt(tz).formatToParts(new Date(instantMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  // en-GB with hour12:false can emit "24" for midnight in some ICU versions.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  const wd = WEEKDAY_INDEX[get('weekday')] ?? new Date(instantMs).getDay();
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    minutes: hour * 60 + minute,
    secondsOfDay: hour * 3600 + minute * 60 + second,
    weekday: wd,
  };
}

/** Offset of `tz` from UTC, in whole minutes, at a given instant. */
export function offsetMinutesAt(instantMs: number, tz: string): number {
  const p = zoned(instantMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day) + p.secondsOfDay * 1000;
  return Math.round((asUtc - instantMs) / 60000);
}

/**
 * UTC ms for a wall-clock reading in a named zone.
 *
 * Implemented against Intl's timezone database rather than a fixed offset, so
 * daylight saving is handled by the same source the UI uses to *display* time.
 * The two-pass correction converges on both sides of a transition; ambiguous or
 * nonexistent wall clocks resolve to the post-transition offset, which is what
 * an exchange session boundary never coincides with (sessions open on :00/:30).
 */
export function utcFromZoned(tz: string, year: number, month: number, day: number, minutesFromMidnight: number): number {
  const naive = Date.UTC(year, month - 1, day) + minutesFromMidnight * 60_000;
  const first = naive - offsetMinutesAt(naive, tz) * 60_000;
  const second = naive - offsetMinutesAt(first, tz) * 60_000;
  return second;
}

/** UTC ms for a yyyy-mm-dd + local minute offset. */
export function utcFromLocalDate(tz: string, date: string, minutesFromMidnight: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return utcFromZoned(tz, y, m, d, minutesFromMidnight);
}

export function addDaysToLocalDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/* ---------------------------------------------------------------------------
 * Session model
 * ------------------------------------------------------------------------- */

export interface SessionSegment {
  openAt: number;
  closeAt: number;
  /** True when the exchange is running a shortened day. */
  earlyClose: boolean;
  reason: string | null;
  reasonZh: string | null;
}

export type ClosureKind = 'none' | 'weekend' | 'holiday';

export interface DayPlan {
  date: string;
  segments: SessionSegment[];
  closure: ClosureKind;
  reason: string | null;
  reasonZh: string | null;
  /** Holiday entries we are least sure about (lunar make-up days). */
  lowConfidence: boolean;
}

/**
 * Build the trading plan for one exchange-local calendar day.
 * Pure function of (exchange, date, now-independent rules).
 */
export function planDay(exchange: ExchangeCode, date: string): DayPlan {
  const info = EXCHANGES[exchange];
  const cal = CALENDARS[exchange];
  const [y, m, d] = date.split('-').map(Number);
  const weekday = zoned(utcFromZoned(info.timezone, y, m, d, 12 * 60), info.timezone).weekday;

  if (!info.days.includes(weekday)) {
    return { date, segments: [], closure: 'weekend', reason: 'Weekend', reasonZh: '周末', lowConfidence: false };
  }

  const holiday = cal.holidays.find((h) => h.date === date);
  if (holiday) {
    return {
      date,
      segments: [],
      closure: 'holiday',
      reason: holiday.name,
      reasonZh: holiday.nameZh,
      lowConfidence: holiday.confidence === 'best-effort',
    };
  }

  const early = cal.earlyCloses.find((e) => e.date === date);
  const lowConfidence = Boolean(early && early.confidence === 'best-effort');

  let segments: SessionSegment[] = info.sessions.map((s) => ({
    openAt: utcFromLocalDate(info.timezone, date, s.openMin),
    closeAt: utcFromLocalDate(info.timezone, date, s.closeMin),
    earlyClose: false,
    reason: null,
    reasonZh: null,
  }));

  if (early) {
    // Apply the shortened close to the last segment of the day.
    const last = segments[segments.length - 1];
    const [ey, em, ed] = date.split('-').map(Number);
    const newClose = utcFromZoned(info.timezone, ey, em, ed, early.closeMin);
    if (newClose > last.openAt) {
      segments = segments.map((s, i) =>
        i === segments.length - 1
          ? { ...s, closeAt: newClose, earlyClose: true, reason: early.name, reasonZh: early.nameZh }
          : s,
      );
    } else {
      // Early close falls before the afternoon session: that session is cancelled.
      segments = segments.slice(0, -1);
    }
  }

  return { date, segments, closure: 'none', reason: null, reasonZh: null, lowConfidence };
}

/* ---------------------------------------------------------------------------
 * Status
 * ------------------------------------------------------------------------- */

const MAX_HORIZON_DAYS = 20;

export function getMarketStatus(exchange: ExchangeCode, nowMs: number): MarketStatus {
  const info = EXCHANGES[exchange];
  const today = zoned(nowMs, info.timezone).date;
  if (!calendarVerified(exchange, today) || CALENDARS[exchange].earlyCloses.some((d) => d.date === today && d.confidence === 'best-effort')) return { exchange, state: 'unavailable', nextOpenAt: null, nextCloseAt: null, nextEventLabel: null, isHalfDay: false, reason: 'Exchange calendar has not been verified for this market/year', sessionSource: 'fallback' };

  // Walk back one local day: a session that is still running may have started
  // "yesterday" in UTC terms (e.g. Sydney on a Monday when New York is Sunday).
  const candidates = [addDaysToLocalDate(today, -1), today, addDaysToLocalDate(today, 1)];
  let previousReason: string | null = null;
  let previousReasonZh: string | null = null;
  let lowConfidence = false;

  for (const date of candidates) {
    const plan = planDay(exchange, date);
    if (plan.closure === 'holiday') {
      previousReason = plan.reason;
      previousReasonZh = plan.reasonZh;
      lowConfidence ||= plan.lowConfidence;
    }
    if (plan.closure === 'none') lowConfidence ||= plan.lowConfidence;
    for (const seg of plan.segments) {
      if (nowMs >= seg.openAt && nowMs < seg.closeAt) {
        const next = upcomingBoundaries(exchange, nowMs, today);
        return {
          exchange,
          state: 'open',
          nextOpenAt: next.nextOpenAt,
          nextCloseAt: next.nextCloseAt,
          nextEventLabel: next.nextLabel,
          isHalfDay: seg.earlyClose,
          reason: seg.reason ?? null,
          sessionSource: 'calendar',
        };
      }
    }
  }

  // Extended hours (US and HK auctions; never on a day the exchange is closed).
  if (info.supportsExtendedHours) {
    for (const date of candidates) {
      const plan = planDay(exchange, date);
      if (plan.closure !== 'none' || plan.segments.length === 0) continue;
      const first = info.sessions[0];
      const lastSession = info.sessions[info.sessions.length - 1];
      const preOpen = utcFromLocalDate(info.timezone, date, first.preOpenMin ?? first.openMin);
      const firstOpen = plan.segments[0].openAt;
      const lastClose = plan.segments[plan.segments.length - 1].closeAt;
      const afterEnd =
        lastSession.afterCloseMin !== undefined
          ? utcFromLocalDate(info.timezone, date, plan.segments.some((s) => s.earlyClose) ? (exchange === 'HKEX' ? 12 * 60 + 10 : 17 * 60) : lastSession.afterCloseMin)
          : lastClose;
      if (nowMs >= preOpen && nowMs < firstOpen) return finish('pre-market', exchange, nowMs, today);
      if (nowMs >= lastClose && nowMs < afterEnd) return finish('after-hours', exchange, nowMs, today);
    }
  }

  const todaysPlan = planDay(exchange, today);
  // Also look at "yesterday's" plan, since a weekend day in the exchange's zone
  // may still be a weekday elsewhere at this instant.
  const yesterday = planDay(exchange, addDaysToLocalDate(today, -1));

  // Mid-session break (Shanghai/Shenzhen/Hong Kong/Tokyo lunch holiday). The
  // exchange is not "closed for the day", and saying so would be misleading.
  for (const plan of [todaysPlan, yesterday]) {
    if (plan.closure !== 'none' || plan.segments.length < 2) continue;
    for (let i = 0; i < plan.segments.length - 1; i++) {
      if (nowMs >= plan.segments[i].closeAt && nowMs < plan.segments[i + 1].openAt) {
        const next = upcomingBoundaries(exchange, nowMs, today);
        return {
          exchange,
          state: 'closed',
          nextOpenAt: next.nextOpenAt,
          nextCloseAt: next.nextCloseAt,
          nextEventLabel: next.nextLabel,
          isHalfDay: plan.segments.some((s) => s.earlyClose),
          reason: 'Midday session break',
          sessionSource: 'calendar',
        };
      }
    }
  }

  let state: MarketState = 'closed';
  let reason = previousReason;
  let reasonZh = previousReasonZh;

  if (todaysPlan.closure === 'holiday') {
    state = 'holiday';
    reason = todaysPlan.reason;
    reasonZh = todaysPlan.reasonZh;
  } else if (todaysPlan.closure === 'weekend' && yesterday.closure === 'weekend') {
    state = 'weekend';
    reason = 'Weekend';
    reasonZh = '周末';
  } else if (todaysPlan.closure === 'weekend') {
    state = 'weekend';
    reason = 'Weekend';
    reasonZh = '周末';
  }

  const next = upcomingBoundaries(exchange, nowMs, today);
  return {
    exchange,
    state,
    nextOpenAt: next.nextOpenAt,
    nextCloseAt: next.nextCloseAt,
    nextEventLabel: next.nextLabel,
    isHalfDay: false,
    reason: reason ?? reasonZh ?? null,
    sessionSource: 'calendar',
  };
}

function finish(state: MarketState, exchange: ExchangeCode, nowMs: number, today: string): MarketStatus {
  const next = upcomingBoundaries(exchange, nowMs, today);
  return {
    exchange,
    state,
    nextOpenAt: next.nextOpenAt,
    nextCloseAt: next.nextCloseAt,
    nextEventLabel: next.nextLabel,
    isHalfDay: false,
    reason: null,
    sessionSource: 'calendar',
  };
}

interface Boundaries {
  nextOpenAt: number | null;
  nextCloseAt: number | null;
  nextLabel: string | null;
}

/** Next segment open / close after `now`, scanning forward across local days. */
export function upcomingBoundaries(exchange: ExchangeCode, nowMs: number, fromLocalDate?: string): Boundaries {
  const info = EXCHANGES[exchange];
  const start = fromLocalDate ?? zoned(nowMs, info.timezone).date;

  let nextOpenAt: number | null = null;
  let nextOpenDate = '';
  let nextCloseAt: number | null = null;

  for (let i = 0; i < MAX_HORIZON_DAYS && (nextOpenAt === null || nextCloseAt === null); i++) {
    const date = addDaysToLocalDate(start, i);
    if (!calendarVerified(exchange, date)) continue;
    const plan = planDay(exchange, date);
    if (plan.closure !== 'none') continue;
    for (let s = 0; s < plan.segments.length; s++) {
      const seg = plan.segments[s];
      if (nextOpenAt === null && seg.openAt > nowMs) {
        nextOpenAt = seg.openAt;
        nextOpenDate = date;
      }
      if (nextCloseAt === null && seg.closeAt > nowMs) {
        nextCloseAt = seg.closeAt;
        // A close that is followed by another segment the same day is the lunch break.
      }
    }
  }

  let nextLabel: string | null = null;
  if (nextOpenAt !== null) {
    const localDay = zoned(nowMs, info.timezone).date;
    nextLabel =
      nextOpenDate === localDay ? 'today' : nextOpenDate === addDaysToLocalDate(localDay, 1) ? 'tomorrow' : nextOpenDate;
  }

  return { nextOpenAt, nextCloseAt, nextLabel };
}

/** Minutes until a timestamp, null when there is none. */
export function minutesUntil(at: number | null, nowMs: number): number | null {
  if (at === null) return null;
  return Math.round((at - nowMs) / 60000);
}

/**
 * Is this instrument's venue currently producing prints?
 * Used by the freshness engine: outside a session, an unchanged quote is
 * "end-of-day", not "stale".
 */
export function isTradingNow(exchange: ExchangeCode, nowMs: number): boolean {
  const s = getMarketStatus(exchange, nowMs);
  return s.state === 'open';
}

export function nextTradingDay(exchange: ExchangeCode, fromMs: number): string | null {
  const info = EXCHANGES[exchange];
  let date = zoned(fromMs, info.timezone).date;
  for (let i = 0; i < MAX_HORIZON_DAYS; i++) {
    date = addDaysToLocalDate(date, 1);
    const plan = planDay(exchange, date);
    if (plan.closure === 'none') return date;
  }
  return null;
}

export { addDaysToLocalDate as shiftLocalDate };
