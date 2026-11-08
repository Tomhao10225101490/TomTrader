import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Cache Components (PPR) is Next 16's opt-in rendering model. TomTrader is a
   * live-data terminal: almost every surface is intentionally dynamic, and the
   * caching that matters is the market-data cache in src/server/cache.ts, which
   * has TTLs tied to venue session state. Static-fragment caching would fight
   * that, so it stays off and route handlers declare themselves dynamic.
   */
  cacheComponents: false,

  /**
   * Tailwind v4 with Turbopack: the stylesheet must go through
   * @tailwindcss/turbopack, otherwise `@theme`/`@custom-variant` are unknown
   * at-rules and no utility classes are generated — the app renders as
   * unstyled HTML while typechecking perfectly.
   */
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },

  /** node:sqlite is a runtime builtin; keep it out of the bundler's graph. */
  serverExternalPackages: ['node:sqlite'],

  /**
   * Nothing in the app loads third-party scripts, images or fonts. A strict
   * policy is the cheap way to keep that true as the product grows.
   */
  headers: async () => [
    {
      // The dev HMR websocket upgrade must not be touched by custom headers,
      // so the matcher excludes /_next/*.
      source: '/((?!_next/).*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
};

export default nextConfig;
