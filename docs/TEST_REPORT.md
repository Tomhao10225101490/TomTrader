# Test report — 2026-11-08

Environment: macOS, Node v22.23.3, Next.js 16.4.5 production build, installed Google Chrome via Playwright. No market-data API key was configured.

## Final results

- TypeScript: npm run typecheck passed.
- ESLint: npm run lint passed, zero errors and zero warnings.
- Production build: npm run build passed; application pages and dynamic stock/API routes generated.
- Vitest: 163 passed, 12 explicitly skipped, 0 failed, 17 files.
- Unit tests: 132 passed, 0 skipped.
- Integration tests: 31 passed, 12 skipped.
- Playwright: 44 passed, 0 failed, 0 skipped, approximately 1.2 minutes. This suite uses the isolated DEMO provider/database on port 3101.
- Final mobile wrapping follow-up: 4/4 Playwright checks passed after the metadata layout adjustment.
- Official calendar regression command: 8 assertions passed.
- Real personal-feed browser acceptance: 12 screenshots and 12 chart-range interactions passed, zero uncaught page errors. All five target viewport sizes had zero document horizontal overflow.
- Credential boundary: built browser static bundles contain no FINNHUB_API_KEY or X-Finnhub-Token references. No actual key was available for a canary-value leak test.

## What was exercised

Unit coverage includes formatting/currencies, freshness, cache TTL/single-flight, HTTP retry/timeout/cooldown, provider parsers and symbol identity, market calendars/DST/lunch/half days, alert conditions/cooldown, watchlist persistence and actual database-path isolation. Regressions also cover FIFO request-queue draining, GB18030 decoding, raw 429 backoff, finite vendor values, exchange-local historical date windows, slash-form US timestamps and completed-background-response SSE delivery.

Route integration uses explicitly labelled synthetic quotes and test-only FX fixtures. It tests search, bars, metadata, malformed IDs/intervals/bodies, lists, portfolio conversion/import-export, alert updates and the SSE hub. Successful void mutations are asserted as valid JSON, not an accidental 500 after a database write.

Browser journeys cover overview, Cmd/Ctrl+K search, stock detail and all chart types/ranges, watchlist add/remove/create/delete and persistence, theme/language/convention persistence, heatmap, portfolio add/remove, alert trigger history, alert editing/pause, unavailable news in Demo and API resilience. Added checks restore/render a 100-symbol watchlist and assert actual content/chart widths, not only absence of document scrollbars.

## Actual keyless network verification — separate from Demo

`TOMTRADER_PUBLIC_FEEDS=1 npm run verify:free-feeds` used an isolated in-memory database and no persisted quote cache. Eastmoney returned 89/98 mapped quotes; Tencent returned 79/79 eligible quotes. Cross-source comparison recorded 70 shared instruments with prices and timestamp skew; no difference exceeded 1% in this run. This is a consistency sample, not an authoritative exchange audit.

The production routing pipeline recovered nine missing US stocks/ETFs with Tencent. Core coverage: A-shares 20/20, HK equities 13/13, US equities 32/32, US ETFs 6/6, global indices 22/26. Five commodity quotes also succeeded. All 33 historical requests passed: 1D/5D/1M/1Y for 600519, 00700 and AAPL, plus 1M for 21 indices. These are real HTTP responses, not mock-provider assertions. The curated universe is not full-market coverage.

Yahoo returned 429 and was put in backoff; Russell 2000, VIX, TOPIX and Nifty 50 did not receive quotes. Six trading-FX quote instruments also remained unavailable (the separate daily reference-FX path is unaffected). Other international stocks outside the requested CN/HK/US scope are not claimed as verified. The 12 legacy optional live-vendor checks remain skipped in the default suite; they are not counted as passed. No official API account/key or real-time entitlement was tested.

`tools/verify-free-app.mts` then targeted a fresh dedicated SQLite database on production port 3102: cold-start SSE delivered a newly fetched quote in 238ms, five fresh quotes passed source/tier/receive-time checks (including Tencent BRK-B fallback), and four historical API series passed. `tools/acceptance.mts` checked 12 real browser chart combinations across CN/HK/US (1D/5D/1M/1Y), captured 12 screens, and found zero page errors/viewport overflow. Sunday prints are labelled closed-session cache with actual source dates; fresh receipt is not claimed as fresh exchange activity.

## External limits

No documented public-feed delay or uptime SLA is known. Every public-source tier remains unverified. Browser Demo tests verify interactions, not financial prices. No sustained open-session load, complete market coverage, or official exchange-wide live feed is claimed.

## Evidence

Machine-readable results: [Vitest](evidence/vitest.json), [Playwright](evidence/playwright.json), [real acceptance](evidence/real-acceptance.json), [keyless network](evidence/free-feeds.json), [fresh production APIs/SSE](evidence/free-app.json), [news](evidence/news.json). CLI output is archived under evidence/. Current free-feed screenshots use the dedicated free-acceptance database on port 3102 with no portfolio mutations. Browser mutation tests use the separate Demo database on 3101. The user's original portfolio is untouched by these checks.
