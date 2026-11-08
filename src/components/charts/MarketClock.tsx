'use client';
import { StateBadge } from '@/components/quote';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { useI18n } from '@/lib/i18n-context';
import type { ClockRowLite } from '@/server/clockClient';
import { EXCHANGES } from '@/server/exchanges';
import { utcFromZoned } from '@/server/marketstatus';
import { useMemo } from 'react';

/**
 * Global market clock: a 24-hour lane per venue.
 *
 * The lane is drawn in the reader's own day boundaries, so "the Tokyo session
 * is a sliver on the left of my screen" is literally true and immediately
 * readable. Sessions come from the same calendar engine that powers the status
 * badges — this component renders the answer, it does not recompute one.
 */
export function MarketClock({ rows, now }: { rows: ClockRowLite[]; now: number }) {
  const { locale, t, zoneOf } = useI18n();
  const localZone = zoneOf();
  const dayStart = useMemo(() => {
    // Reader-local midnight, expressed as an instant.
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: localZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
    const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? '0');
    return utcFromZoned(localZone, get('year'), get('month'), get('day'), 0);
  }, [now, localZone]);

  const span = 24 * 3_600_000;
  const hours = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="overflow-hidden rounded-[var(--t-radius)] border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2">
        <div>
          <p className="section-title">{t('overview.clock')}</p>
          <p className="mt-0.5 text-[10.5px] text-ink-faint">{t('clock.timeline')}</p>
        </div>
        <p className="num text-[11px] text-ink-muted">
          {new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { timeZone: localZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)}{' '}
          <span className="text-ink-faint">{localZone.split('/').pop()?.replace(/_/g, ' ')}</span>
        </p>
      </div>

      <div className="min-w-[520px]">
        <div className="flex items-center border-b border-line-faint px-3 py-1">
          <div className="w-[124px] shrink-0" />
          <div className="relative h-[14px] flex-1">
            {hours.map((h) => (
              <span key={h} className="num absolute top-0 -translate-x-1/2 text-[9px] text-ink-faint" style={{ left: `${(h / 24) * 100}%` }}>
                {h % 6 === 0 ? String(h % 24).padStart(2, '0') : ''}
              </span>
            ))}
          </div>
          <div className="w-[112px] shrink-0 text-right text-[9px] uppercase tracking-[0.05em] text-ink-faint">{t('clock.nextOpen')}</div>
        </div>

        {rows.map((row) => {
          const info = EXCHANGES[row.exchange];
          const left = ((row.minutesToNextOpen ?? 0) / 60 / 24) * 100;
          return (
            <div key={row.exchange} data-clock-lane={row.exchange} className="flex items-center border-b border-line-faint px-3 py-[5px] last:border-b-0 hover:bg-surface-alt">
              <div className="w-[124px] shrink-0 pr-2">
                <p className="truncate text-[11.5px] font-medium text-ink">{locale === 'zh' ? info.nameZh : info.city}</p>
                <p className="num text-[10px] text-ink-faint">{new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { timeZone: info.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}</p>
              </div>

              <div className="relative h-[18px] flex-1 overflow-hidden rounded-[2px] bg-surface-inset">
                {/* day/night shading of the reader's own clock, for orientation */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.5]">
                  {Array.from({ length: 24 }, (_, h) => (
                    <span
                      key={h}
                      className="absolute top-0 h-full"
                      style={{
                        left: `${(h / 24) * 100}%`,
                        width: `${(1 / 24) * 100}%`,
                        background: h >= 6 && h < 18 ? 'transparent' : 'color-mix(in oklab, var(--t-ink) 5%, transparent)',
                      }}
                    />
                  ))}
                </div>
                {row.segmentsToday.map((seg, i) => {
                  const start = ((seg.openAt - dayStart) / span) * 100;
                  const end = ((seg.closeAt - dayStart) / span) * 100;
                  const tone = row.state === 'open' ? 'var(--t-up)' : row.state === 'pre-market' || row.state === 'after-hours' ? 'var(--t-warn)' : 'var(--t-flat)';
                  return (
                    <span
                      key={i}
                      title={`${info.city} ${new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: info.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(seg.openAt)}–${new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: info.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(seg.closeAt)}`}
                      className={cn('absolute top-[3px] h-[12px] rounded-[1px]')}
                      style={{
                        left: `${Math.max(0, start)}%`,
                        width: `${Math.max(0, Math.min(100, end) - Math.max(0, start))}%`,
                        background: tone,
                        opacity: row.state === 'open' ? 0.9 : 0.45,
                      }}
                    />
                  );
                })}
                <span className="absolute top-0 h-full w-px bg-[var(--t-accent)]" style={{ left: `${((now - dayStart) / span) * 100}%` }} aria-hidden />
              </div>

              <div className="w-[112px] shrink-0 text-right">
                <StateBadge status={{ state: row.state, reason: row.reason, isHalfDay: false }} className="justify-end" />
                <p className="num mt-[1px] text-[10px] text-ink-faint">
                  {row.minutesToNextOpen !== null && row.minutesToNextOpen > 0
                    ? `${t('clock.nextOpen')} ${formatDuration(row.minutesToNextOpen, locale)}`
                    : row.minutesToNextClose !== null && row.minutesToNextClose > 0
                      ? `${t('clock.nextClose')} ${formatDuration(row.minutesToNextClose, locale)}`
                      : left > 0
                        ? formatDuration(row.minutesToNextOpen, locale)
                        : '—'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
