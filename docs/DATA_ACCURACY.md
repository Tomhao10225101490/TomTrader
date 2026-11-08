# Data accuracy

All instants are stored UTC. Quotes carry exchange timestamp (seconds) and receivedAt (milliseconds) separately. Bad/unknown numeric fields remain null; zero is retained only where it is a valid value such as an unchanged daily return. Missing prices never become zero. Unknown feed delay never becomes an invented 15- or 20-minute claim.

Freshness badges distinguish real-time, delayed, end-of-day, cached, stale, unavailable and demo. A connected SSE socket is not a real-time entitlement. Very old daily/closed-session values become stale, even if reread or received recently. Unverified feeds cannot claim real-time. Data source/receive times appear in detail and quote tooltips. History adjustment policy and missing fundamentals are explicit.

Portfolio prices and average cost use the instrument's trading currency. Current value and cost basis are translated at the same current reference FX rate; therefore the shown P/L measures price return at current FX, **not** historical FX return. A missing or invalid pair excludes that position from totals and reports partial coverage. USD-base rates are preserved when inverting EURUSD/GBPUSD/AUDUSD. Distribution weights use only covered positions.

Heatmap changes come from quotes/history; no random values are used outside explicit Demo. If any market cap is unavailable, the whole displayed pool uses equal-area tiles. The coverage label states the curated pool rather than suggesting the whole exchange.

## Exchange calendars

The calendar uses IANA timezones via Intl, weekdays, split sessions, holidays and half days. Timezone math alone does not determine exchange holidays. Calendars are scoped by verified year; incomplete or out-of-range venues show Data Unavailable, with no invented next-open instant.

Official schedules checked on 2026-11-08:

- [NYSE hours/calendars](https://www.nyse.com/trade/hours-calendars): US holidays and 13:00 early closes. December 31, 2026 is not an early close. Calendar supports the curated 2025–2027 entries; emergency closures still require updates.
- [SSE 2026 notice](https://big5.sse.com.cn/site/cht/www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml): includes February 23, September 25 and October 1–7. Weekend administrative workdays do not reopen equities. Used for SSE/SZSE cash sessions in 2026.
- [HKEX CT/075/25](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf): includes April 7 and October 19; half days February 16, December 24 and 31. December 28 is a trading day, not an assumed substitute closure.
- [JPX market holidays](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html): 2026 holidays including September 22 and December 31; TSE afternoon session ends 15:30.
- [Xetra 2026 official calendar](https://www.cashmarket.deutsche-boerse.com/resource/blob/4580826/3e974decb414d6769cc2bc8e601f6c9a/data/xetra-trading-calendar-2026.pdf): December 24/31 are closed. Ascension/Whit Monday are not exchange closures.
- [LSE business days](https://www.londonstockexchange.com/en/resources/markets-products/business-days): December 24/31 closing process starts 12:30 London time.
- [ASX cash calendar](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours/trading-calendar.): December 24/31 normal trading ceases 14:10 Sydney time.
- [Euronext trading calendar](https://www.euronext.com/en/trading/trading-hours-holidays): national public holidays do not all close Paris/Amsterdam. End-of-year half-day exact closing times were not verified; status on those dates is unavailable rather than an asserted exact close.

India, Korea, Taiwan, Brazil and OTC calendar completeness is unverified; status is unavailable. Their prices may still exist independently of calendar coverage. Unplanned closures/suspensions and instrument-specific halts are not inferred from a venue calendar. The clock is for cash-equity sessions, not derivatives or 24-hour broker trading.

## Keyless personal verification — 2026-11-08

Actual network evidence is in `evidence/free-feeds.json`; no persisted quote was allowed to count as vendor success. Eastmoney and Tencent shared quotes were compared with source timestamp skew recorded; none differed by more than 1% in this run. This is a spot consistency check, not an exchange-authoritative price audit or proof of feed latency.

Eastmoney placeholders/NaN/infinity are rejected. Tencent responses decode GB18030 and parse slash-form US timestamps in New York time. Calendar ranges use exchange-local cutoff dates rather than treating 30 trading bars as one month; 1D/5D retain the latest one/five available sessions on weekends. Historical OHLC order/bounds are checked. All public-source tiers remain unverified, including cached/closed-session prices. Source dates are visible in rows; historical captions include provider, tier, last bar time and adjustment.
