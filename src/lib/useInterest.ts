'use client';
import { useLive } from '@/stores/live';
import { useEffect } from 'react';

/**
 * Registers the ids a component renders with the single app-wide stream.
 *
 * Pass a stable key (the joined id list) so a re-render with the same ids does
 * not churn the subscription: `ids.join(',')` is compared, not the array.
 */
export function useInterest(ids: string[] | null | undefined): void {
  const interest = useLive((s) => s.interest);
  const key = ids ? ids.join(',') : '';

  useEffect(() => {
    if (!key) return;
    return interest(key.split(','));
  }, [key, interest]);
}
