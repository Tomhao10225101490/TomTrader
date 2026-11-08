'use client';
import { ChangeText,PriceText,QualityBadge,Sparkline,StampLine,StateBadge,displayName,stockHref } from '@/components/quote';
import { Button,Segmented } from '@/components/ui';
import { cn } from '@/lib/cn';
import { directionOf } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import type { StringKey } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useInterest } from '@/lib/useInterest';
import { buildClock } from '@/server/clockClient';
import { EXCHANGES } from '@/server/exchanges';
import type { QuoteSnapshot } from '@/shared/api';
import { useLive } from '@/stores/live';
import { usePrefs } from '@/stores/prefs';
import { useUserData } from '@/stores/userdata';
import { PanelRightClose } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect,useMemo } from 'react';

/**
 * Right-hand context panel.
 *
 * It changes with where you are: on a stock page it summarises that
 * instrument, elsewhere it shows the active watchlist and a venue board. It is
 * one of the three columns and can be hidden entirely from the top bar — the
 * main region does not lose information when it goes.
 */
export function ContextPanel() {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const tab = usePrefs((s) => s.contextPanelTab);
  const set = usePrefs((s) => s.set);
  const groups = useUserData((s) => s.groups);
  const activeGroupId = useUserData((s) => s.activeGroupId);
  const snapshots = useLive((s) => s.snapshots);
  const now = useNow(30_000);

  useEffect(() => {
    if (!groups.length) void useUserData.getState().load();
  }, [groups.length]);

  const activeGroup = useMemo(() => groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null, [groups, activeGroupId]);
  const ids = activeGroup?.instrumentIds ?? [];
  useInterest(ids);

  const isStockPage = pathname.startsWith('/stocks/');
  const effectiveTab = tab;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b border-line px-2">
        <Segmented
          size="sm"
          ariaLabel={t('shell.showPanel')}
          value={effectiveTab}
          onChange={(v) => set('contextPanelTab', v)}
          options={[
            { value: 'watchlist', label: t('nav.watchlist') },
            { value: 'market', label: t('nav.markets') },
            ...(isStockPage ? [{ value: 'summary' as const, label: t('detail.overview') }] : []),
          ]}
        />
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label={t('shell.hidePanel')}
          title={t('shell.hidePanel')}
          onClick={() => set('contextPanelOpen', false)}
        >
          <PanelRightClose size={14} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {effectiveTab === 'watchlist' ? (
          <PanelWatchlist ids={ids} snapshots={snapshots} groups={groups} activeGroupId={activeGroup?.id ?? null} />
        ) : effectiveTab === 'market' ? (
          <PanelMarket now={now} locale={locale} t={t} />
        ) : (
          <PanelSummary snapshots={snapshots} />
        )}
      </div>
    </div>
  );
}

function PanelWatchlist({
  ids,
  snapshots,
  groups,
  activeGroupId,
}: {
  ids: string[];
  snapshots: Record<string, QuoteSnapshot>;
  groups: { id: string; name: string }[];
  activeGroupId: string | null;
}) {
  const { t, locale } = useI18n();
  const setActive = useUserData((s) => s.setActiveGroup);
  if (!groups.length) {
    return (
      <div className="p-4 text-[12px] text-ink-muted">
        <p>{t('watchlist.empty')}</p>
        <Link href="/watchlist" className="mt-2 inline-block text-accent">
          {t('watchlist.emptyCta')}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-line px-2 py-1.5">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActive(g.id)}
            className={cn(
              'rounded-[3px] border px-1.5 py-[2px] text-[11px]',
              g.id === activeGroupId ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-ink-muted hover:text-ink',
            )}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ids.length === 0 ? <p className="p-4 text-[12px] text-ink-muted">{t('watchlist.empty')}</p> : null}
        {ids.map((id) => {
          const snap = snapshots[id];
          if (!snap) return null;
          return (
            <Link key={id} prefetch={false} href={stockHref(snap.instrument)} className="block border-b border-line-faint px-2.5 py-1.5 no-underline hover:bg-surface-alt">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[12px] font-medium text-ink">{displayName(snap.instrument, locale)}</span>
                <span className="num shrink-0 text-[12px] text-ink">{snap.quote ? PriceTextValue(snap) : '—'}</span>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="num min-w-0 truncate text-[10px] uppercase text-ink-faint">{snap.instrument.displaySymbol}</span>
                <div className="flex items-center gap-2">
                  <Sparkline values={snap.sparkline ?? null} direction={directionOf(snap.quote)} width={44} height={13} />
                  <span className="w-[58px] text-right">
                    <ChangeText snapshot={snap} size="xs" showGlyph={false} />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Panel rows show the price without a currency symbol; the column header carries it. */
function PriceTextValue(snap: QuoteSnapshot): string {
  const quote = snap.quote;
  if (!quote || !Number.isFinite(quote.last)) return '—';
  const decimals = quote.last >= 1000 ? 2 : quote.last < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(quote.last);
}


const HEADLINE_BY_EXCHANGE: Partial<Record<string, string>> = {
  XNYS: 'index:US:^GSPC',
  XLON: 'index:GB:^FTSE',
  XETRA: 'index:DE:^GDAXI',
  XEUR: 'index:EU:^SXXP',
  HKEX: 'index:HK:^HSI',
  CNE: 'index:CN:000001',
  XTKS: 'index:JP:^N225',
  ASX: 'index:AU:^AXJO',
  KRX: 'index:KR:^KS11',
  TWSE: 'index:TW:^TWII',
  NSE: 'index:IN:^NSEI',
  XPAF: 'index:FR:^FCHI',
  BVMF: 'index:BR:^BVSP',
};

function PanelMarket({ now, locale, t }: { now: number | null; locale: 'en' | 'zh'; t: (k: StringKey, vars?: Record<string, string | number>) => string }) {
  const at = now ?? 0;
  const rows = useMemo(() => buildClock(at), [at]);
  const snapshots = useLive((s) => s.snapshots);
  const indexIds = Object.keys(snapshots).filter((id) => snapshots[id]?.instrument.assetType === 'index');
  useInterest(indexIds.slice(0, 30));

  return (
    <div>
      {rows.map((row) => {
        const headlineId = HEADLINE_BY_EXCHANGE[row.exchange];
        const headline = headlineId ? snapshots[headlineId] : null;
        return (
          <div key={row.exchange} className="border-b border-line-faint px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-medium text-ink">{locale === 'zh' ? EXCHANGES[row.exchange].nameZh : EXCHANGES[row.exchange].name}</span>
              <StateBadge status={{ state: row.state, reason: row.reason, isHalfDay: false }} />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
              <span className="num">{new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { timeZone: EXCHANGES[row.exchange].timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)}</span>
              {headline ? (
                <span className="flex items-center gap-1.5">
                  <span className="num">{PriceTextValue(headline)}</span>
                  <ChangeText snapshot={headline} size="xs" showGlyph={false} />
                </span>
              ) : (
                <span className="text-ink-faint">{t('common.unknown')}</span>
              )}
            </div>
          </div>
        );
      })}
      <p className="px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-faint">{t('markets.confidenceNote' as never)}</p>
    </div>
  );
}

function PanelSummary({ snapshots }: { snapshots: Record<string, QuoteSnapshot> }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const id = decodeURIComponent(pathname.split('/stocks/')[1] ?? '');
  const snap = snapshots[id];
  if (!snap) return <div className="p-4 text-[12px] text-ink-muted">{t('common.loading')}</div>;
  return (
    <div className="flex flex-col gap-2 p-3">
      <div>
        <p className="text-[13px] font-semibold text-ink">{displayName(snap.instrument, locale)}</p>
        <p className="num text-[11px] text-ink-muted">
          {snap.instrument.displaySymbol} · {snap.instrument.currency} · {snap.instrument.exchange}
        </p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <PriceText snapshot={snap} size="lg" />
        <ChangeText snapshot={snap} size="lg" />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px]">
        {[
          [t('detail.open'), snap.quote?.open],
          [t('detail.previousClose'), snap.quote?.previousClose],
          [t('detail.dayRange'), snap.quote?.dayLow && snap.quote?.dayHigh ? `${snap.quote.dayLow} – ${snap.quote.dayHigh}` : null],
          [t('detail.volume'), snap.quote?.volume],
        ].map(([label, value]) => (
          <div key={String(label)} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="num text-right text-ink">{value === null || value === undefined ? '—' : String(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1 border-t border-line pt-2">
        <StateBadge status={snap.status} showReason />
        <div className="flex items-center gap-2">
          <QualityBadge snapshot={snap} />
          <StampLine snapshot={snap} exchange={snap.instrument.exchange} />
        </div>
      </div>
      <p className="text-[10.5px] leading-relaxed text-ink-faint">{t('detail.instrumentId')}: <span className="num">{snap.instrument.id}</span></p>
    </div>
  );
}
