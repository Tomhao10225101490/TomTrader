'use client';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { ContextPanel } from '@/components/shell/ContextPanel';
import { DemoBanner } from '@/components/shell/DemoBanner';
import { LiveProvider } from '@/components/shell/LiveProvider';
import { Sidebar } from '@/components/shell/Sidebar';
import { TickerTape } from '@/components/shell/TickerTape';
import { Toasts } from '@/components/shell/Toasts';
import { TopBar } from '@/components/shell/TopBar';
import { cn } from '@/lib/cn';
import { useMounted } from '@/lib/hooks';
import { I18nProvider } from '@/lib/i18n-context';
import { usePrefs } from '@/stores/prefs';
import { usePathname } from 'next/navigation';
import { useEffect,type ReactNode } from 'react';

/**
 * Application frame: top bar, ticker tape, left navigation, main region,
 * right context panel.
 *
 * The three columns are a real grid rather than absolutely positioned floats,
 * so the main column gets whatever width is left and never overlaps. On tablet
 * and phone the context panel leaves and the sidebar becomes a bottom tab bar,
 * which is a different information architecture — not a squeezed desktop.
 */

export function Shell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const pathname = usePathname();
  const panelOpen = usePrefs((s) => s.contextPanelOpen);
  const collapsed = usePrefs((s) => s.sidebarCollapsed);



  // Scroll to the top on navigation; a terminal that keeps your scroll
  // position when you change page feels broken.
  useEffect(() => {
    const main = document.getElementById('tt-main');
    main?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <I18nProvider>
      <LiveProvider>
        <div className="flex h-dvh flex-col overflow-hidden">
          {mounted ? <DemoBanner /> : <div className="h-[0px] shrink-0" />}
          {mounted ? <TopBar /> : <ChromeSkeleton />}
          {mounted ? <TickerTape /> : <div className="h-[26px] shrink-0 border-b border-line bg-surface" />}
          <div
            className="tt-shell-grid min-h-0 flex-1"
            style={{
              '--tt-sidebar-width': collapsed ? '52px' : '196px',
              '--tt-panel-width': panelOpen ? '316px' : '0px',
            } as React.CSSProperties}
          >
            <aside className="hidden min-h-0 border-r border-line bg-surface md:block">
              {mounted ? <Sidebar /> : <NavSkeleton />}
            </aside>
            <main id="tt-main" className="min-h-0 overflow-y-auto overflow-x-hidden bg-canvas">
              {/* A static skeleton is rendered until hydration completes so the
                  first paint is the real shape of the app, not a spinner. */}
              {mounted ? children : <RouteSkeleton />}
            </main>
            <aside className="hidden min-h-0 border-l border-line bg-surface xl:block" aria-hidden={!panelOpen}>
              {mounted && panelOpen ? <ContextPanel /> : null}
            </aside>
          </div>
          {mounted ? <MobileTabBar /> : null}
        </div>
        {mounted ? <CommandPalette /> : null}
        {mounted ? <Toasts /> : null}
      </LiveProvider>
    </I18nProvider>
  );
}

function ChromeSkeleton() {
  return (
    <header className="flex h-[44px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3" aria-hidden>
      <div className="h-[16px] w-[104px] rounded bg-surface-inset" />
      <div className="ml-2 h-[28px] max-w-[440px] flex-1 rounded-[var(--t-radius-sm)] bg-surface-inset" />
      <div className="ml-auto flex items-center gap-2">
        <div className="h-[16px] w-[92px] rounded bg-surface-inset" />
        <div className="h-[28px] w-[28px] rounded bg-surface-inset" />
      </div>
    </header>
  );
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-2 py-2" aria-hidden>
      {[3, 3, 3].map((n, i) => (
        <div key={i} className="flex flex-col gap-1">
          {Array.from({ length: n }, (_, j) => (
            <div key={j} className="h-[26px] rounded-[var(--t-radius-sm)] bg-surface-inset" />
          ))}
        </div>
      ))}
    </div>
  );
}

function RouteSkeleton() {
  return (
    <div className="p-4">
      <div className="mb-4 h-[18px] w-40 rounded bg-surface-inset" />
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[168px] rounded-[var(--t-radius)] border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}

function MobileTabBar() {
  const items = [
    { href: '/', label: 'Overview' },
    { href: '/markets', label: 'Markets' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/heatmap', label: 'Heatmap' },
    { href: '/portfolio', label: 'Portfolio' },
  ];
  return (
    <nav data-testid="mobile-tabs" className="flex shrink-0 items-stretch border-t border-line bg-surface md:hidden" aria-label="Primary">
      {items.map((item) => (
        <MobileTab key={item.href} {...item} />
      ))}
    </nav>
  );
}

function MobileTab({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <a
      href={href}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium',
        active ? 'text-accent' : 'text-ink-muted',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </a>
  );
}
