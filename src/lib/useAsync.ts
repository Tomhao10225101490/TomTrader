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
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);
  const keepData = opts.keepData ?? false;

  const run = useCallback(() => {
    const my = ++generation.current;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const value = await fnRef.current();
        if (my !== generation.current) return;
        setData(value);
      } catch (e) {
        if (my !== generation.current) return;
        setError(String((e as Error)?.message ?? e));
        if (!keepData) setData(null);
      } finally {
        if (my === generation.current) setLoading(false);
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

  return { data, error, loading, reload: run };
}
