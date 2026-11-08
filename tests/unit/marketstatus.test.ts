import { EXCHANGES } from '@/server/exchanges';
import { calendarVerified } from '@/server/holidays';
import { getMarketStatus,planDay,upcomingBoundaries,utcFromLocalDate,zoned } from '@/server/marketstatus';
import { describe,expect,it } from 'vitest';

const iso = (s: string) => Date.parse(s);
const isoOf = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

describe('zoned wall-clock primitives', () => {
  it('reads an exchange-local date across a DST boundary', () => {
    // 2026-11-01: US falls back from EDT to EST at 06:00 UTC.
    expect(zoned(iso('2026-11-01T05:30:00Z'), 'America/New_York').date).toBe('2026-11-01');
    expect(zoned(iso('2026-11-01T05:30:00Z'), 'America/New_York').minutes).toBe(1 * 60 + 30); // 01:30 EDT
    expect(zoned(iso('2026-11-01T06:30:00Z'), 'America/New_York').minutes).toBe(1 * 60 + 30); // 01:30 EST
    expect(zoned(iso('2026-11-01T06:30:00Z'), 'America/New_York').date).toBe('2026-11-01');
  });

  it('converts a local wall clock back to the right UTC instant in both seasons', () => {
    // 09:30 local in New York is 14:30Z in winter and 13:30Z in summer.
    expect(isoOf(utcFromLocalDate('America/New_York', '2026-01-05', 9 * 60 + 30))).toBe('2026-01-05T14:30:00Z');
    expect(isoOf(utcFromLocalDate('America/New_York', '2026-07-06', 9 * 60 + 30))).toBe('2026-07-06T13:30:00Z');
    // Europe changes a fortnight later than the US.
    expect(isoOf(utcFromLocalDate('Europe/Berlin', '2026-03-09', 9 * 60))).toBe('2026-03-09T08:00:00Z');
    expect(isoOf(utcFromLocalDate('Europe/Berlin', '2026-03-30', 9 * 60))).toBe('2026-03-30T07:00:00Z');
    // Asia has no DST at all.
    expect(isoOf(utcFromLocalDate('Asia/Shanghai', '2026-03-09', 9 * 60 + 30))).toBe('2026-03-09T01:30:00Z');
    expect(isoOf(utcFromLocalDate('Asia/Shanghai', '2026-07-06', 9 * 60 + 30))).toBe('2026-07-06T01:30:00Z');
  });
});

describe('daily session plan', () => {
  it('builds two sessions for Shanghai and one for New York', () => {
    const cn = planDay('CNE', '2026-11-09');
    expect(cn.segments).toHaveLength(2);
    expect(isoOf(cn.segments[0].openAt)).toBe('2026-11-09T01:30:00Z');
    expect(isoOf(cn.segments[0].closeAt)).toBe('2026-11-09T03:30:00Z');
    expect(isoOf(cn.segments[1].closeAt)).toBe('2026-11-09T07:00:00Z');

    const us = planDay('XNYS', '2026-11-09');
    expect(us.segments).toHaveLength(1);
    expect(isoOf(us.segments[0].openAt)).toBe('2026-11-09T14:30:00Z');
    expect(isoOf(us.segments[0].closeAt)).toBe('2026-11-09T21:00:00Z');
  });

  it('marks weekends as closed', () => {
    expect(planDay('XNYS', '2026-11-07').closure).toBe('weekend');
    expect(planDay('CNE', '2026-11-08').closure).toBe('weekend');
  });

  it('applies US early closes to the last session of the day', () => {
    const blackFriday = planDay('XNYS', '2026-11-27');
    expect(blackFriday.segments[0].earlyClose).toBe(true);
    expect(isoOf(blackFriday.segments[0].closeAt)).toBe('2026-11-27T18:00:00Z'); // 13:00 EST
  });

  it('keeps known holidays closed', () => {
    expect(planDay('XNYS', '2026-04-03').reason).toBe('Good Friday');
    expect(planDay('CNE', '2026-10-01').closure).toBe('holiday');
    expect(planDay('XTKS', '2026-01-02').closure).toBe('holiday');
    expect(planDay('XLON', '2026-12-25').closure).toBe('holiday');
    expect(planDay('ASX', '2026-01-26').closure).toBe('holiday');
    expect(planDay('XNYS', '2026-07-03').reason).toContain('Independence');
  });

  it('Tokyo golden week 2026', () => {
    for (const d of ['2026-04-29', '2026-05-04', '2026-05-05', '2026-05-06']) {
      expect(planDay('XTKS', d).closure, d).toBe('holiday');
    }
    expect(planDay('XTKS', '2026-05-07').closure).toBe('none');
  });
});

describe('market status', () => {
  it('reports the weekend correctly on a Saturday afternoon UTC', () => {
    const now = iso('2026-11-07T13:45:00Z');
    const ny = getMarketStatus('XNYS', now);
    expect(ny.state).toBe('weekend');
    expect(isoOf(ny.nextOpenAt!)).toBe('2026-11-09T14:30:00Z');
    // Saturday in New York: the label is the local date of the next session.
    expect(ny.nextEventLabel).toBe('2026-11-09');

    const sh = getMarketStatus('CNE', now);
    expect(sh.state).toBe('weekend');
    expect(isoOf(sh.nextOpenAt!)).toBe('2026-11-09T01:30:00Z');
  });

  it('is open during the New York session and closed after it', () => {
    expect(getMarketStatus('XNYS', iso('2026-11-09T15:00:00Z')).state).toBe('open');
    expect(getMarketStatus('XNYS', iso('2026-11-09T21:30:00Z')).state).toBe('after-hours');
    // 2026-11-10T01:30Z is 20:30 EST — after the extended-hours session ends.
    expect(getMarketStatus('XNYS', iso('2026-11-10T01:30:00Z')).state).toBe('closed');
    expect(getMarketStatus('XNYS', iso('2026-11-09T12:00:00Z')).state).toBe('pre-market');
  });

  it('follows the US into daylight saving in March', () => {
    // Sunday 2026-03-08 07:00Z is already 03:00 EDT; Monday opens at 13:30Z.
    expect(isoOf(getMarketStatus('XNYS', iso('2026-03-09T12:00:00Z')).nextOpenAt!)).toBe('2026-03-09T13:30:00Z');
    expect(getMarketStatus('XNYS', iso('2026-03-09T13:35:00Z')).state).toBe('open');
    // London is still on GMT that week, so it opens an hour earlier in UTC.
    expect(getMarketStatus('XLON', iso('2026-03-09T08:05:00Z')).state).toBe('open');
    expect(getMarketStatus('XLON', iso('2026-03-09T07:55:00Z')).state).not.toBe('open');
    // After the EU switches on 2026-03-29, Frankfurt opens at 07:00Z.
    expect(isoOf(getMarketStatus('XETRA', iso('2026-03-30T12:00:00Z')).nextOpenAt!)).toBe('2026-03-31T07:00:00Z');
  });

  it('detects the Chinese midday session break', () => {
    const during = getMarketStatus('CNE', iso('2026-11-09T04:00:00Z')); // 12:00 CST
    expect(during.state).toBe('closed');
    expect(during.reason).toBe('Midday session break');
    expect(isoOf(during.nextOpenAt!)).toBe('2026-11-09T05:00:00Z');
    const open = getMarketStatus('CNE', iso('2026-11-09T02:00:00Z')); // 10:00 CST
    expect(open.state).toBe('open');
    expect(isoOf(open.nextCloseAt!)).toBe('2026-11-09T03:30:00Z');
  });

  it('detects the Hong Kong pre-open auction', () => {
    expect(getMarketStatus('HKEX', iso('2026-11-09T01:15:00Z')).state).toBe('pre-market'); // 09:15 HKT
    expect(getMarketStatus('HKEX', iso('2026-11-09T02:00:00Z')).state).toBe('open'); // 10:00 HKT
    expect(getMarketStatus('HKEX', iso('2026-11-09T08:05:00Z')).state).toBe('after-hours'); // 16:05 HKT
  });

  it('does not call a holiday a weekend', () => {
    const xmas = getMarketStatus('XNYS', iso('2026-12-25T16:00:00Z'));
    expect(xmas.state).toBe('holiday');
    expect(xmas.reason).toBe('Christmas Day');
  });

  it('handles a day that is Monday in Sydney but Sunday in New York', () => {
    // 2026-11-08T21:00Z is 2026-11-09 08:00 in Sydney (Monday) and 2026-11-08 16:00 in NY (Sunday).
    // Sydney is on AEDT (+11) in November, so its Monday session opens on Sunday 23:00Z.
    expect(getMarketStatus('ASX', iso('2026-11-08T21:00:00Z')).state).toBe('closed');
    expect(isoOf(getMarketStatus('ASX', iso('2026-11-08T21:00:00Z')).nextOpenAt!)).toBe('2026-11-08T23:00:00Z');
    expect(getMarketStatus('ASX', iso('2026-11-09T00:30:00Z')).state).toBe('open');
    expect(getMarketStatus('XNYS', iso('2026-11-08T21:00:00Z')).state).toBe('weekend');
  });

  it('gives the next open for a market that closed hours ago', () => {
    // 2026-11-09T23:00Z: Tokyo closed at 06:30Z, opens again 2026-11-10T00:00Z.
    const tk = getMarketStatus('XTKS', iso('2026-11-09T23:00:00Z'));
    expect(tk.state).toBe('closed');
    expect(isoOf(tk.nextOpenAt!)).toBe('2026-11-10T00:00:00Z');
  });

  it('skips holidays when searching for the next session', () => {
    // Friday 2026-12-25 is Christmas; the next US session is Monday 2026-12-28.
    const bound = upcomingBoundaries('XNYS', iso('2026-12-25T21:00:00Z'));
    expect(isoOf(bound.nextOpenAt!)).toBe('2026-12-28T14:30:00Z');
  });

  it('knows every exchange it claims to support', () => {
    for (const code of Object.keys(EXCHANGES) as (keyof typeof EXCHANGES)[]) {
      if (code === 'OTC') continue;
      const s = getMarketStatus(code, iso('2026-11-09T05:00:00Z'));
      if (!calendarVerified(code, '2026-11-09')) {
        expect(s.state).toBe('unavailable');
        expect(s.sessionSource).toBe('fallback');
        expect(s.nextOpenAt).toBeNull();
      } else expect(['open', 'closed', 'pre-market', 'after-hours', 'holiday', 'weekend']).toContain(s.state);
    }
  });
});
