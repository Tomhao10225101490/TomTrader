'use client';
import { Block,Page } from '@/components/Page';
import { MarketClock } from '@/components/charts/MarketClock';
import { StateBadge } from '@/components/quote';
import { Segmented } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { useI18n } from '@/lib/i18n-context';
import { useInterest } from '@/lib/useInterest';
import { buildClock } from '@/server/clockClient';
import { CLOCK_EXCHANGES } from '@/server/exchanges';
import { ALL_INDEX_IDS } from '@/server/instruments';
import { usePrefs } from '@/stores/prefs';
import { useEffect,useMemo,useState } from 'react';

/**
 * The clock page is the market clock at full size, plus the numbers the
 * timeline cannot show: minutes to the next open and close for each venue.
 */
export default function ClockPage() {
  const { t, zoneOf, localZone } = useI18n();
  const mode = usePrefs((s) => s.timeZone);
  const set = usePrefs((s) => s.set);
  const [clock, setClock] = useState(() => Date.now());
  useInterest(ALL_INDEX_IDS);

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => buildClock(clock, CLOCK_EXCHANGES), [clock]);
  const open = rows.filter((r) => r.state === 'open');

  return (
    <Page
      title={t('overview.clock')}
      subtitle={`${open.length}/${rows.length} ${t('markets.exchange').toLowerCase()} · ${t('clock.legend')} · ${localZone}`}
      actions={
        <Segmented
          size="sm"
          ariaLabel={t('settings.timezone')}
          value={mode}
          onChange={(v) => set('timeZone', v)}
          options={[
            { value: 'local', label: t('clock.tz.local') },
            { value: 'newyork', label: t('clock.tz.newyork') },
            { value: 'shanghai', label: t('clock.tz.shanghai') },
            { value: 'utc', label: t('clock.tz.utc') },
          ]}
        />
      }
    >
      <MarketClock rows={rows} now={clock} />

      <Block title={t('markets.nextHoliday')} subtitle={t('clock.timeline')} flush>
        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row.exchange} className="border-b border-r border-line-faint px-3 py-2 last:border-r-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-ink">{row.exchange}</span>
                <StateBadge status={{ state: row.state, reason: row.reason, isHalfDay: false }} />
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 text-[11px]">
                <dt className="text-ink-faint">{t('clock.nextOpen')}</dt>
                <dd className="num text-right text-ink-secondary">{formatDuration(row.minutesToNextOpen, 'en')}</dd>
                <dt className="text-ink-faint">{t('clock.localTime')}</dt>
                <dd className="num text-right text-ink-secondary">
                  {new Intl.DateTimeFormat('en-GB', { timeZone: row.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(clock)}
                </dd>
              </dl>
            </div>
          ))}
        </div>
      </Block>

      <p className="text-[10.5px] leading-relaxed text-ink-faint">
        {t('markets.confidenceNote')} Display zone: <span className="num">{zoneOf()}</span>.
      </p>
    </Page>
  );
}
