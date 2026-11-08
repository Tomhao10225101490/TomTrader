import type { DataQuality,FeedTier } from './types';

/**
 * Data freshness classification.
 *
 * This function decides whether the user sees "Real-time", "Delayed",
 * "End-of-day", "Cached", "Stale" or "Demo", and it is the single most
 * consequential label in the product. It is pure and unit-tested.
 *
 * The measure is *lag behind the exchange*, not the age of our own copy:
 *
 *     printLag = now − exchange print time − declared delay of the feed
 *
 * A 15-minute-delayed feed that just delivered a 16-minute-old print is fine;
 * one that delivered a 40-minute-old print is stale even though we received it
 * a minute ago. Measuring receive-age instead would hide exactly the case a
 * trader needs to be warned about.
 */

/** Tolerance beyond the declared delay before a feed is called stale. */
export const DELAY_TOLERANCE_MS = 10 * 60_000;
/** How far behind a declared real-time feed may be before it is stale. */
export const GRACE_MS = 5 * 60_000;
/** While the venue is shut, an unchanged print is the last close, not stale. */
export const OUT_OF_SESSION_STALE_MS = 36 * 60 * 60_000;

export interface FreshnessInput {
  tier: FeedTier;
  /** Our server's receive time for this value, UTC ms. */
  receivedAt: number;
  /** The venue's own print time, epoch seconds UTC, or null when unknown. */
  exchangeTimestamp: number | null;
  /** Is the venue in a continuous trading session right now? */
  marketOpen: boolean;
  /**
   * Is the venue inside today's session window at all? A lunch break is not
   * "closed" in the sense that makes a fresh print a cached one: the numbers on
   * screen still belong to the session being traded. Omit to treat "not open"
   * as "session finished".
   */
  inSessionWindow?: boolean;
  nowMs: number;
}

export interface Freshness {
  quality: DataQuality;
  /** Age of our copy, ms. */
  ageMs: number;
  /** Vendor-side lag (our receive time minus the print time), null if unknown. */
  feedLatencyMs: number | null;
  /** How far the shown value trails the exchange, past its declared delay. */
  excessLagMs: number | null;
}

export function classifyFreshness(input: FreshnessInput): Freshness {
  const { tier, receivedAt, exchangeTimestamp, marketOpen, nowMs } = input;
  const inSessionWindow = input.inSessionWindow ?? marketOpen;

  const ageMs = Math.max(0, nowMs - receivedAt);
  const printMs = exchangeTimestamp === null ? null : exchangeTimestamp * 1000;
  const feedLatencyMs = printMs === null ? null : Math.max(0, receivedAt - printMs);

  if (tier === 'demo') {
    return { quality: 'demo', ageMs, feedLatencyMs, excessLagMs: null };
  }

  if (tier === 'end-of-day' && nowMs - (printMs ?? receivedAt) > 7 * 86_400_000) return { quality: 'stale', ageMs, feedLatencyMs, excessLagMs: nowMs - (printMs ?? receivedAt) };

  if (tier === 'end-of-day') {
    // There is nothing more coming for this session by definition.
    return { quality: 'end-of-day', ageMs, feedLatencyMs, excessLagMs: null };
  }

  const declaredDelayMs = declaredDelay(tier);
  const reference = printMs ?? receivedAt;
  const excessLagMs = Math.max(0, nowMs - reference - declaredDelayMs);

  // 1. Far past its own entitlement: say so, whether or not the venue is open.
  const limit = staleLimit(tier, marketOpen, inSessionWindow);
  if (excessLagMs > limit) {
    return { quality: 'stale', ageMs, feedLatencyMs, excessLagMs };
  }

  // 2. Venue finished trading for now: what we hold is the last print of the
  //    most recent session. That is a cached value, not a live one.
  if (!marketOpen && !inSessionWindow) {
    return { quality: 'cached', ageMs, feedLatencyMs, excessLagMs };
  }

  // 3. Current, by tier. Only a documented entitlement earns `realtime`.
  return {
    quality: tier === 'realtime' ? 'realtime' : 'delayed',
    ageMs,
    feedLatencyMs,
    excessLagMs,
  };
}

function declaredDelay(tier: FeedTier): number {
  switch (tier) {
    case 'realtime':
      return 0;
    case 'delayed-15':
      return 15 * 60_000;
    case 'delayed-20':
      return 20 * 60_000;
    // An undocumented feed gets the same courtesy as a 20-minute one, and is
    // never allowed to claim more.
    case 'unverified':
    case 'demo':
    case 'end-of-day':
      return 20 * 60_000;
  }
}

function staleLimit(tier: FeedTier, marketOpen: boolean, inSessionWindow: boolean): number {
  if (!marketOpen && !inSessionWindow) {
    // Long weekends and one-off closures are added to the window so a Friday
    // close read on Monday afternoon is "cached", never "stale".
    return 7 * 86_400_000;
  }
  switch (tier) {
    case 'realtime':
      return GRACE_MS;
    default:
      return DELAY_TOLERANCE_MS;
  }
}

/**
 * Tier for the free, undocumented feeds TomTrader ships with.
 * `unverified` deliberately never renders as "Real-time".
 */
export function tierForFreeFeed(): FeedTier {
  return 'unverified';
}

export function qualityIsLive(q: DataQuality): boolean {
  return q === 'realtime' || q === 'delayed';
}

/** True when a value should be treated as authoritative for a decision. */
export function qualityIsTrustworthy(q: DataQuality): boolean {
  return q === 'realtime' || q === 'delayed' || q === 'end-of-day' || q === 'cached';
}
