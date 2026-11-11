# Architecture

TomTrader is a single-user local Node.js application: Next.js 16.4.5 App Router, React 19.3, TypeScript, Tailwind 4, Zustand, Lightweight Charts 5, and Node's SQLite implementation. No extra hosted database, Redis, broker connection or account is required.

`src/server/types.ts` defines instrument identity, quotes, OHLCV, provider capability results, feed tiers and market calendars. Stable keys include asset type, market and vendor-disambiguated ticker. Curated symbols and exchange mappings are separate from provider responses. Unknown or ambiguous symbols are not guessed across markets.

`src/server/providers/` translates external responses into domain types. `service.ts` owns provider routing, bounded waits, request deduplication, fallback, enrichment and freshness classification. `http.ts` implements host concurrency, request spacing, deadlines, retries and cooldown. Unsupported capabilities are explicit results. Keys exist only in server environment variables and official Finnhub authentication headers.

`cache.ts` keeps in-process TTL entries and SQLite snapshots. Cached values are shown immediately, with refresh behind them. Open/closed quote and history TTLs differ. `db.ts`/`userdata.ts` persist lists, positions, alert definitions, trigger history and instruments in a local WAL SQLite file. Database path is configurable and respected. User data is not silently deleted when market caches expire.

`realtime.ts` maintains one process-global hub, unions visible clients' interests, deduplicates symbols, polls REST feeds and sends snapshots via SSE. The browser uses one EventSource, exponential backoff, heartbeat watchdog and visibility pause/catch-up. This is not exchange WebSocket data. Alert evaluation shares snapshots with the UI; notifications require a running visible client and the local service. No background push service exists.

API routes expose domain JSON, never vendor credentials. Input types, finite numbers, ranges, actual dates and mutation origins are checked. SQL uses prepared statements. The local service has no authentication/multi-user isolation and binds to loopback by default.

Client stores separate preferences, user data and quote transport. Chart rendering is imperative behind an isolated component, using setData on instrument/range changes and updates without moving the user's window. Time values stay UTC; axis/legend format in the selected IANA timezone.

Desktop packaging uses Electron (`desktop/main.cjs`) with a sandboxed renderer and an Electron Node utility process running Next's standalone server on loopback. Staging strips local environment files and databases, includes static assets and license notices, and keeps runtime dependencies outside app.asar. Desktop user data lives in the OS application-data directory; a stored local port preserves the origin for browser preferences. Native macOS DMG/ZIP and Windows NSIS EXE builds are configured with electron-builder and GitHub Actions. See `docs/DESKTOP.md` for installation, signing requirements and remaining validation. Multi-user hosting would require authentication, per-user repositories, provider licensing, shared cache coordination and persistent background alert infrastructure; none is implied by this local build.
