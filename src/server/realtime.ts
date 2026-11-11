import type { QuoteSnapshot,SseFrame } from '../shared/api';
import { TTL } from './cache';
import { sleep } from './http';
import { crossesThreshold,evaluateAlert,getSnapshots,onQuotesRefreshed,marketStatusFor,resolveInstrument } from './service';
import type { PriceAlert } from './types';

/**
 * Server-side realtime pipeline.
 *
 * There is no vendor websocket in the free tier TomTrader ships with, so the
 * pipeline is a venue-aware poller that pushes to browsers over SSE. That is
 * an honest substitute *only if* the cadence respects the feed:
 *
 *  - instruments whose venue is in session are polled, at 8s for Eastmoney
 *    (China) and 15s for Yahoo, which keeps us far inside any plausible
 *    per-IP allowance because one request covers the whole batch for a feed;
 *  - instruments whose venue is closed are polled once on attach and then
 *    left alone — showing a Friday close on Saturday does not need 4 polls a
 *    minute;
 *  - nothing is ever pushed that did not come from a provider response, and
 *    each frame carries the provider's own timestamp plus our receive time.
 *
 * A browser tab is one `Client`. The poll set is the union of every client's
 * subscriptions, de-duplicated, and trimmed when the last client leaves.
 */

type Listener = (frame: SseFrame) => void;

interface Client {
  id: string;
  send: Listener;
  close: () => void;
  subscribed: Set<string>;
  connectedAt: number;
  /** Tabs that are `document.hidden` ask us to stop feeding them. */
  paused: boolean;
  /** Each connection needs its own first snapshot, even when another tab has it. */
  pendingReplay: Set<string>;
}

interface Hub {
  clients: Map<string, Client>;
  /** instrumentId -> last pushed snapshot, for change detection. */
  last: Map<string, QuoteSnapshot>;
  timer: NodeJS.Timeout | null;
  heartbeat: NodeJS.Timeout | null;
  intervalMs: number;
  running: boolean;
  lastRefreshAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  consecutiveErrors: number;
  alertCallbacks: (() => Promise<PriceAlert[]>)[];
  eventCallbacks: (alert: PriceAlert, snap: QuoteSnapshot, detail: string, price: number) => Promise<void>;
  rearmCallbacks: ((alertId: string) => void)[];
}

const g = globalThis as unknown as { __ttHub?: Hub };

function hub(): Hub {
  if (!g.__ttHub) {
    g.__ttHub = {
      clients: new Map(),
      last: new Map(),
      timer: null,
      heartbeat: null,
      intervalMs: 15_000,
      running: false,
      lastRefreshAt: null,
      lastErrorAt: null,
      lastError: null,
      consecutiveErrors: 0,
      alertCallbacks: [],
      eventCallbacks: async () => {},
      rearmCallbacks: [],
    };
  }
  return g.__ttHub;
}

export function registerAlertSource(
  loader: () => Promise<PriceAlert[]>,
  onFire: Hub['eventCallbacks'],
  onRearm: (alertId: string) => void,
): void {
  const h = hub();
  h.alertCallbacks = [loader];
  h.eventCallbacks = onFire;
  h.rearmCallbacks = [onRearm];
}

export function attach(clientId: string, send: Listener, close: () => void): { subscribed: Set<string> } {
  const h = hub();
  const client: Client = { id: clientId, send, close, subscribed: new Set(), connectedAt: Date.now(), paused: false, pendingReplay: new Set() };
  h.clients.get(clientId)?.close();
  h.clients.set(clientId, client);
  startLoop();
  return { subscribed: client.subscribed };
}

export function detach(clientId: string, expectedSend?: Listener): void {
  const h = hub();
  // A late abort from a replaced stream must not detach the new connection.
  if (expectedSend && h.clients.get(clientId)?.send !== expectedSend) return;
  h.clients.delete(clientId);
  if (h.clients.size === 0 && h.timer) {
    clearInterval(h.timer);
    h.timer = null;
    h.running = false;
    if (h.heartbeat) clearInterval(h.heartbeat);
    h.heartbeat = null;
    h.last.clear();
    releaseRefreshListener?.();
    releaseRefreshListener = null;
  }
}

/** Replace a client's subscription set. Returns ids that need an immediate read. */
export function subscribe(clientId: string, ids: string[]): { added: string[]; total: number } {
  const h = hub();
  const client = h.clients.get(clientId);
  if (!client) return { added: [], total: 0 };
  const wanted = new Set(ids.slice(0, 400));
  const added = [...wanted].filter((id) => !client.subscribed.has(id));
  client.subscribed = wanted;
  for (const id of added) client.pendingReplay.add(id);
  for (const id of client.pendingReplay) if (!wanted.has(id)) client.pendingReplay.delete(id);
  startLoop();
  // A subscription that arrives right after attach used to wait for the next
  // scheduled tick — up to 15 seconds of blank cells. Ask for a pass now.
  if (added.length) requestImmediateTick();
  return { added, total: union().length };
}

let immediateTick: ReturnType<typeof setTimeout> | null = null;

/**
 * Coalesces a burst of subscription changes (a page mounting twelve rows) into
 * a single refresh 60ms later, so the first frame lands immediately without
 * issuing one vendor call per row.
 */
function requestImmediateTick(): void {
  if (immediateTick) return;
  immediateTick = setTimeout(() => {
    immediateTick = null;
    void tick('schedule');
  }, 60);
}

export function setPaused(clientId: string, paused: boolean): void {
  const client = hub().clients.get(clientId);
  if (!client) return;
  const wasPaused = client.paused;
  client.paused = paused;
  if (wasPaused && !paused) {
    for (const id of client.subscribed) client.pendingReplay.add(id);
    requestImmediateTick();
  }
}

/**
 * The instruments the poller must cover: everything a visible client is
 * subscribed to, plus every instrument that carries an enabled alert. Without
 * the second half, an alert on a symbol you are not currently looking at would
 * never be evaluated — the user would be told alerts work only for the page
 * they happen to be on.
 */
function union(): string[] {
  const set = new Set<string>();
  let anyVisible = false;
  for (const c of hub().clients.values()) {
    if (c.paused) continue;
    anyVisible = true;
    for (const id of c.subscribed) set.add(id);
  }
  if (anyVisible) {
    for (const alert of alertInstruments) set.add(alert);
  }
  return [...set];
}

/** Mirrors the alert table for the poll set; refreshed by the alert loop. */
const alertInstruments = new Set<string>();

export function registerAlertInstruments(ids: string[]): void {
  alertInstruments.clear();
  for (const id of ids) alertInstruments.add(id);
}

export function hubState() {
  const h = hub();
  return {
    connectedAt: h.clients.size ? Math.min(...[...h.clients.values()].map((c) => c.connectedAt)) : null,
    pollingIntervalMs: h.timer ? h.intervalMs : 0,
    subscribed: union().length,
    paused: false,
    lastRefreshAt: h.lastRefreshAt,
    lastErrorAt: h.lastErrorAt,
    lastError: h.lastError,
    clients: h.clients.size,
  };
}

/* ------------------------------------------------------------------ loop */

let loopStarted = false;
let releaseRefreshListener: (() => void) | null = null;

function startLoop(): void {
  const h = hub();
  if (loopStarted && h.timer) return;
  loopStarted = true;
  releaseRefreshListener ??= onQuotesRefreshed(() => { if (hub().clients.size) requestImmediateTick(); });
  schedule(15_000);
  void tick('attach');

  h.timer = setInterval(() => void tick('schedule'), 15_000);
  h.intervalMs = 15_000;

  // Heartbeat keeps intermediaries from idling the stream and lets the client
  // detect a dead connection quickly.
  if (h.heartbeat) clearInterval(h.heartbeat);
  h.heartbeat = setInterval(() => {
    for (const c of hub().clients.values()) {
      c.send({ type: 'heartbeat', at: Date.now() });
    }
  }, 25_000);
  h.heartbeat.unref?.();
}

function schedule(intervalMs: number): void {
  const h = hub();
  if (!h.timer) {
    h.intervalMs = intervalMs;
    return;
  }
  clearInterval(h.timer);
  h.timer = setInterval(() => void tick('schedule'), intervalMs);
  h.intervalMs = intervalMs;
}

/**
 * Poll cadence is a property of the venues that are actually open, not of the
 * wall clock. China closes at 07:00Z, Europe around 15:30Z, the US at 21:00Z —
 * so one loop with an adaptive interval beats per-market timers.
 */
export function desiredInterval(ids: string[], now = Date.now()): number {
  let cnOpen = false;
  let otherOpen = false;
  let untilNextOpen = 5 * 60_000;
  for (const id of ids) {
    const instrument = resolveInstrument(id);
    const market = instrument?.market ?? id.split(':')[1];
    const status = marketStatusFor(instrument?.exchange ?? statusExchange(market), now);
    if (status.nextOpenAt && status.nextOpenAt > now) untilNextOpen = Math.min(untilNextOpen, status.nextOpenAt - now);
    if (status.state === 'open') {
      if (market === 'CN' || market === 'HK') cnOpen = true;
      else otherOpen = true;
    }
  }
  if (!cnOpen && !otherOpen) return Math.max(250, untilNextOpen);
  if (cnOpen && !otherOpen) return TTL.quoteOpenCn;
  return TTL.quoteOpen;
}

function statusExchange(market: string): import('./types').ExchangeCode {
  switch (market) {
    case 'CN':
      return 'CNE';
    case 'HK':
      return 'HKEX';
    case 'JP':
      return 'XTKS';
    case 'KR':
      return 'KRX';
    case 'TW':
      return 'TWSE';
    case 'IN':
      return 'NSE';
    case 'AU':
      return 'ASX';
    case 'DE':
      return 'XETRA';
    case 'GB':
      return 'XLON';
    case 'FR':
      return 'XPAF';
    case 'BR':
      return 'BVMF';
    case 'EU':
    case 'NL':
      return 'XEUR';
    default:
      return 'XNYS';
  }
}

let ticking = false;

async function tick(_reason: 'attach' | 'schedule'): Promise<void> {
  const h = hub();
  if (ticking) return;
  ticking = true;
  try {
    const ids = union();
    if (ids.length === 0) return;

    const wanted = new Set(ids);
    for (const id of h.last.keys()) if (!wanted.has(id)) h.last.delete(id);
    const next = desiredInterval(ids);
    if (h.timer && h.intervalMs !== next) schedule(next);

    // `stale` mode answers from memory/disk immediately and schedules the
    // vendor round-trip behind it, so one call is enough for both cases.
    const snapshots = await getSnapshots(ids, { mode: 'stale' });

    const changed: QuoteSnapshot[] = [];
    for (const snap of snapshots) {
      const before = h.last.get(snap.instrument.id);
      if (!before || (snap.quote && (!before.quote || before.quote.last !== snap.quote.last || before.quote.quality !== snap.quote.quality || before.quote.exchangeTimestamp !== snap.quote.exchangeTimestamp || before.quote.receivedAt !== snap.quote.receivedAt || before.quote.provider !== snap.quote.provider)) || before.status.state !== snap.status.state) {
        h.last.set(snap.instrument.id, snap);
        changed.push(snap);
      } else if (!snap.quote && !before) {
        h.last.set(snap.instrument.id, snap);
      }
    }

    h.lastRefreshAt = Date.now();
    h.consecutiveErrors = 0;
    if (changed.length) broadcast({ type: 'quotes', at: Date.now(), quotes: changed });
    // Global change detection cannot provide a first frame to a second tab:
    // unchanged snapshots still need replay on subscribe, reconnect or resume.
    for (const client of h.clients.values()) {
      if (client.paused) continue;
      const quotes = snapshots.filter((snap) => client.pendingReplay.has(snap.instrument.id));
      if (!quotes.length) continue;
      try {
        client.send({ type: 'quotes', at: Date.now(), quotes });
        for (const snap of quotes) client.pendingReplay.delete(snap.instrument.id);
      } catch { /* leave the replay pending until a successful send */ }
    }

    await evaluateAlerts(snapshots);
  } catch (e) {
    const h2 = hub();
    h2.consecutiveErrors += 1;
    h2.lastErrorAt = Date.now();
    h2.lastError = String((e as Error)?.message ?? e);
    broadcast({ type: 'state', at: Date.now(), state: { ...hubState(), paused: false } });
    if (h2.consecutiveErrors === 3) {
      // Stop hammering a vendor that is clearly refusing us; the client will
      // still show cached values with a stale badge.
      schedule(2 * 60_000);
    }
  } finally {
    ticking = false;
  }
}

function broadcast(frame: SseFrame): void {
  for (const c of hub().clients.values()) {
    if (c.paused && frame.type === 'quotes') continue;
    try {
      if (frame.type === 'quotes') {
        const quotes = frame.quotes?.filter((s) => c.subscribed.has(s.instrument.id)) ?? [];
        if (quotes.length) {
          c.send({ ...frame, quotes });
          for (const snap of quotes) c.pendingReplay.delete(snap.instrument.id);
        }
      } else c.send(frame);
    } catch {
      /* a broken pipe is cleaned up by the route's abort handler */
    }
  }
}

async function evaluateAlerts(snapshots: QuoteSnapshot[]): Promise<void> {
  const h = hub();
  if (!h.alertCallbacks.length) return;
  const alerts = await h.alertCallbacks[0]();
  registerAlertInstruments(alerts.filter((a) => a.enabled).map((a) => a.instrumentId));
  if (alerts.length === 0) return;
  const byId = new Map(snapshots.map((s) => [s.instrument.id, s]));
  const rearm = h.rearmCallbacks[0];
  const fired: { alertId: string; instrumentId: string; name: string; detail: string; price: number }[] = [];

  for (const alert of alerts) {
    const snap = byId.get(alert.instrumentId);
    if (!snap) continue;
    const result = evaluateAlert(alert, snap);
    if (result.fired && result.detail && result.price !== null) {
      fired.push({ alertId: alert.id, instrumentId: alert.instrumentId, name: snap.instrument.displaySymbol, detail: result.detail, price: result.price });
      await h.eventCallbacks(alert, snap, result.detail, result.price);
      continue;
    }
    // A fired alert is left disarmed. Bring it back only once the price has
    // come off the level, which is what stops a hovering market from firing
    // every single poll.
    if (!alert.armed && snap.quote && !crossesThreshold(alert, snap.quote)) {
      rearm?.(alert.id);
    }
  }
  if (fired.length) broadcast({ type: 'alert', at: Date.now(), alerts: fired });
}

/** Wait until the loop has completed one pass — used by integration tests. */
export async function waitForTick(timeoutMs = 25_000): Promise<void> {
  const start = Date.now();
  const first = hub().lastRefreshAt;
  while (Date.now() - start < timeoutMs) {
    if (hub().lastRefreshAt && hub().lastRefreshAt !== first) return;
    await sleep(200);
  }
}
