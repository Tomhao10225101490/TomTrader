# Performance report — 2026-11-08

Measurements are actual local production HTTP reads against a warm SQLite snapshot on 127.0.0.1:3102, Node v22.23.3. Ten sequential requests per endpoint include the entire response body. The reported p95 for ten samples is the largest observed sample; this is a small local benchmark, not a production SLA.

- `/`: median 7.49 ms, observed p95/max 106.88 ms, HTTP 200, 13582 response bytes.
- `/api/overview?mode=stale`: median 9.17 ms, observed p95/max 21.49 ms, HTTP 200, 53649 response bytes.
- `/api/search?q=AAPL`: median 5.76 ms, observed p95/max 13.09 ms, HTTP 200, 1008 response bytes.
- `/api/clock`: median 4.15 ms, observed p95/max 15.06 ms, HTTP 200, 6535 response bytes.
- `/api/status`: median 2.52 ms, observed p95/max 4.29 ms, HTTP 200, 8778 response bytes.

The real overview screenshot was ready after 920 ms including an intentional 700 ms settling wait. This is a measured page/DOM readiness observation with existing cached data, not Lighthouse LCP or a network cold-start guarantee.

The E2E suite restored and rendered 100 securities, reloaded the list, and retained the active group. This establishes functional behavior for that list size; no FPS, heap usage or sustained tick-rate claim is made.

Cache/HTTP design uses memory plus SQLite snapshots, stale-while-refresh, bounded provider waits, deduplicated flights, host pacing/cooldown, one browser stream and visibility-aware work. Historical bars refresh at most once a minute in a visible stock detail, preserving the viewed chart position and including missed bars after tab catch-up. No artificial tick-to-candle data is generated.

Five viewport checks recorded zero document overflow. [Raw measurements](evidence/benchmark.json) contain every sample; [browser measurements](evidence/real-acceptance.json) contain widths and page errors. No hardware-independent latency, internet-provider throughput, frame-rate or memory benchmark was fabricated.
