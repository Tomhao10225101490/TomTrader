'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '../lib/i18n';
import type { CurrencyCode } from '../server/types';

/**
 * User preferences.
 *
 * Deliberately the *only* thing in localStorage besides the last-known theme:
 * preferences must apply before the first paint (no theme flash, correct price
 * colours from the first frame), which a server round trip cannot guarantee.
 * Everything that is data — lists, holdings, alerts — lives in SQLite so it
 * survives a cleared browser profile.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type PriceConvention = 'intl' | 'cn';
export type TimeZoneMode = 'local' | 'exchange' | 'utc' | 'newyork' | 'shanghai';
export type RefreshPolicy = 'auto' | 'slow' | 'off';
export type WatchlistView = 'table' | 'compact';
export type WatchlistSort = 'manual' | 'name' | 'change' | 'price' | 'market';

export interface Prefs {
  theme: ThemeMode;
  locale: Locale;
  convention: PriceConvention;
  timeZone: TimeZoneMode;
  valuationCurrency: CurrencyCode;
  refreshPolicy: RefreshPolicy;
  watchlistView: WatchlistView;
  watchlistSort: Record<string, WatchlistSort>;
  contextPanelOpen: boolean;
  contextPanelTab: 'watchlist' | 'market' | 'summary';
  notificationsOptIn: boolean;
  recentSearches: string[];
  sidebarCollapsed: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'light',
  locale: 'en',
  convention: 'intl',
  timeZone: 'local',
  valuationCurrency: 'USD',
  refreshPolicy: 'auto',
  watchlistView: 'table',
  watchlistSort: {},
  contextPanelOpen: true,
  contextPanelTab: 'watchlist',
  notificationsOptIn: false,
  recentSearches: [],
  sidebarCollapsed: false,
};

interface PrefsStore extends Prefs {
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  pushRecentSearch: (entry: string) => void;
  reset: () => void;
  ready: boolean;
  markReady: () => void;
}

/**
 * First-run language follows the browser, because a Chinese-speaking user
 * should not have to find the setting before the app speaks their language.
 * After they touch the control, their explicit choice wins forever.
 */
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const tag = navigator.language ?? 'en';
  return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function detectTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const usePrefs = create<PrefsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      locale: DEFAULT_PREFS.locale,
      ready: false,
      markReady: () => set({ ready: true }),
      set: (key, value) => set({ [key]: value } as never),
      pushRecentSearch: (entry) =>
        set({ recentSearches: [entry, ...get().recentSearches.filter((e) => e !== entry)].slice(0, 8) }),
      reset: () => set({ ...DEFAULT_PREFS, ready: true }),
    }),
    {
      name: 'tomtrader.prefs.v1',
      partialize: (state) => {
        const { ready: _ready, markReady: _m, set: _s, pushRecentSearch: _p, reset: _r, ...data } = state;
        void _ready;
        void _m;
        void _s;
        void _p;
        void _r;
        return data as Prefs;
      },
      onRehydrateStorage: () => (state) => {
        // No stored value yet: fall back to detection rather than English-only.
        if (state && !localStorage.getItem('tomtrader.prefs.v1')) state.locale = detectLocale();
        state?.markReady();
      },
    },
  ),
);

/** Applied once on mount to seed detection before hydration completes. */
export function seedLocaleIfFirstRun(): Locale {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('tomtrader.prefs.v1');
  if (stored) return usePrefs.getState().locale;
  const detected = detectLocale();
  usePrefs.setState({ locale: detected });
  return detected;
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return detectTheme();
  return mode;
}

/**
 * Paints the html element's theme hooks. Called from an inline script in the
 * document head *and* after hydration, so the very first frame is already
 * correct — a dark-mode app that flashes white is the classic tell of a
 * client-rendered theme.
 */
export function applyThemeToDocument(prefs: Pick<Prefs, 'theme' | 'locale' | 'convention'>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = resolveTheme(prefs.theme);
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.dataset.priceConvention = prefs.convention;
  root.lang = prefs.locale === 'zh' ? 'zh-CN' : 'en';
  root.dataset.ttReady = '1';
}

/** The theme attribute used by `window.matchMedia` listeners in system mode. */
export function watchSystemTheme(callback: (theme: 'light' | 'dark') => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => callback(e.matches ? 'dark' : 'light');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
