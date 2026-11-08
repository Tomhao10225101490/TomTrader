'use client';
import { applyThemeToDocument,usePrefs,watchSystemTheme,type PriceConvention,type ThemeMode } from '@/stores/prefs';
import { createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import { EXCHANGES } from '../server/exchanges';
import { offsetMinutesAt,zoned } from '../server/marketstatus';
import type { ExchangeCode } from '../server/types';
import { zoneFor,type TimeZoneMode } from './format';
import { t as translate,type Locale,type StringKey } from './i18n';

/**
 * Presentation context: locale, price-colour convention and the timezone the
 * user asked to read clocks in.
 *
 * The timezone question has a trap in it. "Local" means the reader's machine,
 * "Exchange" means the venue's, and a single screen can contain both (the
 * market clock shows every venue in its own zone while the header shows the
 * reader's). Rather than one global string, components ask for the zone of the
 * instrument they are rendering, and the answer comes from the same Intl
 * database the server used to compute the session boundaries.
 */

interface I18nValue {
  locale: Locale;
  convention: PriceConvention;
  timeZoneMode: TimeZoneMode;
  /** The reader's own zone, resolved once. */
  localZone: string;
  /** Zone to display a venue's times in, given its exchange. */
  zoneOf: (exchange?: ExchangeCode) => string;
  /** Offset of that zone right now, for chart axis shifting. */
  offsetOf: (zone: string) => number;
  /** Format an instant in a venue's zone with the user's mode applied. */
  timeIn: (ms: number, exchange?: ExchangeCode, opts?: { seconds?: boolean; date?: boolean }) => string;
  /** Wall-clock parts of an instant in a zone (used by the market clock). */
  zoned: (ms: number, zone: string) => ReturnType<typeof zoned>;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = usePrefs((s) => s.locale);
  const convention = usePrefs((s) => s.convention);
  const timeZoneMode = usePrefs((s) => s.timeZone);
  const theme = usePrefs((s) => s.theme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  const [localZone, setLocalZone] = useState('UTC');

  useEffect(() => {
    // Read browser environment after hydration; the server uses a stable UTC fallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mq) setSystemTheme(mq.matches ? 'dark' : 'light');
    return watchSystemTheme(setSystemTheme);
  }, []);

  useEffect(() => {
    applyThemeToDocument({ theme, locale, convention });
  }, [theme, locale, convention]);

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  const zoneOf = useCallback(
    (exchange?: ExchangeCode) => {
      if (timeZoneMode === 'exchange') return exchange ? EXCHANGES[exchange].timezone : localZone;
      return zoneFor(timeZoneMode, exchange ? EXCHANGES[exchange].timezone : 'UTC');
    },
    [timeZoneMode, localZone],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      convention,
      timeZoneMode,
      localZone,
      zoneOf,
      offsetOf: (zone: string) => offsetMinutesAt(Date.now(), zone),
      timeIn: (ms, exchange, opts) =>
        new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
          timeZone: zoneOf(exchange),
          hour: '2-digit',
          minute: '2-digit',
          second: opts?.seconds ? '2-digit' : undefined,
          hour12: locale === 'en',
          ...(opts?.date ? { month: 'short', day: 'numeric' } : {}),
        }).format(new Date(ms)),
      zoned,
      t: (key, vars) => translate(locale, key, vars),
      theme,
      resolvedTheme,
    }),
    [locale, convention, timeZoneMode, localZone, zoneOf, theme, resolvedTheme],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}

/** Convenience for the very common `t(...)` call. */
export function useT() {
  return useI18n().t;
}
