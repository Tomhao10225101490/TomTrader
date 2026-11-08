# API reference

Local base: `http://localhost:3100/api`. Responses use JSON and no-store. Errors have an `error` message and appropriate HTTP status. Known instruments with missing upstream values return explicit null/unavailable fields. Currency values retain original instrument currency; no browser credentials are accepted or returned.

## Read endpoints

- `GET /overview?mode=stale|await`: grouped indices, commodities, currencies, clocks and source health. Stale mode returns saved data immediately.
- `GET /quotes?ids=<comma-separated stable IDs>` or `POST /quotes` with `{ "ids": [...] }`: quote snapshots, market status and refresh issues. Maximum 400 IDs.
- `GET /detail?id=equity:US:AAPL`: instrument, snapshot, metadata and issues.
- `GET /bars?id=...&range=3M&interval=1d`: `series`, `issue`, axis timezone and legacy offset metadata. Ranges 1D/5D/1M/3M/6M/YTD/1Y/5Y/MAX. Intervals 1m/5m/15m/1h/1d/1wk/1mo. Invalid values return 400; no history is represented by null series, not invented bars.
- `GET /sparkline?ids=...`: cached small history arrays.
- `GET /search?q=AAPL`: local/vendor search results including symbol, name, exchange, country, currency and asset type. Exact local hits avoid remote discovery latency.
- `GET /resolve?symbol=AAPL&market=US`: stable ID or explicit ambiguous candidates.
- `GET /markets`: exchange reference rows, calculated status and headline snapshots.
- `GET /clock`: UTC trading segments and next boundaries.
- `GET /heatmap?pool=US&period=intraday|5d|1m`: real covered cells, area-weight source, requested/covered count. Pools US/CN/HK/indices; see response/UI for current pool keys.
- `GET /movers?pool=US`: gainers, losers and active instruments within the curated pool, not a claim to cover the full exchange.
- `GET /fx`: reference FX and issues.
- `GET /news?id=...`: original headlines with publisher/time/links. Symbol filter does not inject unrelated general headlines.
- `GET /status`: safe configuration flags (never keys), provider health, cache counts, stream hub state, calendar version and local diagnostics.

## User data

`GET /watchlist` returns groups and snapshots. `POST /watchlist` uses `op`: create(name), rename(groupId,name), delete(groupId), add/remove/pin(groupId,instrumentId), reorder(groupId,ids). Names are 1–80 characters; IDs are validated.

`GET /portfolio?currency=USD` returns positions, totals, covered/uncovered counts and FX provenance. `POST /portfolio` uses add(instrumentId,quantity,averageCost,currency,purchasedAt), update(id, fields), remove(id), import(holdings), export. Dates are actual YYYY-MM-DD dates; quantities/costs must be finite and positive. Holding currency must match trading currency. Exported holdings use the same camelCase contract accepted by import.

`GET /alerts` returns definitions and trigger events. `POST /alerts` uses create(instrumentId,condition,cooldownMinutes), update(id,condition,cooldownMinutes), toggle(id,enabled), delete(id). Conditions: price-above, price-below, change-percent-above, change-percent-below with numeric threshold. Percentage conditions refer to daily return. Cooldown 0–1440 minutes. 52-week conditions return an explicit unsupported error until a usable fundamentals feed is connected.

Browser user-data mutations reject a foreign Origin. This is local anti-cross-origin protection, not an authentication system.

## Stream

`GET /stream?client=<client-id>` opens SSE JSON frames (quotes, state, alert, heartbeat). `POST /stream/state` replaces the client's ID subscription and pause flag. The browser keeps one stream with a reference count per symbol. Upstream transport is REST polling, not a vendor WebSocket. No claim is made about receiving notifications after the app closes.
