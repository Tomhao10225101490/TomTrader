'use client';
import { create } from 'zustand';
import type { PriceAlert } from '../server/types';
import type { QuoteSnapshot,SseFrame } from '../shared/api';

/**
 * The live quote pipeline on the client side.
 *
 * One EventSource for the whole app, plus a reference count per instrument:
 * a component asks for the ids it renders and gets back a release function.
 * That is what stops twenty watchlist rows from each starting their own
 * polling loop, and what keeps the server's poll set small when a page unmounts.
 *
 * Connection rules:
 *  - exponential backoff with jitter, capped at 15s
 *  - a watchdog reconnect if no frame (including heartbeats) arrives in 45s
 *  - `document.hidden` tells the server to stop feeding this tab, and the
 *    catch-up REST read on return means a backgrounded tab costs nothing
 *  - refresh policy `slow` switches to 60s REST polling, `off` freezes the
 *    screen and says so — the UI never shows a live badge on a paused feed
 */

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'backoff' | 'paused' | 'offline';

interface LiveState {
  snapshots: Record<string, QuoteSnapshot>;
  connection: ConnectionState;
  lastFrameAt: number | null;
  lastError: string | null;
  attempt: number;
  alerts: { alertId: string; instrumentId: string; name: string; detail: string; price: number }[];
  /** instrumentId -> number of mounted consumers */
  refs: Map<string, number>;
  init: () => void;
  interest: (ids: string[]) => () => void;
  setRefreshPolicy: (policy: 'auto' | 'slow' | 'off') => void;
  primeSnapshots: (snapshots: QuoteSnapshot[]) => void;
}

let clientId = '';
let source: EventSource | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;
let policy: 'auto' | 'slow' | 'off' = 'auto';
let booted = false;
let pendingFlush: ReturnType<typeof setTimeout> | null = null;

export const useLive = create<LiveState>((set, get) => ({
  snapshots: {},
  connection: 'idle',
  lastFrameAt: null,
  lastError: null,
  attempt: 0,
  alerts: [],
  refs: new Map(),

  primeSnapshots: (snapshots) =>
    set((state) => {
      const next = { ...state.snapshots };
      for (const s of snapshots) next[s.instrument.id] = s;
      return { snapshots: next };
    }),

  init: () => {
    if (booted) return;
    booted = true;
    ensureClientId();
    attachVisibility();
    if (policy === 'auto') connect();
    else if (policy === 'slow') startSlowPoll();
    else set({ connection: 'paused' });
  },

  interest: (ids) => {
    const refs = get().refs;
    for (const id of ids) refs.set(id, (refs.get(id) ?? 0) + 1);
    set({ refs: new Map(refs) });
    flushSubscriptions();
    if (policy === 'slow') void catchUp();

    return () => {
      for (const id of ids) {
        const count = (refs.get(id) ?? 1) - 1;
        if (count <= 0) refs.delete(id);
        else refs.set(id, count);
      }
      set({ refs: new Map(refs) });
      flushSubscriptions();
    };
  },

  setRefreshPolicy: (next) => {
    policy = next;
    stopWatchdog();
    if (backoffTimer) clearTimeout(backoffTimer);
    backoffTimer = null;
    if (slowTimer) {
      clearInterval(slowTimer);
      slowTimer = null;
    }
    if (source) {
      source.close();
      source = null;
    }
    if (next === 'off') {
      useLive.setState({ connection: 'paused' });
      return;
    }
    if (next === 'slow') {
      set({ connection: 'open' });
      void catchUp();
      slowTimer = setInterval(() => { if (!document.hidden) void catchUp(); }, 60_000);
      return;
    }
    connect();
  },
}));

function ensureClientId(): void {
  if (clientId) return;
  if (typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem('tomtrader.client');
    if (stored) {
      clientId = stored;
      return;
    }
  }
  clientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c${Math.random().toString(36).slice(2)}`;
  try {
    sessionStorage?.setItem('tomtrader.client', clientId);
  } catch {
    /* private mode */
  }
}

function activeIds(): string[] {
  return [...useLive.getState().refs.keys()];
}

function flushSubscriptions(): void {
  if (pendingFlush) clearTimeout(pendingFlush);
  // Coalesce subscription churn from a route change into one POST.
  pendingFlush = setTimeout(() => {
    pendingFlush = null;
    const ids = activeIds();
    if (policy !== 'auto') return;
    void fetch('/api/stream/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: clientId, ids }),
    }).catch(() => undefined);
  }, 120);
}

function connect(): void {
  if (typeof window === 'undefined') return;
  const ids = activeIds();
  useLive.setState({ connection: 'connecting' });
  const url = `/api/stream?client=${encodeURIComponent(clientId)}&ids=${encodeURIComponent(ids.join(','))}`;
  try {
    source?.close();
    source = new EventSource(url);
  } catch {
    scheduleBackoff();
    return;
  }

  source.onopen = () => {
    useLive.setState({ connection: 'open', attempt: 0, lastError: null });
    startWatchdog();
  };

  source.onmessage = (event) => {
    useLive.setState({ lastFrameAt: Date.now(), connection: 'open' });
    let frame: SseFrame;
    try {
      frame = JSON.parse(event.data as string) as SseFrame;
    } catch {
      return;
    }
    if (frame.type === 'quotes' && frame.quotes) {
      useLive.setState((state) => {
        const next = { ...state.snapshots };
        for (const s of frame.quotes!) next[s.instrument.id] = s;
        return { snapshots: next };
      });
    } else if (frame.type === 'alert' && frame.alerts) {
      useLive.setState((state) => ({ alerts: [...frame.alerts!, ...state.alerts].slice(0, 40) }));
      void showNotification(frame.alerts);
    } else if (frame.type === 'state' && frame.state) {
      // Server-side pause is advisory; the client keeps its own state.
      void frame.state;
    }
  };

  source.onerror = () => {
    source?.close();
    source = null;
    stopWatchdog();
    useLive.setState({ connection: 'backoff', lastError: 'stream connection lost' });
    scheduleBackoff();
  };
}

function scheduleBackoff(): void {
  const attempt = Math.min((useLive.getState().attempt ?? 0) + 1, 6);
  useLive.setState({ attempt });
  const delay = Math.min(15_000, 1_000 * 2 ** (attempt - 1)) + Math.random() * 400;
  if (backoffTimer) clearTimeout(backoffTimer);
  backoffTimer = setTimeout(() => {
    if (policy === 'auto' && !document.hidden) connect();
    else useLive.setState({ connection: document.hidden ? 'paused' : 'offline' });
  }, delay);
}

function startWatchdog(): void {
  stopWatchdog();
  watchdog = setInterval(() => {
    const last = useLive.getState().lastFrameAt;
    if (!last || Date.now() - last > 45_000) {
      // Nothing, not even a heartbeat: the socket is a lie. Rebuild it.
      source?.close();
      source = null;
      stopWatchdog();
      useLive.setState({ connection: 'connecting' });
      connect();
    }
  }, 10_000);
}

function stopWatchdog(): void {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
}

function attachVisibility(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (policy !== 'auto') return;
    if (document.hidden) {
      void fetch('/api/stream/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: clientId, paused: true }),
      }).catch(() => undefined);
      useLive.setState({ connection: 'paused' });
    } else {
      void fetch('/api/stream/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: clientId, paused: false, ids: activeIds() }),
      }).catch(() => undefined);
      if (!source) connect();
      else useLive.setState({ connection: 'open' });
      void catchUp();
    }
  });
}

/** REST catch-up used after a background tab returns, and by the slow policy. */
async function catchUp(): Promise<void> {
  const ids = activeIds();
  if (!ids.length) return;
  try {
    const res = await fetch(`/api/quotes?ids=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { snapshots: QuoteSnapshot[] };
    useLive.getState().primeSnapshots(data.snapshots ?? []);
  } catch {
    /* the stream will bring data when it returns */
  }
}

function startSlowPoll(): void {
  if (slowTimer) clearInterval(slowTimer);
  useLive.setState({ connection: 'open' });
  void catchUp();
  slowTimer = setInterval(() => { if (!document.hidden) void catchUp(); }, 60_000);
}

async function showNotification(alerts: SseFrame['alerts']): Promise<void> {
  if (!alerts?.length) return;
  if (typeof Notification === 'undefined') return;
  const prefs = (await import('./prefs')).usePrefs.getState();
  if (!prefs.notificationsOptIn) return;
  if (Notification.permission !== 'granted') return;
  for (const a of alerts.slice(0, 3)) {
    try {
      new Notification('TomTrader alert', { body: a.detail, tag: `tt-${a.alertId}` });
    } catch {
      /* notification construction can throw on some mobile browsers */
    }
  }
}

/** Snapshot selector that degrades to `undefined` instead of throwing. */
export function useSnapshot(id: string | null | undefined): QuoteSnapshot | undefined {
  return useLive((s) => (id ? s.snapshots[id] : undefined));
}

export type { PriceAlert };
