import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { DEFAULT_GROUPS,instrumentById } from './instruments';
import type { AlertEvent,PriceAlert,WatchlistGroup } from './types';

/**
 * User data: watchlists, holdings, alerts.
 *
 * No accounts, no sync, no cloud — everything lives in the local SQLite file
 * and is exported/imported as plain JSON. That is a deliberate product choice
 * (see docs/ARCHITECTURE.md): a market terminal that never leaves the machine
 * is easier to trust than one that needs a login to remember a watchlist.
 */

const now = () => Date.now();

/* --------------------------------------------------------------- watchlists */

interface GroupRow {
  id: string;
  name: string;
  instrument_ids: string;
  pinned: string;
  builtin: number;
  position: number;
  created_at: number;
}

function rowToGroup(r: GroupRow): WatchlistGroup {
  return {
    id: r.id,
    name: r.name,
    instrumentIds: JSON.parse(r.instrument_ids) as string[],
    pinned: JSON.parse(r.pinned) as string[],
    builtin: r.builtin === 1,
    createdAt: r.created_at,
  };
}

export function listGroups(): WatchlistGroup[] {
  const rows = getDb().prepare('SELECT * FROM watchlist_group ORDER BY position, created_at').all() as unknown as GroupRow[];
  if (rows.length) return rows.map(rowToGroup);
  return seedDefaultGroups();
}

function seedDefaultGroups(): WatchlistGroup[] {
  const db = getDb();
  db.exec('BEGIN');
  try {
    DEFAULT_GROUPS.forEach((group, index) => {
      const ids = group.ids.filter((id) => instrumentById(id));
      db.prepare(
        'INSERT OR REPLACE INTO watchlist_group (id, name, instrument_ids, pinned, builtin, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(`grp_${index + 1}`, group.name, JSON.stringify(ids), '[]', 1, index, now());
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return listGroups();
}

export function createGroup(name: string): WatchlistGroup {
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO watchlist_group (id, name, instrument_ids, pinned, builtin, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name.trim() || 'New list', '[]', '[]', 0, 999, now());
  return { id, name: name.trim() || 'New list', instrumentIds: [], pinned: [], createdAt: now() };
}

export function renameGroup(id: string, name: string): void {
  getDb().prepare('UPDATE watchlist_group SET name = ? WHERE id = ?').run(name.trim() || 'Untitled', id);
}

export function deleteGroup(id: string): void {
  getDb().prepare('DELETE FROM watchlist_group WHERE id = ?').run(id);
}

export function addToGroup(groupId: string, instrumentId: string, position?: number): void {
  const group = getGroup(groupId);
  if (!group) return;
  if (group.instrumentIds.includes(instrumentId)) return;
  const ids = [...group.instrumentIds];
  ids.splice(position ?? ids.length, 0, instrumentId);
  saveGroup(groupId, ids, group.pinned);
}

export function removeFromGroup(groupId: string, instrumentId: string): void {
  const group = getGroup(groupId);
  if (!group) return;
  saveGroup(
    groupId,
    group.instrumentIds.filter((i) => i !== instrumentId),
    group.pinned.filter((i) => i !== instrumentId),
  );
}

export function reorderGroup(groupId: string, ids: string[]): void {
  const group = getGroup(groupId);
  if (!group) return;
  // Accept any permutation of the current membership, ignore foreign ids.
  const known = new Set(group.instrumentIds);
  const next = ids.filter((id) => known.has(id));
  for (const id of group.instrumentIds) if (!next.includes(id)) next.push(id);
  saveGroup(groupId, next, group.pinned);
}

export function togglePinned(groupId: string, instrumentId: string): void {
  const group = getGroup(groupId);
  if (!group) return;
  const pinned = group.pinned.includes(instrumentId) ? group.pinned.filter((i) => i !== instrumentId) : [instrumentId, ...group.pinned];
  saveGroup(groupId, group.instrumentIds, pinned);
}

function getGroup(id: string): WatchlistGroup | null {
  const row = getDb().prepare('SELECT * FROM watchlist_group WHERE id = ?').get(id) as GroupRow | undefined;
  return row ? rowToGroup(row) : null;
}

function saveGroup(id: string, ids: string[], pinned: string[]): void {
  getDb()
    .prepare('UPDATE watchlist_group SET instrument_ids = ?, pinned = ? WHERE id = ?')
    .run(JSON.stringify(ids), JSON.stringify(pinned), id);
}

/* ---------------------------------------------------------------- holdings */

export interface HoldingRow {
  id: string;
  instrument_id: string;
  quantity: number;
  average_cost: number;
  currency: string;
  purchased_at: string;
  note: string | null;
  position: number;
}

export function listHoldings(): HoldingRow[] {
  return getDb().prepare('SELECT * FROM holding ORDER BY position, purchased_at').all() as unknown as HoldingRow[];
}

export function addHolding(input: {
  instrumentId: string;
  quantity: number;
  averageCost: number;
  currency: string;
  purchasedAt: string;
  note?: string;
}): HoldingRow {
  const id = randomUUID();
  const count = (getDb().prepare('SELECT COUNT(*) AS n FROM holding').get() as { n: number }).n;
  getDb()
    .prepare(
      'INSERT INTO holding (id, instrument_id, quantity, average_cost, currency, purchased_at, note, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, input.instrumentId, input.quantity, input.averageCost, input.currency, input.purchasedAt, input.note ?? null, count);
  const row = getDb().prepare('SELECT * FROM holding WHERE id = ?').get(id) as unknown as HoldingRow;
  return row;
}

/** All-or-nothing import: a failed row must not leave an unreported partial import. */
export function importHoldings(inputs: Parameters<typeof addHolding>[0][]): HoldingRow[] {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const rows = inputs.map(addHolding);
    db.exec('COMMIT');
    return rows;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function updateHolding(
  id: string,
  input: Partial<{ quantity: number; averageCost: number; currency: string; purchasedAt: string; note: string; instrumentId: string }>,
): void {
  const current = getDb().prepare('SELECT * FROM holding WHERE id = ?').get(id) as unknown as HoldingRow | undefined;
  if (!current) return;
  getDb()
    .prepare(
      'UPDATE holding SET instrument_id = ?, quantity = ?, average_cost = ?, currency = ?, purchased_at = ?, note = ? WHERE id = ?',
    )
    .run(
      input.instrumentId ?? current.instrument_id,
      input.quantity ?? current.quantity,
      input.averageCost ?? current.average_cost,
      input.currency ?? current.currency,
      input.purchasedAt ?? current.purchased_at,
      input.note === undefined ? current.note : input.note,
      id,
    );
}

export function removeHolding(id: string): void {
  getDb().prepare('DELETE FROM holding WHERE id = ?').run(id);
}

/* ------------------------------------------------------------------ alerts */

interface AlertRow {
  id: string;
  instrument_id: string;
  condition: string;
  enabled: number;
  cooldown_minutes: number;
  armed: number;
  created_at: number;
  last_triggered_at: number | null;
  triggered_count: number;
}

function rowToAlert(r: AlertRow): PriceAlert {
  return {
    id: r.id,
    instrumentId: r.instrument_id,
    condition: JSON.parse(r.condition) as PriceAlert['condition'],
    enabled: r.enabled === 1,
    cooldownMinutes: r.cooldown_minutes,
    armed: r.armed === 1,
    createdAt: r.created_at,
    lastTriggeredAt: r.last_triggered_at,
    triggeredCount: r.triggered_count,
  };
}

export function listAlerts(): PriceAlert[] {
  return (getDb().prepare('SELECT * FROM alert ORDER BY created_at DESC').all() as unknown as AlertRow[]).map(rowToAlert);
}

export function createAlert(input: { instrumentId: string; condition: PriceAlert['condition']; cooldownMinutes?: number }): PriceAlert {
  const id = randomUUID();
  getDb()
    .prepare(
      'INSERT INTO alert (id, instrument_id, condition, enabled, cooldown_minutes, armed, created_at, triggered_count) VALUES (?, ?, ?, 1, ?, 1, ?, 0)',
    )
    .run(id, input.instrumentId, JSON.stringify(input.condition), input.cooldownMinutes ?? 30, now());
  return {
    id,
    instrumentId: input.instrumentId,
    condition: input.condition,
    enabled: true,
    cooldownMinutes: input.cooldownMinutes ?? 30,
    createdAt: now(),
    lastTriggeredAt: null,
    triggeredCount: 0,
    armed: true,
  };
}

export function setAlertEnabled(id: string, enabled: boolean): void {
  getDb().prepare('UPDATE alert SET enabled = ?, armed = 1 WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function updateAlert(id: string, patch: Partial<{ condition: PriceAlert['condition']; cooldownMinutes: number; armed: boolean }>): void {
  const row = getDb().prepare('SELECT * FROM alert WHERE id = ?').get(id) as unknown as AlertRow | undefined;
  if (!row) return;
  getDb()
    .prepare('UPDATE alert SET condition = ?, cooldown_minutes = ?, armed = ? WHERE id = ?')
    .run(
      JSON.stringify(patch.condition ?? JSON.parse(row.condition)),
      patch.cooldownMinutes ?? row.cooldown_minutes,
      patch.armed === undefined ? row.armed : patch.armed ? 1 : 0,
      id,
    );
}

export function deleteAlert(id: string): void {
  getDb().prepare('DELETE FROM alert WHERE id = ?').run(id);
}

/**
 * Mark an alert as fired and disarm it.
 *
 * Disarming is what stops a price sitting on the threshold from firing every
 * poll: the alert only re-arms once the price has moved back through the level
 * (see `rearmAlerts`, called by the realtime loop after each batch).
 */
export function markAlertFired(id: string, snap: { instrumentId: string }, detail: string, price: number): AlertEvent {
  const eventId = randomUUID();
  const at = now();
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE alert SET last_triggered_at = ?, triggered_count = triggered_count + 1, armed = 0 WHERE id = ?').run(at, id);
    db.prepare('INSERT INTO alert_event (id, alert_id, instrument_id, fired_at, price, detail) VALUES (?, ?, ?, ?, ?, ?)').run(
      eventId,
      id,
      snap.instrumentId,
      at,
      price,
      detail,
    );
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { id: eventId, alertId: id, instrumentId: snap.instrumentId, at, price, detail };
}

/** Re-arm a crossed alert once the price has come back off the threshold. */
export function rearmAlert(id: string): void {
  getDb().prepare('UPDATE alert SET armed = 1 WHERE id = ? AND armed = 0').run(id);
}

export function listAlertEvents(limit = 40): AlertEvent[] {
  return (getDb().prepare('SELECT * FROM alert_event ORDER BY fired_at DESC LIMIT ?').all(limit) as unknown as {
    id: string;
    alert_id: string;
    instrument_id: string;
    fired_at: number;
    price: number;
    detail: string;
  }[]).map((r) => ({ id: r.id, alertId: r.alert_id, instrumentId: r.instrument_id, at: r.fired_at, price: r.price, detail: r.detail }));
}

/* ------------------------------------------------------------------- reset */

export function clearAllUserData(): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM watchlist_group; DELETE FROM holding; DELETE FROM alert; DELETE FROM alert_event;');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function exportUserData() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: listGroups(),
    holdings: listHoldings().map((h) => ({ id: h.id, instrumentId: h.instrument_id, quantity: h.quantity, averageCost: h.average_cost, currency: h.currency, purchasedAt: h.purchased_at, note: h.note })),
    alerts: listAlerts(),
  };
}
