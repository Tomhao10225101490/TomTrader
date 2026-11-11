'use client';
import { useCallback,useEffect,useRef,useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Tiny request hook with three things a market terminal needs:
 *  - cancellation, so a slow response for a page you already left cannot land
 *    on the screen you are now on
 *  - an explicit `error`, so a failed fetch is distinguishable from "no data"
 *  - `reload()` wired to a Retry button, because rate-limited feeds recover
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { keepData?: boolean } = {}): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; identity: unknown[] }>({ data: null, error: null, loading: true, identity: deps });
  const generation = useRef(0);
  const requestRef = useRef({ fn, identity: deps });
  useEffect(() => { requestRef.current = { fn, identity: deps }; });
  const keepData = opts.keepData ?? false;

  const run = useCallback(() => {
    const my = ++generation.current;
    const request = requestRef.current;
    setState((before) => ({
      data: keepData || sameIdentity(before.identity, request.identity) ? before.data : null,
      error: null, loading: true, identity: request.identity,
    }));
    void (async () => {
      try {
        const value = await request.fn();
        if (my !== generation.current) return;
        setState({ data: value, error: null, loading: false, identity: request.identity });
      } catch (e) {
        if (my !== generation.current) return;
        setState((before) => ({ ...before, data: keepData ? before.data : null, error: String((e as Error)?.message ?? e), loading: false }));
      }
    })();
  }, [keepData]);

  const invalidate = useCallback(() => { generation.current++; }, []);

  useEffect(() => {
    const timer = setTimeout(run, 0);
    return () => {
      clearTimeout(timer);
      invalidate();
    };
    // The caller supplies the request identity (instrument, range, filters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, invalidate, ...deps]);

  // Render the new identity as loading immediately, before effects run. Old
  // bars must never be relabeled as a new range/instrument during a slow fetch.
  const current = sameIdentity(state.identity, deps);
  return {
    data: current || keepData ? state.data : null,
    error: current ? state.error : null,
    loading: current ? state.loading : true,
    reload: run,
  };
}

function sameIdentity(left: unknown[], right: unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}
