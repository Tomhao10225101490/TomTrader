# Design system

Quiet, precise, information-first. A neutral warm canvas, white surfaces, subdued borders, limited blue accent and minimal shadow distinguish application chrome from financial signals. No marketing hero, decorative gradient, glass panels or generated artwork.

The system font stack covers SF/Segoe/system sans and PingFang/Microsoft YaHei CJK. Tabular numerals align prices, times and table columns. Body sizes favor a dense desktop terminal; mobile reorganizes navigation into bottom tabs and allows internal table scrolling without overflowing the viewport.

Design tokens are in `src/app/globals.css`: canvas/surface/inset, ink levels, line levels, accent and financial up/down states. Dark theme uses separate low-glare surfaces. Price-convention attributes swap financial colors globally; plus/minus/glyphs remain visible independently of color.

The desktop shell has a 44px top bar, compact ticker tape, left navigation, independently scrolling main region and hideable right context panel. A global index strip exposes multiple regions before the detailed market sections. Primary data uses lists and tables; blocks group related content instead of giving every statistic a separate large card.

Chart controls are consistent across detail/quick look: nine history ranges, line/area/candles, volume, crosshair OHLCV and timezone notes. Chart palette follows theme and price convention. Search supports Cmd/Ctrl+K, keyboard navigation, recent terms, suggestions and venue/currency/type disambiguation.

Visual references from the product brief guide hierarchy: Apple Stocks' focused quote reading, TradingView's chart controls, Bloomberg's density, Yahoo's provenance, Linear/Raycast's restrained navigation. No proprietary visual assets or trademarks are copied. This document does not claim a pixel-equivalence comparison to those products.
