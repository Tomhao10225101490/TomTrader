# Visual acceptance — 2026-11-08

## Real keyless personal-feed captures

All twelve images below were captured by tools/acceptance.mts from the actual production application with keyless personal feeds enabled. The dedicated SQLite database started empty for the API/SSE check; screenshots then used the newly received vendor responses. No image generation, composites or retouching were used. The permanent personal-use/unknown-delay strip and individual source/cache/unavailable labels remain visible. This is evidence of working public sources, not an exchange real-time entitlement.

- [01-global-overview-light.png](screenshots/real/01-global-overview-light.png)
- [02-global-overview-dark.png](screenshots/real/02-global-overview-dark.png)
- [03-us-stock-detail.png](screenshots/real/03-us-stock-detail.png) — actual public-source OHLCV chart
- [04-china-stock-detail.png](screenshots/real/04-china-stock-detail.png) — actual public-source OHLCV chart
- [05-candlestick-chart.png](screenshots/real/05-candlestick-chart.png) — actual public-source OHLCV chart
- [06-watchlist.png](screenshots/real/06-watchlist.png)
- [07-market-heatmap.png](screenshots/real/07-market-heatmap.png)
- [08-global-market-clock.png](screenshots/real/08-global-market-clock.png)
- [09-portfolio.png](screenshots/real/09-portfolio.png)
- [10-mobile-overview.png](screenshots/real/10-mobile-overview.png)
- [11-mobile-stock-detail.png](screenshots/real/11-mobile-stock-detail.png) — actual public-source OHLCV chart
- [12-settings.png](screenshots/real/12-settings.png)

The portfolio capture shows the fresh test installation's empty portfolio. No QA positions were inserted into the user's database. Twelve real chart-range interactions passed for CN/HK/US across 1D, 5D, 1M and 1Y; canvas captions contain actual positive bar counts.

## Inspection and iteration

Inspected the real overview, US detail, mobile overview and portfolio, plus Demo dark overview, candlesticks and phone detail. Fixed mobile grid tracks that clipped content, then fixed index-row columns so price/change remain inside the phone viewport. Added a global region strip, preserved sparklines through stream merges, removed developer-facing vendor-wait controls, and corrected chart/theme/convention handling.

Charts show OHLCV, source time and adjustment captions. Missing fundamentals, Russell/VIX or other vendor gaps remain visible. Dark theme uses separate low-glare surfaces. Lists use compact aligned rows; there are no decorative gradients, generated concept assets or marketing sections.

All requested sizes were checked: 1920×1080, 1440×900, 1280×800, 768×1024, 390×844. Main content widths were 1920: 1408px, 1440: 928px, 1280: 768px, 768: 572px, 390: 390px. Document horizontal overflow was zero for every recorded size. Internal wide portfolio/watchlist tables may scroll within their own containers.

## Demo captures

Seventeen additional images under screenshots/demo/ show offline interactions with a permanent synthetic-data banner. They cover additional Chinese/convention/news/alerts views. Playwright's screenshot tests do not substitute these images for real-market verification.

[Machine-readable capture evidence](evidence/real-acceptance.json) records every route, viewport, quality badge, chart presence and browser errors. Full cross-browser and screen-reader audits remain outside the completed checks.
