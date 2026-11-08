import type { Metadata,Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TomTrader — Global Markets, One View',
    template: '%s · TomTrader',
  },
  description:
    'TomTrader is a read-only global market terminal: market snapshots, exchange session states, watchlists, history charts, heatmap and portfolio tracking in one view.',
  applicationName: 'TomTrader',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f4' },
    { media: '(prefers-color-scheme: dark)', color: '#101215' },
  ],
};

/**
 * Theme bootstrap.
 *
 * Runs before the first paint, reading the same key zustand persists under.
 * Without it a dark-mode user gets a white flash on every load, which is the
 * single most common tell of a client-rendered theme.
 */
const themeBootstrap = `
(function () {
  try {
    var raw = localStorage.getItem('tomtrader.prefs.v1');
    var stored = raw ? JSON.parse(raw) : null;
    var prefs = stored && (stored.state || stored);
    var theme = prefs && prefs.theme ? prefs.theme : 'light';
    var system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var resolved = theme === 'system' ? system : theme;
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    root.dataset.theme = resolved;
    root.dataset.priceConvention = (prefs && prefs.convention) || 'intl';
    root.lang = (prefs && prefs.locale) === 'zh' ? 'zh-CN' : 'en';
  } catch (e) {
    /* a corrupt prefs blob must not blank the screen */
  }
})();
`;

/**
 * Fonts.
 *
 * The system stack is used on purpose: SF Pro/Segoe on desktop, PingFang SC
 * and Microsoft YaHei for Chinese, and no webfont round trip on the critical
 * path of an app that is judged by how fast it shows you a number.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
