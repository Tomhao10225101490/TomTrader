'use client';
import { useEffect,useRef,useState,useSyncExternalStore } from 'react';

/**
 * A shared ticking clock.
 *
 * Dozens of "updated 3 minutes ago" labels must not each own an interval: one
 * subscriber list, one timer, and the timer stops while the tab is hidden so a
 * backgrounded terminal costs nothing.
 */

type Listener = (now: number) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Date.now();

function tick(): void {
  current = Date.now();
  for (const l of listeners) l(current);
}

function ensureTimer(): void {
  if (timer || typeof window === 'undefined') return;
  timer = setInterval(() => {
    if (document.hidden) return;
    tick();
  }, 1000);
  document.addEventListener('visibilitychange', tick);
}

function subscribeClock(listener: () => void): () => void {
  ensureTimer();
  listeners.add(listener);
  tick();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', tick);
    }
  };
}

export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(subscribeClock, () => Math.floor(current / intervalMs) * intervalMs, () => null);
}

/**
 * Remembers the previous formatted string so a price cell can tint only the
 * digits that actually moved. `null` on the first render means "no flash",
 * which is why a freshly mounted table never strobes.
 */
export function usePrevious<T>(value: T): T | null {
  const [pair, setPair] = useState<{ current: T; previous: T | null }>({ current: value, previous: null });
  if (!Object.is(pair.current, value)) setPair({ current: value, previous: pair.current });
  return pair.previous;
}

export function useFlashDirection(next: string | null, prev: string | null): 'up' | 'down' | null {
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const keyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (next === null || prev === null || keyRef.current === next) return;
    const before = Number(prev.replace(/[^\d.eE+-]/g, ''));
    const after = Number(next.replace(/[^\d.eE+-]/g, ''));
    if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) {
      keyRef.current = next;
      return;
    }
    // Start the transient CSS price flash after the committed value changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDir(after > before ? 'up' : 'down');
    keyRef.current = next;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setDir(null), 900);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [next, prev]);

  return dir;
}

export function useMounted(): boolean {
  return useSyncExternalStore(subscribeMounted, () => true, () => false);
}

const subscribeMounted = () => () => {};
