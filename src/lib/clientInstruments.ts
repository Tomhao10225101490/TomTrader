// Client-side instrument helpers.
// The curated universe is small enough to ship to the browser; it is read only
// for id → display resolution (toasts, links). Live data always comes from the
// API, never from a bundled copy of numbers.
import { BY_ID,UNIVERSE } from '@/server/instruments';
import type { Instrument } from '@/server/types';
import { assertInstrumentId,currencyForMarket } from '@/server/vendorsymbols';
import { useLive } from '@/stores/live';

export function resolveInstrument(id: string): Instrument | null {
  const direct = useLive.getState().snapshots[id]?.instrument ?? BY_ID.get(id);
  if (direct) return direct;
  // Dynamic instruments (searched symbols) are not bundled; synthesise the
  // display fields from the id so a toast still reads correctly.
  const parts = id.split(':');
  if (parts.length < 3 || !assertInstrumentId(id)) return null;
  return {
    id,
    displaySymbol: parts.slice(2).join(':'),
    vendorSymbol: parts.slice(2).join(':'),
    name: parts.slice(2).join(':'),
    nameZh: null,
    assetType: parts[0] as Instrument['assetType'],
    market: parts[1] as Instrument['market'],
    exchange: ({ US: 'XNYS', CN: 'CNE', HK: 'HKEX', JP: 'XTKS', KR: 'KRX', TW: 'TWSE', IN: 'NSE', AU: 'ASX', DE: 'XETRA', FR: 'XPAF', GB: 'XLON', NL: 'XEUR', EU: 'XEUR', BR: 'BVMF', FX: 'OTC' } as const)[parts[1] as Instrument['market']],
    currency: currencyForMarket(parts[1] as Instrument['market']),
  };
}

export function stockHrefFromId(id: string): string {
  return `/stocks/${encodeURIComponent(id)}`;
}

export const universeSize = UNIVERSE.length;
