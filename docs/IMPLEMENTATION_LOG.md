# Implementation log

## 2026-11-08 — resumed existing implementation

The inherited working tree already contained the Next.js terminal, 20 API routes, SQLite repositories, public vendor adapters, charts, watchlists, alerts, portfolio, bilingual preferences and tests. All pre-existing changes were preserved. No deployment, purchase or destructive Git operation was performed.

Initial baseline: TypeScript and production build passed; 153 tests were reported passed, but live-provider tests silently returned on failure. ESLint reported 44 errors. Initial browser acceptance failed on chart initialization, watchlist/portfolio/alert flows and non-isolated test data.

Implemented corrections:

- SQLite honors the configured file path; browser tests now run on port 3101 in a dedicated freshly created DEMO database. Port 3100 is the user's app. Synthetic default storage is separate from market data.
- Chart lifecycle initializes after asynchronous history creates the chart container; all series are rebuilt after granularity, palette and locale changes. Volume toggles populate history. Dates retain true UTC; the axis formats each bar in the selected timezone, including historical DST. OHLC crosshair reads original bars for all chart types.
- Global market clock resolves viewer midnight with the correct timezone direction. Unsupported/incomplete calendars report unavailable. Official 2026 SSE, HKEX, NYSE, LSE, JPX, Xetra and ASX schedules checked; corrected Chinese holiday dates, Hong Kong Easter/Chung Yeung and half days, Xetra/Euronext public-holiday errors, and US year-end hours.
- EURUSD/GBPUSD/AUDUSD quote inversion corrected, USD base preserved, TWD included, invalid rates refused. Portfolio import/export use matching field names; input currencies and real dates validated.
- Heatmaps use equal areas for the entire pool when any market cap is missing; weights of unlike units are never mixed. Local ticker hits no longer wait for remote discovery; obsolete palette/picker replies are ignored.
- Outbound limiter enforces start spacing, bounds queue waits and respects full vendor Retry-After. Provider exceptions are normalized and failover avoids repeating the identical failed primary batch.
- Official Finnhub server-side US quote adapter added. No key is configured in this environment, so account coverage/latency is not claimed as verified. Existing undocumented web feeds require explicit rights confirmation via server configuration. Connection status says Connected, not Live.
- Alert editing added; zero-minute cooldown preserved; malformed/unsupported updates refused. Stale quote alerts do not fire. Same-origin checks protect user-data mutations.
- Preferences bootstrap reads the Zustand persistence envelope. Active watchlist survives reload. Error and unavailable states remain explicit.

Verification and remaining external dependencies are recorded in TEST_REPORT.md, PERFORMANCE_REPORT.md and KNOWN_LIMITATIONS.md. These documents will contain measured final results, not inferred success.

Visual QA exposed an additional mobile defect: hidden sidebars left fixed grid tracks, clipping the main pane despite zero document overflow. Replaced the inline grid template with breakpoint-specific columns and strengthened mobile tests to assert actual content/chart width. Mutation regression also exposed NextResponse.json(undefined): the database write succeeded but the API returned 500. Void successes now return explicit `{ok:true}` JSON, with route regression coverage. Confirmed these were product issues rather than discarding failing tests.

Added 100-symbol list restoration, alert-edit/pause persistence and all five requested viewport checks. Real cached-data acceptance runs on port 3102 against a SQLite backup, so temporary QA holdings do not enter the user's database.

Initial inherited E2E configuration reused port 3100 and ignored TOMTRADER_DB, so the first diagnostic run briefly touched the original watchlist/alert data. After identifying the bug, subsequent runs moved to isolated 3101. Removed this run's attributable Semis group (created 00:47:59 local), SPY test alert/event (00:48:34), and restored the watchlist symbol edits from that run. Earlier pre-existing groups were preserved. Screenshot/valuation acceptance used a separate backup and example holdings.

Final checks: 155 Vitest tests passed, 12 explicitly skipped external-vendor checks, 44 Playwright tests passed, TypeScript/build/ESLint passed with zero lint warnings. Saved 12 real cached-data screenshots plus 17 clearly labelled Demo screenshots; no uncaught page errors in real acceptance. Official Fed RSS returned 19 original releases. The production app remains running locally on 127.0.0.1:3100; QA servers are stopped. Market data entitlements remain the explicit external dependency.


## User-authorized free local mode — 2026-11-08 follow-up

Enabled gitignored local personal configuration, without keys or purchases. Eastmoney now leads quotes/history across mapped CN/HK/US/global indices, Tencent fills quote gaps, and Yahoo backs off on 429. Fixed Yahoo batch response parsing; no alternate authentication path is attempted after access/rate rejection. Fixed a concurrent request-queue deadlock, validated finite Eastmoney placeholders/OHLC, corrected true calendar range cutoffs, decoded Tencent GB18030 and interpreted slash-form US timestamps in New York time. Instrument-specific unsupported responses no longer disable a whole provider.

Completed vendor refreshes now notify SSE immediately, including new receive-time/provider information when the exchange print is unchanged. Sources and full source dates are visible in quote rows; chart captions include source, delay tier, last bar time and adjustment. Local personal mode has a permanent unknown-delay strip. Mobile rows wrap timestamp metadata rather than cutting it off.

Clean-memory real network evidence: 89 Eastmoney quotes, 79 Tencent quotes, 70 shared comparisons, nine Tencent failovers; core coverage 20 CN / 13 HK / 38 US equities+ETFs / 22 global indices, plus five commodities. All 33 history probes passed. Yahoo 429 and four missing indices are preserved in evidence. Fresh production API/SSE acceptance: five fresh quotes, four histories, cold-start SSE 238ms. Browser acceptance: 12 screenshots, 12 actual CN/HK/US chart-range interactions and five viewport sizes with no errors/overflow. Dedicated QA DBs are isolated from user portfolio data. Fixed the stream regression test's environment initialization before module imports so the test truly exercises Demo provider responses.

Final regression: 163 Vitest tests passed, 12 optional external checks skipped; 44 full Playwright journeys passed. See TEST_REPORT.md and evidence/free-feeds.json for measured coverage and explicit limits. The local production application is configured for real free personal feeds on 127.0.0.1:3100.
