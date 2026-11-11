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
let suspended = false;
let catchUpGeneration = 0;
let catchUpController: AbortController | null = null;

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
      for (const s of snapshots) {
        const before = next[s.instrument.id];
        if (before?.quote && (!s.quote || before.quote.receivedAt > s.quote.receivedAt)) continue;
        next[s.instrument.id] = { ...s, sparkline: s.sparkline ?? before?.sparkline };
      }
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
    const wanted = [...new Set(ids)];
    const refs = new Map(get().refs);
    for (const id of wanted) refs.set(id, (refs.get(id) ?? 0) + 1);
    set({ refs });
    flushSubscriptions();
    if (booted && policy === 'slow') void catchUp();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const refs = new Map(get().refs);
      for (const id of wanted) {
        const count = (refs.get(id) ?? 1) - 1;
        if (count <= 0) refs.delete(id);
        else refs.set(id, count);
      }
      set({ refs });
      flushSubscriptions();
    };
  },

  setRefreshPolicy: (next) => {
    if (policy === next && booted && (source || slowTimer || next === 'off')) return;
    policy = next;
    cancelCatchUp();
    if (!booted) return;
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
      startSlowPoll();
      return;
    }
    connect();
  },
}));

function ensureClientId(): void {
  if (clientId) return;
  // sessionStorage is cloned when a browser tab is duplicated. Reusing that
  // stored id would make two tabs replace/detach each other's server client.
  clientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c${Math.random().toString(36).slice(2)}`;
}

function canRefresh(): boolean {
  return booted && !suspended && !document.hidden && (typeof navigator === 'undefined' || navigator.onLine !== false);
}

function cancelCatchUp(): void {
  catchUpGeneration++;
  catchUpController?.abort();
  catchUpController = null;
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
    if (policy !== 'auto' || !canRefresh()) return;
    void fetch('/api/stream/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: clientId, ids }),
    }).catch(() => undefined);
  }, 120);
}

function connect(): void {
  if (typeof window === 'undefined') return;
  if (policy !== 'auto' || !canRefresh()) {
    useLive.setState({ connection: policy === 'off' || document.hidden ? 'paused' : 'offline' });
    return;
  }
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

  const stream = source;
  source.onopen = () => {
    if (source !== stream) return;
    useLive.setState({ connection: 'open', attempt: 0, lastError: null, lastFrameAt: Date.now() });
    startWatchdog();
  };

  source.onmessage = (event) => {
    if (source !== stream || !canRefresh()) return;
    useLive.setState({ lastFrameAt: Date.now(), connection: 'open' });
    let frame: SseFrame;
    try {
      frame = JSON.parse(event.data as string) as SseFrame;
    } catch {
      return;
    }
    if (frame.type === 'quotes' && frame.quotes) {
      useLive.getState().primeSnapshots(frame.quotes);
    } else if (frame.type === 'alert' && frame.alerts) {
      useLive.setState((state) => ({ alerts: [...frame.alerts!, ...state.alerts].slice(0, 40) }));
      void showNotification(frame.alerts);
    } else if (frame.type === 'state' && frame.state) {
      // Server-side pause is advisory; the client keeps its own state.
      void frame.state;
    }
  };

  source.onerror = () => {
    if (source !== stream) return;
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
    if (policy === 'auto' && canRefresh()) connect();
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
  const pause = () => {
    cancelCatchUp();
    source?.close();
    source = null;
    stopWatchdog();
    if (backoffTimer) clearTimeout(backoffTimer);
    backoffTimer = null;
    if (slowTimer) clearInterval(slowTimer);
    slowTimer = null;
    useLive.setState({ connection: policy === 'off' || document.hidden ? 'paused' : 'offline' });
  };
  const resume = () => {
    pause();
    if (!canRefresh()) return;
    if (policy === 'auto') { connect(); void catchUp(); }
    else if (policy === 'slow') startSlowPoll();
    else useLive.setState({ connection: 'paused' });
  };
  window.addEventListener('offline', pause);
  window.addEventListener('online', resume);
  window.addEventListener('tomtrader:suspend', () => { suspended = true; pause(); });
  window.addEventListener('tomtrader:resume', () => { suspended = false; resume(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else resume();
  });
}

/** REST catch-up used after a background tab returns, and by the slow policy. */
async function catchUp(): Promise<void> {
  if (policy === 'off' || !canRefresh()) return;
  const ids = activeIds();
  if (!ids.length) return;
  cancelCatchUp();
  const generation = catchUpGeneration;
  const ac = new AbortController();
  catchUpController = ac;
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(`/api/quotes?ids=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store', signal: ac.signal });
    if (!res.ok) { slowPollState(generation, `HTTP ${res.status} refreshing quotes`); return; }
    const data = (await res.json()) as { snapshots: QuoteSnapshot[] };
    if (generation !== catchUpGeneration || !canRefresh()) return;
    useLive.getState().primeSnapshots(data.snapshots ?? []);
    slowPollState(generation, null);
  } catch {
    slowPollState(generation, 'quote refresh failed');
    /* the stream or next bounded poll will retry when connectivity returns */
  } finally {
    clearTimeout(timer);
    if (catchUpController === ac) catchUpController = null;
  }
}

function slowPollState(generation: number, error: string | null): void {
  if (generation !== catchUpGeneration || policy !== 'slow' || !canRefresh()) return;
  useLive.setState(error ? { connection: 'backoff', lastError: error } : { connection: 'open', lastError: null, lastFrameAt: Date.now() });
}

function startSlowPoll(): void {
  if (slowTimer) clearInterval(slowTimer);
  if (!canRefresh()) {
    useLive.setState({ connection: document.hidden ? 'paused' : 'offline' });
    return;
  }
  useLive.setState({ connection: 'connecting' });
  void catchUp();
  slowTimer = setInterval(() => { if (canRefresh()) void catchUp(); }, 60_000);
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
