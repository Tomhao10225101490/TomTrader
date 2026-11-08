'use client';
import { cn } from '@/lib/cn';
import type { StringKey } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { CALENDAR_VERSION } from '@/server/holidays';
import { usePrefs } from '@/stores/prefs';
import { Activity,Bell,Briefcase,Columns3,Compass,Flame,Home,ListChecks,Newspaper,PanelLeftClose,PanelLeftOpen,Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Left navigation, grouped the way a user thinks about the day: what is
 * happening (monitor), where to look next (research), what is mine (personal).
 * Collapsed it becomes a 52px icon rail with the same order, so muscle memory
 * survives the collapse.
 */

interface Item {
  href: string;
  key: StringKey;
  icon: typeof Home;
}

const GROUPS: { titleKey: StringKey; items: Item[] }[] = [
  {
    titleKey: 'nav.section.monitor',
    items: [
      { href: '/', key: 'nav.overview', icon: Home },
      { href: '/markets', key: 'nav.markets', icon: Activity },
      { href: '/watchlist', key: 'nav.watchlist', icon: ListChecks },
      { href: '/heatmap', key: 'nav.heatmap', icon: Flame },
    ],
  },
  {
    titleKey: 'nav.section.research',
    items: [
      { href: '/explore', key: 'nav.explore', icon: Compass },
      { href: '/clock', key: 'overview.clock', icon: Columns3 },
      { href: '/news', key: 'nav.news', icon: Newspaper },
    ],
  },
  {
    titleKey: 'nav.section.personal',
    items: [
      { href: '/portfolio', key: 'nav.portfolio', icon: Briefcase },
      { href: '/alerts', key: 'nav.alerts', icon: Bell },
      { href: '/settings', key: 'nav.settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const collapsed = usePrefs((s) => s.sidebarCollapsed);
  const set = usePrefs((s) => s.set);

  return (
    <nav className="flex h-full flex-col justify-between overflow-y-auto py-2" aria-label="Primary">
      <div className="flex flex-col gap-4 px-2">
        {GROUPS.map((group) => (
          <div key={group.titleKey} className="flex flex-col gap-0.5">
            {!collapsed && <p className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-ink-faint">{t(group.titleKey)}</p>}
            {group.items.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? t(item.key) : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-[var(--t-radius-sm)] px-2 py-[6px] text-[12.5px] no-underline transition-colors',
                    active ? 'bg-accent-soft font-medium text-accent' : 'text-ink-secondary hover:bg-surface-alt hover:text-ink',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <Icon size={15} strokeWidth={active ? 1.9 : 1.6} className="shrink-0" />
                  {!collapsed && <span className="truncate">{t(item.key)}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 px-2">
        <button
          type="button"
          onClick={() => set('sidebarCollapsed', !collapsed)}
          className={cn(
            'flex items-center gap-2 rounded-[var(--t-radius-sm)] px-2 py-[6px] text-[11.5px] text-ink-muted hover:bg-surface-alt hover:text-ink',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && (
          <p className="px-2 pb-1 text-[10px] leading-relaxed text-ink-faint">
            v1.0 · calendar {CALENDAR_VERSION}
            <br />
            read-only market information
          </p>
        )}
      </div>
    </nav>
  );
}
