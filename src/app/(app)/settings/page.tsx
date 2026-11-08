'use client';
import { Block,Page } from '@/components/Page';
import { Button,ErrorState,Segmented,SelectInput } from '@/components/ui';
import { api } from '@/lib/api';
import { formatAgo,formatClock } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { clearAllUserDataLocal } from '@/lib/localReset';
import { useAsync } from '@/lib/useAsync';
import { CALENDAR_VERSION } from '@/server/holidays';
import type { CurrencyCode } from '@/server/types';
import { usePrefs,type TimeZoneMode } from '@/stores/prefs';
import { useCallback,useEffect,useState } from 'react';

/**
 * Settings. Everything here is a preference the user can see take effect
 * immediately; the data section below is read-only evidence about where the
 * numbers on the screen came from, which is the part most dashboards leave out.
 */
export default function SettingsPage() {
  const now = useNow() ?? 0;
  const { t, locale, resolvedTheme } = useI18n();
  const prefs = usePrefs();
  const set = usePrefs((s) => s.set);
  const [statusNonce, setStatusNonce] = useState(0);

  const status = useAsync(useCallback(async () => (await api.status()).data, []), [statusNonce]);
  const data = status.data;

  useEffect(() => {
    const id = setInterval(() => setStatusNonce((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Page title={t('settings.title')} subtitle={t('settings.privacy')}>
      <div className="grid gap-4 xl:grid-cols-2">
        <Block title={t('settings.appearance')}>
          <div className="flex flex-col gap-3 p-3">
            <Row label={t('settings.theme')}>
              <Segmented
                value={prefs.theme}
                onChange={(v) => set('theme', v)}
                options={[
                  { value: 'light', label: t('settings.theme.light') },
                  { value: 'dark', label: t('settings.theme.dark') },
                  { value: 'system', label: t('settings.theme.system') },
                ]}
              />
            </Row>
            <Row label={t('settings.language')}>
              <Segmented
                value={prefs.locale}
                onChange={(v) => set('locale', v)}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'zh', label: '简体中文' },
                ]}
              />
            </Row>
            <Row label={t('settings.convention')} hint={locale === 'zh' ? '影响所有涨跌颜色与热力图' : 'Applies to every change cell and the heatmap'}>
              <Segmented
                value={prefs.convention}
                onChange={(v) => set('convention', v)}
                options={[
                  { value: 'intl', label: t('settings.convention.intl') },
                  { value: 'cn', label: t('settings.convention.cn') },
                ]}
              />
            </Row>
            <div className="flex items-center justify-between gap-4 rounded-[var(--t-radius-sm)] border border-line bg-surface-alt px-2 py-1.5">
              <span className="text-[11px] text-ink-muted">{locale === 'zh' ? '预览' : 'preview'}</span>
              <span className="flex items-center gap-3 text-[13px]">
                <span className="num text-[var(--t-up)]">▲ +1.25%</span>
                <span className="num text-[var(--t-down)]">▼ −0.48%</span>
                <span className="num text-[var(--t-flat)]">– 0.00%</span>
              </span>
            </div>
          </div>
        </Block>

        <Block title={t('settings.data')}>
          <div className="flex flex-col gap-3 p-3">
            <Row label={t('settings.timezone')}>
              <SelectInput
                value={prefs.timeZone}
                onChange={(v) => set('timeZone', v as TimeZoneMode)}
                options={[
                  { value: 'local', label: `${t('clock.tz.local')} (${Intl.DateTimeFormat().resolvedOptions().timeZone})` },
                  { value: 'exchange', label: t('clock.tz.exchange') },
                  { value: 'newyork', label: t('clock.tz.newyork') },
                  { value: 'shanghai', label: t('clock.tz.shanghai') },
                  { value: 'utc', label: t('clock.tz.utc') },
                ]}
              />
            </Row>
            <Row label={t('settings.currency')} hint={t('portfolio.valuationCurrency')}>
              <SelectInput
                value={prefs.valuationCurrency}
                onChange={(v) => set('valuationCurrency', v as CurrencyCode)}
                options={['USD', 'CNY', 'HKD', 'EUR', 'JPY', 'GBP', 'KRW', 'AUD'].map((c) => ({ value: c, label: c }))}
              />
            </Row>
            <Row label={t('settings.refresh')} hint={locale === 'zh' ? '自动模式按交易所开闭状态调整频率' : 'Automatic cadence follows each venue’s session state'}>
              <Segmented
                value={prefs.refreshPolicy}
                onChange={(v) => set('refreshPolicy', v)}
                options={[
                  { value: 'auto', label: t('settings.refresh.auto') },
                  { value: 'slow', label: t('settings.refresh.slow') },
                  { value: 'off', label: t('settings.refresh.off') },
                ]}
              />
            </Row>
            <Row label={t('settings.cache')}>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setStatusNonce((n) => n + 1)}>{t('common.retry')}</Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!window.confirm(t('settings.confirmReset'))) return;
                    await fetch('/api/watchlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'noop' }) }).catch(() => undefined);
                    clearAllUserDataLocal();
                    prefs.reset();
                    setStatusNonce((n) => n + 1);
                  }}
                >
                  {t('settings.resetAll')}
                </Button>
              </div>
            </Row>
          </div>
        </Block>
      </div>

      <Block
        title={t('settings.providers')}
        subtitle={data ? `${t('settings.calendarVersion')} ${CALENDAR_VERSION} · ${t('settings.lastUpdate')} ${formatAgo(data.generatedAt, now, locale)}` : undefined}
        right={<Button size="sm" onClick={() => setStatusNonce((n) => n + 1)}>{t('common.retry')}</Button>}
        flush
      >
        {status.error && !data ? <div className="p-3"><ErrorState title={status.error} onRetry={status.reload} /></div> : null}
        {data ? (
          <div className="divide-y divide-line-faint">
            {data.providers.map((provider) => (
              <div key={provider.provider} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                <span
                  className={`led mt-1 ${provider.ok ? 'bg-[var(--t-up)]' : 'bg-[var(--t-down)]'}`}
                  title={provider.ok ? 'ok' : 'error'}
                />
                <div className="min-w-[200px] flex-1">
                  <p className="text-[12.5px] font-medium text-ink">{provider.label}</p>
                  <p className="text-[10.5px] leading-relaxed text-ink-muted">{provider.note}</p>
                  <p className="num mt-0.5 text-[10px] text-ink-faint">
                    {provider.lastSuccessAt ? `${t('common.updated')} ${formatClock(provider.lastSuccessAt, 'UTC', locale, { seconds: true })}Z` : t('common.unknown')}
                    {provider.cooldownMs > 0 ? ` · cooling down ${Math.round(provider.cooldownMs / 1000)}s` : ''}
                    {provider.consecutiveErrors > 0 ? ` · ${provider.consecutiveErrors} consecutive errors` : ''}
                  </p>
                </div>
                <div className="w-[168px] shrink-0 text-right">
                  <p className="text-[10.5px] text-ink-muted">{t('quality.tier')}: <span className="num">{provider.tier}</span></p>
                  {provider.lastError ? <p className="mt-0.5 break-words text-[10px] leading-snug text-[var(--t-down)]">{provider.lastError}</p> : null}
                </div>
              </div>
            ))}

            <div className="grid gap-x-6 gap-y-1 px-3 py-2.5 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="stream" value={data.hub.clients ? `${data.hub.clients} client(s)` : 'idle'} />
              <Stat label="poll interval" value={data.hub.pollingIntervalMs ? `${(data.hub.pollingIntervalMs / 1000).toFixed(0)}s` : '—'} />
              <Stat label="subscribed" value={String(data.hub.subscribed)} />
              <Stat label="cache entries" value={String(data.cache.entries)} />
              <Stat label="in flight" value={String(data.cache.flights)} />
              <Stat label="universe" value={`${data.universe.size} instruments`} />
              <Stat label="database" value={data.dbPath || ':memory:'} mono />
              <Stat label="demo mode" value={data.demoMode ? 'ON' : 'off'} />
              <Stat label="last refresh" value={data.hub.lastRefreshAt ? formatClock(data.hub.lastRefreshAt, 'UTC', locale, { seconds: true }) : '—'} />
            </div>

            {data.recentEvents.length ? (
              <details className="px-3 py-2">
                <summary className="cursor-pointer text-[11px] text-ink-muted">{t('common.showMore')} — {data.recentEvents.length} provider events</summary>
                <ul className="num mt-1.5 max-h-[180px] space-y-0.5 overflow-y-auto text-[10px] text-ink-faint">
                  {data.recentEvents.slice(0, 25).map((e, i) => (
                    <li key={i}>
                      {formatClock(e.ts, 'UTC', locale, { seconds: true })}Z {e.provider}/{e.op} → {e.outcome}
                      {e.detail ? ` · ${e.detail}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="px-3 py-4 text-[12px] text-ink-muted">{t('common.loading')}</p>
        )}
      </Block>

      <Block title={t('settings.about')}>
        <div className="flex flex-col gap-2 p-3 text-[12px] leading-relaxed text-ink-secondary">
          <p>
            <strong className="font-semibold text-ink">TomTrader</strong> — {t('app.tagline')} · v1.0.0
          </p>
          <p>{t('settings.aboutBody')}</p>
          <p className="text-[11px] text-ink-muted">
            {locale === 'zh'
              ? '本机构成的行情来自未公开延迟说明的免费数据源，因此界面永远不会出现“实时”标签，除非接入已获授权的供应商。完整的数据来源、延迟与许可说明见 docs/MARKET_DATA_PROVIDERS.md。'
              : 'Quotes come from free endpoints whose latency the vendors do not document, so the UI will never show a “Real-time” badge unless a licensed provider is connected. Sources, delays and licensing are listed in docs/MARKET_DATA_PROVIDERS.md.'}
          </p>
          <p className="text-[11px] text-ink-faint">
            {Object.entries({ en: 'English', zh: '简体中文' }).length} languages · {resolvedTheme} · {marketName(locale, 'US')} {formatClock(now, 'America/New_York', locale, { seconds: true })}
          </p>
        </div>
      </Block>
    </Page>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-[180px] flex-1">
        <p className="text-[12.5px] text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line-faint py-0.5 last:border-b-0">
      <span className="text-[10.5px] uppercase tracking-[0.04em] text-ink-faint">{label}</span>
      <span className={`${mono ? 'font-mono text-[10.5px]' : 'num'} truncate text-right text-[11.5px] text-ink-secondary`} title={value}>
        {value}
      </span>
    </div>
  );
}
