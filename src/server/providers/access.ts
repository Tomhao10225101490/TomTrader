/** Explicit operator opt-in for keyless public feeds used in this local personal research build. */
export function publicFeedsEnabled(): boolean {
  return process.env.TOMTRADER_PUBLIC_FEEDS === '1';
}
