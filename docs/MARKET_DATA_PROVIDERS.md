# Market data providers — checked 2026-11-08

## Connected implementation

Finnhub official API adapter uses `/api/v1/quote`, with server-only `FINNHUB_API_KEY` in `X-Finnhub-Token`. The shipped adapter requests US equities/ETFs only. Missing OHLC/change/volume fields remain null. It does not assume international indices, historical candles, company profiles or push subscriptions are included. Requests are serial and start at least 2.1 seconds apart. Vendor Retry-After takes precedence.

No key was available for this handoff. Endpoint documentation and pricing pages are JavaScript applications and did not yield readable plan tables in the research tool, so current free limits, account entitlement and latency were **not verified**. Do not infer a pricing tier from the adapter existing. The API's response schema was cross-checked with the provider's official SDK model. `FINNHUB_FEED_TIER=unverified` remains the default; change only from actual account documentation.

Sources: [Finnhub quote docs](https://finnhub.io/docs/api/quote), [pricing](https://finnhub.io/pricing), [official Quote model](https://github.com/Finnhub-Stock-API/finnhub-go/blob/master/docs/Quote.md?plain=1), [authentication discussion in official project](https://github.com/finnhubio/Finnhub-API/issues/301).

## Keyless local personal adapters

The user explicitly selected free local personal use on 2026-11-08. This installation enables `TOMTRADER_PUBLIC_FEEDS=1`, `TOMTRADER_DATA_MODE=personal`, `TOMTRADER_DEMO=0` in gitignored `.env.local`. No API key, subscription, Python sidecar or paid service is required. A fresh checkout keeps the switch off until configured.

Routing is Eastmoney first for mapped securities/indices, Tencent for quote gaps, then Yahoo as a best-effort fallback. Optional official Finnhub US quotes still take priority when a key exists. Tencent supplies quotes, not history. Yahoo returned HTTP 429 in this test; the adapter backs off for 30 minutes without trying an alternative authentication path. No IP rotation or access-control workaround is implemented. Instrument-specific missing data does not incorrectly disable an otherwise working provider.

Actual clean-memory network run: Eastmoney returned 89/98 requested mapped quotes; Tencent returned 79/79 eligible quotes. The service recovered nine missing US securities/ETFs through Tencent. Final coverage: 20 A-shares, 13 HK equities, 32 US equities, six US ETFs, five commodities, 22/26 global indices. All 33 tested Eastmoney historical requests succeeded: four ranges each for 600519/00700/AAPL, plus 21 index month histories. Six FX trading-quote instruments and Russell 2000/VIX/TOPIX/Nifty 50 remain unavailable; daily reference FX is a separate capability. This is a curated universe, not a market-wide completeness claim. [Full results](evidence/free-feeds.json).

All public quotes/history retain tier `unverified`. No fixed delay is invented from request success or the time between requests. Source date/time and local receipt time are distinct. The tested Sunday response contains earlier session prints. Daily histories declare forward/dividend adjustment; intraday bars are raw. Public website endpoints have no verified availability contract or global real-time entitlement; this local personal configuration does not establish redistribution rights.

Host requests are serialized with at least one second between starts, bounded queue deadlines, explicit retries/cooldowns and vendor Retry-After respected. The queue now reserves slots before waking each waiter, preventing stalled concurrent chart loads. Tencent GB18030 decoding and US exchange-local timestamps are verified. Shared SSE subscriptions receive completed background responses immediately rather than waiting for the next closed-market poll.

## Open reference data

[ExchangeRate-API Open Access](https://www.exchangerate-api.com/docs/free) supplies USD reference rates via open.er-api.com. These are daily reference values, labeled end-of-day, not executable FX. Attribution links are provided in the portfolio. Same-currency valuation does not require FX. Missing pairs never become an implicit 1:1 conversion.

[Federal Reserve press-release RSS](https://www.federalreserve.gov/feeds/press_all.xml) supplies official policy releases. Original titles, dates, publisher and URLs are retained. No fabricated news, article bodies or generated summaries are included. External wire/per-symbol feeds require the public-feed rights switch.

## Alternatives evaluated

[Twelve Data individual pricing](https://twelvedata.com/pricing) and [credits](https://support.twelvedata.com/en/articles/5615854-credits) describe credit-weighted endpoints; the checked credit documentation states an 800 daily Basic quota, and batched symbols still consume individual credits. [Usage guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage) distinguishes personal/internal, display, AI and portfolio rights. A free key must not be assumed to authorize this terminal's complete use. No adapter or plan purchase was activated.

[Massive documentation](https://massive.com/docs), [Alpha Vantage](https://www.alphavantage.co/documentation/), [FMP](https://site.financialmodelingprep.com/developer/docs), and [Nasdaq Data Link](https://docs.data.nasdaq.com/) remain alternatives, not connected providers. Their exact current packages and redistribution rights were not verified for this account; no price, coverage or free-real-time claim is made.

## Honest limits

No subscription was purchased, no cloud service was provisioned and no app was deployed publicly. Obtaining exchange-licensed global real-time data remains an external entitlement dependency. A Finnhub quote key alone does not make the entire global/history product live.

## Follow-up: free tiers and open-source implementations (2026-11-08)

No API key does not mean a paid subscription is required. There are both keyless community adapters and official zero-cost accounts. This research inspected repository source, not just project descriptions. The later user-authorized keyless implementation and network evidence are recorded above; no official live account was tested.

### Keyless community implementations

- [Ghostfolio Yahoo service](https://github.com/ghostfolio/ghostfolio/blob/main/apps/api/src/services/data-provider/yahoo-finance/yahoo-finance.service.ts) actually imports `yahoo-finance2`, marks Yahoo as non-premium, and implements quotes, history and search through that library. [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) fits TomTrader's Node/TypeScript runtime; it is an unofficial wrapper with no vendor availability guarantee.
- [OpenBB provider documentation](https://docs.openbb.co/odp/v4/python/extensions/providers) lists `openbb-yfinance` without a key. The [yfinance README](https://github.com/ranaroussi/yfinance) describes research/education and personal-use scope, and refers users to Yahoo's underlying terms. A wrapper license is not a separate data license.
- [AKShare overview](https://akshare.akfamily.xyz/introduction.html) identifies Eastmoney, Sina and exchange websites as underlying public sources and limits its intended data/interface use to academic research. Its source tree contains A-share, Hong Kong and US quote/history adapters. [AKTools](https://github.com/akfamily/aktools) can expose AKShare over local HTTP, so a Python library can still serve a TypeScript frontend.
- [efinance stock source](https://github.com/Micro-sheep/efinance/blob/main/efinance/stock/getter.py) implements current quotes/history and references Eastmoney endpoints. [easyquotation's Tencent adapter](https://github.com/shidenggui/easyquotation/blob/master/easyquotation/tencent.py) reads `qt.gtimg.cn` and parses its quote fields. These overlap with TomTrader's inherited web adapters rather than representing new independently licensed exchange feeds.

These are useful zero-cost research implementation references. Their upstream display/storage scope and present network availability must still be checked separately; neither commercial redistribution nor uniform global real-time latency is established by an open-source README. No attempt was made to bypass access controls or rate limits.

### Official free accounts

- [Alpaca Basic documentation](https://docs.alpaca.markets/us/v1.1/docs/about-market-data-api): zero-cost Basic plan for eligible accounts; US stocks/ETFs, IEX real-time coverage, 30 WebSocket symbols, historical data since 2016, 200 historical calls/minute, and a recent-history restriction stated in the plan. [FAQ](https://docs.alpaca.markets/us/docs/market-data-faq) distinguishes IEX from the consolidated SIP feed and explains delayed historical queries. This is a promising official US-data option after free account/key registration; it is not full-US consolidated live coverage or global-index coverage. No trading integration is needed for a read-only data adapter.
- [Alpha Vantage support](https://www.alphavantage.co/support/api-key/): ordinary free allowance is 25 requests/day; verified open-source/education projects can apply for additional access. Approval is not automatic. Official support identifies current/15-minute-delayed US quotes as premium data, so the ordinary free tier is not a good default refresh engine for this terminal.
- [Twelve Data pricing](https://twelvedata.com/pricing): Basic is $0, 8 API credits/minute and 800/day; the page explicitly says internal non-display usage and trial WebSocket credits. It should not be assumed to authorize TomTrader's visual dashboard. Symbol batching still has credit weights. [Usage guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage) distinguishes personal, business and derived-data rights.

Practical direction: retain a zero-cost local research path with clear source/delay/error labels, borrow maintained adapter patterns from Ghostfolio/OpenBB and the Chinese-source libraries, and prefer an official free account such as Alpaca for US data when available. No purchase is needed to evaluate those options. A paid universal global real-time feed is not a prerequisite for continuing the application, but it must not be implied by these free alternatives.
