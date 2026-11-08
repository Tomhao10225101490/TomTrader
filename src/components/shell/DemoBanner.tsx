'use client';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import { useLive } from '@/stores/live';
import { TriangleAlert } from 'lucide-react';
import { useEffect,useState } from 'react';

/**
 * Demo mode is a real feature for offline review and tests, and a real risk of
 * confusion, so the warning is permanent, high-contrast and outside the
 * content area: it cannot be scrolled away or hidden behind a panel.
 */
export function DemoBanner() {
  const { t, locale } = useI18n();
  const [personal, setPersonal] = useState(false);
  const [needsProvider, setNeedsProvider] = useState(false);
  const [demo, setDemo] = useState(false);
  const snapshots = useLive((s) => s.snapshots);
  const anyDemoSnapshot = Object.values(snapshots).some((s) => s.quote?.provider === 'demo' || s.quote?.quality === 'demo');

  useEffect(() => {
    let cancelled = false;
    void api.status().then((r) => {
      if (!cancelled) { setDemo(Boolean(r.data?.demoMode)); setPersonal(Boolean(r.data?.configuration?.publicFeedsEnabled && !r.data?.demoMode)); setNeedsProvider(Boolean(r.data && !r.data.demoMode && !r.data.configuration?.finnhubConfigured && !r.data.configuration?.publicFeedsEnabled)); }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demo && !anyDemoSnapshot && personal) return <div role="status" className="shrink-0 border-b border-line bg-surface-alt px-3 py-1 text-center text-[11px] text-ink-muted">{locale === 'zh' ? '免费 · 本地自用 · 公开行情源延迟未核实 · 按交易时段自动轮询' : 'Free · Local personal use · Public-feed delay unverified · Session-aware polling'}</div>;
  if (!demo && !anyDemoSnapshot) return needsProvider ? <div role="status" className="shrink-0 border-b border-line bg-surface-alt px-3 py-1 text-center text-[11px] text-ink-muted">{locale === 'zh' ? '尚未配置行情数据商 · 已有数据为本地缓存，来源与时间见各行标记' : 'Market data provider not configured · saved quotes are local cache; source and timestamps shown per instrument'}</div> : null;
  return (
    <div role="alert" className="flex shrink-0 items-center justify-center gap-2 bg-[var(--t-warn)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1a1408]">
      <TriangleAlert size={13} aria-hidden />
      <span>{t('shell.demoBanner')}</span>
      <span className="hidden font-normal normal-case tracking-normal opacity-80 sm:inline">— {t('shell.demoBannerDetail')}</span>
    </div>
  );
}
