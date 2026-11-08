'use client';
import { Block,Page } from '@/components/Page';
import { StateBadge } from '@/components/quote';
import { ErrorState,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { formatClock,formatPrice } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import { useInterest } from '@/lib/useInterest';
import type { ExchangeCode } from '@/server/types';
import { useCallback } from 'react';

interface MarketsResponse {
  rows: {
    code: ExchangeCode;
    name: string;
    nameZh: string;
    country: string;
    countryZh: string;
    timezone: string;
    city: string;
    currency: string;
    sessions: { open: string; close: string }[];
    supportsExtendedHours: boolean;
    partialCalendar: boolean;
    partial: boolean;
    note: string | null;
    status: import('@/server/types').MarketStatus;
    headline: { id: string; name: string; quote: import('@/server/types').Quote | null }[];
    nextClosures: { date: string; name: string; nameZh: string; confidence: string }[];
  }[];
  calendarVersion: string;
  generatedAt: number;
}

/**
 * Markets reference: sessions in the venue's own clock, live status, the
 * headline index for each venue, and the next dates we believe it is closed —
 * each closure carrying its own confidence label rather than a blanket claim.
 */
export default function MarketsPage() {
  const now = useNow() ?? 0;
  const { t, locale, zoneOf } = useI18n();
  const load = useAsync(useCallback(async () => (await api.markets()).data as MarketsResponse | null, []), []);
  const rows = load.data?.rows ?? [];
  useInterest(rows.flatMap((r) => r.headline.map((h) => h.id)));

  return (
    <Page
      title={t('markets.title')}
      subtitle={
        load.data
          ? `${rows.length} venues · ${t('markets.calendar')} ${load.data.calendarVersion}`
          : load.loading
            ? t('common.loading')
            : t('common.error')
      }
    >
      {load.error ? <ErrorState title={t('common.error')} body={load.error} onRetry={load.reload} /> : null}

      <Block flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                <th className="px-3 py-2 font-medium">{t('markets.exchange')}</th>
                <th className="px-3 py-2 font-medium">{t('markets.status')}</th>
                <th className="px-3 py-2 font-medium">{t('markets.session')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('markets.headline')}</th>
                <th className="px-3 py-2 font-medium">{t('markets.calendar')}</th>
                <th className="px-3 py-2 font-medium">{t('markets.currency')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const zone = row.timezone;
                const lead = row.headline[0];
                return (
                  <tr key={row.code} className="border-b border-line-faint align-top last:border-b-0 hover:bg-surface-alt">
                    <td className="px-3 py-2">
                      <p className="font-medium text-ink">{locale === 'zh' ? row.nameZh : row.name}</p>
                      <p className="text-[10.5px] text-ink-faint">
                        {locale === 'zh' ? row.countryZh : row.country} · {row.city} · <span className="num">{zone}</span>
                      </p>
                      <p className="num text-[10.5px] text-ink-muted">{formatClock(now, zone, locale, { seconds: true })}</p>
                    </td>
                    <td className="px-3 py-2">
                      <StateBadge status={row.status} showReason />
                      <p className="num mt-1 text-[10.5px] text-ink-faint">
                        {row.status.nextOpenAt ? `${t('clock.nextOpen')} ${formatClock(row.status.nextOpenAt, zone, locale)}` : '—'}
                      </p>
                    </td>
                    <td className="num px-3 py-2 text-ink-secondary">
                      {row.sessions.map((s, i) => (
                        <div key={i}>
                          {s.open}–{s.close}
                        </div>
                      ))}
                      {row.supportsExtendedHours ? <div className="text-[10px] text-ink-faint">{locale === 'zh' ? '含盘前/盘后' : 'incl. pre/post'}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {lead?.quote ? (
                        <>
                          <p className="num text-ink">{formatPrice(lead.quote.last, { assetType: 'index', currency: row.currency as never }, locale, { symbol: false })?.text}</p>
                          <p className="num text-[10.5px] text-ink-faint">{lead.name}</p>
                        </>
                      ) : (
                        <span className="text-[11px] text-ink-faint">{t('common.unavailable')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.nextClosures.length === 0 ? (
                        <span className="text-[10.5px] text-ink-faint">{t('markets.noUpcoming')}</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {row.nextClosures.slice(0, 3).map((c) => (
                            <li key={c.date} className="num text-[10.5px] text-ink-muted">
                              <span className="text-ink-secondary">{c.date}</span> {locale === 'zh' ? c.nameZh : c.name}
                              {c.confidence === 'best-effort' ? <span className="ml-1 text-[var(--t-warn)]">{t('markets.confidence.best-effort')}</span> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      {row.partialCalendar ? <p className="mt-1 text-[10px] text-[var(--t-warn)]">{row.note ?? t('markets.confidenceNote')}</p> : null}
                    </td>
                    <td className="num px-3 py-2 text-right text-ink-secondary">{row.currency}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>

      <p className="text-[10.5px] leading-relaxed text-ink-faint">
        {t('markets.confidenceNote')} {'·'} {zoneOf() && t('clock.legend')}
      </p>

      {load.loading && !rows.length ? <Spinner label={t('common.loading')} /> : null}
    </Page>
  );
}
