'use client';
import { Kbd } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useNow } from '@/lib/hooks';
import { buildClock } from '@/server/clockClient';
import { formatClock } from '@/lib/format';
import { marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { EXCHANGES } from '@/server/exchanges';
import type { ExchangeCode } from '@/server/types';
import { useLive } from '@/stores/live';
import { usePrefs } from '@/stores/prefs';
import { Moon,Search,Settings,Sun } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

/**
 * Top bar. 44px, three zones: identity, search, live-status.
 *
 * The status cluster answers the three questions a terminal user asks first:
 * is my data moving, how many venues are open, and what time is it where the
 * market I care about lives.
 */
export function TopBar() {
  const { t, locale, resolvedTheme, localZone } = useI18n();
  const theme = usePrefs((s) => s.theme);
  const set = usePrefs((s) => s.set);
  const connection = useLive((s) => s.connection);
  const clock = useNow();
  const clockBucket = clock === null ? null : Math.floor(clock / 30_000);
  // Venue state is independent of which quote rows this route subscribes to.
  // A stock-detail page with no index snapshots must not say all markets closed.
  const openVenues = useMemo(() => {
    const rows = clockBucket === null ? [] : buildClock(clockBucket * 30_000);
    return { open: rows.filter((row) => row.state === 'open').length, total: rows.length };
  }, [clockBucket]);

  const connectionTone =
    connection === 'open' ? 'bg-[var(--t-up)]' : connection === 'paused' ? 'bg-[var(--t-warn)]' : connection === 'connecting' ? 'bg-[var(--t-flat)]' : 'bg-[var(--t-down)]';
  const connectionLabel =
    connection === 'open'
      ? t('shell.connected')
      : connection === 'connecting'
        ? t('shell.reconnecting')
        : connection === 'paused'
          ? t('shell.paused')
          : connection === 'backoff'
            ? t('shell.reconnecting')
            : t('shell.offline');

  return (
    <header className="flex h-[44px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <div className="flex items-center gap-2.5">
        <Wordmark />
        <span className="hidden text-[11px] text-ink-faint lg:inline">{t('app.tagline')}</span>
      </div>

      <Link
        href="/search"
        prefetch={false}
        className="group ml-2 hidden h-[28px] min-w-0 flex-1 items-center gap-2 rounded-[var(--t-radius-sm)] border border-line bg-surface-alt px-2 text-[12px] text-ink-muted hover:border-line-strong hover:bg-surface md:flex lg:max-w-[440px]"
        aria-label={t('search.title')}
      >
        <Search size={13} className="shrink-0" />
        <span className="truncate">{t('shell.searchPlaceholder')}</span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden items-center gap-1.5 text-[11px] text-ink-muted sm:flex" title={t('overview.subtitle', { open: openVenues.open, total: openVenues.total, at: '' }).trim()}>
          <span className={cn('led', openVenues.open > 0 && 'pulse-dot')} style={{ background: openVenues.open ? 'var(--t-up)' : 'var(--t-flat)' }} />
          <span className="num">
            {openVenues.total === 0 ? t('common.loading') : openVenues.open === 0
              ? t('status.allClosed')
              : openVenues.open === 1
                ? t('status.oneOpen')
                : t('status.marketsOpen', { n: openVenues.open })}
          </span>
        </div>

        <div className="hidden items-center gap-1.5 xl:flex" title={clock === null ? '' : formatClock(clock, localZone, locale, { seconds: true })}>
          <span className="num text-[11px] tabular-nums text-ink-secondary">{clock === null ? '—' : formatClock(clock, localZone, locale)}</span>
          <span className="text-[10px] uppercase text-ink-faint">{localZone.split('/').pop()?.replace(/_/g, ' ')}</span>
        </div>

        <div className="flex items-center gap-1.5 rounded-[var(--t-radius-sm)] border border-line bg-surface-alt px-2 py-[3px]" title={`${connectionLabel} · ${t('settings.providers')}`}>
          <span className={cn('led', connection === 'open' && 'pulse-dot', connectionTone)} />
          <span className="hidden text-[11px] text-ink-muted sm:inline">{connectionLabel}</span>
        </div>

        <button
          type="button"
          onClick={() => set('theme', resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex h-[28px] w-[28px] items-center justify-center rounded-[var(--t-radius-sm)] border border-transparent text-ink-muted hover:border-line hover:bg-surface-alt hover:text-ink"
          aria-label={t('settings.theme')}
          title={theme === 'system' ? t('settings.theme.system') : t('settings.theme')}
        >
          {resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <Link
          href="/settings"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-[var(--t-radius-sm)] border border-transparent text-ink-muted hover:border-line hover:bg-surface-alt hover:text-ink"
          aria-label={t('nav.settings')}
        >
          <Settings size={14} />
        </Link>
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 no-underline" aria-label="TomTrader">
      <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] bg-ink">
        {/* The mark is a two-bar candlestick: subject matter, not decoration. */}
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
          <rect x="1.4" y="3.2" width="2.4" height="5.4" fill="var(--t-canvas)" />
          <rect x="2.4" y="1.4" width="0.5" height="8.2" fill="var(--t-canvas)" />
          <rect x="6.2" y="1.6" width="2.4" height="6.2" fill="var(--t-canvas)" opacity="0.72" />
          <rect x="7.2" y="0.6" width="0.5" height="8.8" fill="var(--t-canvas)" opacity="0.72" />
        </svg>
      </span>
      <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">TomTrader</span>
    </Link>
  );
}

export function venueLabel(code: ExchangeCode, locale: 'en' | 'zh'): string {
  const info = EXCHANGES[code];
  return locale === 'zh' ? info.nameZh : info.name;
}

export function marketLabelFor(code: ExchangeCode, locale: 'en' | 'zh'): string {
  const map: Partial<Record<ExchangeCode, string>> = { XNYS: 'US', XNAS: 'US', ARCX: 'US', CNE: 'CN', XSHE: 'CN', HKEX: 'HK', XTKS: 'JP', KRX: 'KR', TWSE: 'TW', NSE: 'IN', BSE: 'IN', ASX: 'AU', XETRA: 'DE', XEUR: 'EU', XLON: 'GB', XPAF: 'FR', BVMF: 'BR' };
  const market = map[code];
  return market ? marketName(locale, market) : venueLabel(code, locale);
}
