import { resetDbForTests } from '@/server/db';
import {
addHolding,
addToGroup,
clearAllUserData,
createAlert,
createGroup,
deleteAlert,
deleteGroup,
exportUserData,
listAlertEvents,
listAlerts,
listGroups,
listHoldings,
markAlertFired,
rearmAlert,
removeFromGroup,
removeHolding,
renameGroup,
reorderGroup,
setAlertEnabled,
togglePinned,
updateAlert,
updateHolding,
} from '@/server/userdata';
import { beforeEach,describe,expect,it } from 'vitest';

describe('watchlist groups', () => {
  beforeEach(() => {
    resetDbForTests();
    clearAllUserData();
  });

  it('seeds the default lists on a first run, skipping unknown symbols', () => {
    const groups = listGroups();
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(groups[0].builtin).toBe(true);
    expect(groups[0].instrumentIds.length).toBeGreaterThan(0);
    for (const id of groups.flatMap((g) => g.instrumentIds)) {
      expect(id).toMatch(/^(equity|index|etf|commodity|currency):[A-Z]{2,3}:/);
    }
  });

  it('adds once, removes cleanly', () => {
    const g = listGroups()[0];
    addToGroup(g.id, 'equity:US:MSFT');
    addToGroup(g.id, 'equity:US:MSFT');
    expect(listGroups()[0].instrumentIds.filter((i) => i === 'equity:US:MSFT')).toHaveLength(1);
    removeFromGroup(g.id, 'equity:US:MSFT');
    expect(listGroups()[0].instrumentIds).not.toContain('equity:US:MSFT');
  });

  it('accepts a permutation and rejects foreign ids', () => {
    const g = listGroups()[0];
    const ids = [...g.instrumentIds];
    const foreign = 'equity:US:NOT_IN_GROUP';
    reorderGroup(g.id, [ids[1], foreign, ids[0], ...ids.slice(2)]);
    const after = listGroups()[0].instrumentIds;
    expect(after).not.toContain(foreign);
    expect(after[0]).toBe(ids[1]);
    expect(after[1]).toBe(ids[0]);
    expect(after.length).toBe(ids.length);
  });

  it('pins to the front and unpins', () => {
    const g = listGroups()[0];
    const target = g.instrumentIds[1];
    togglePinned(g.id, target);
    expect(listGroups()[0].pinned).toEqual([target]);
    togglePinned(g.id, target);
    expect(listGroups()[0].pinned).toEqual([]);
  });

  it('creates, renames and deletes user lists', () => {
    const created = createGroup('  My Semis  ');
    expect(created.name).toBe('My Semis');
    renameGroup(created.id, 'Semiconductors');
    expect(listGroups().find((x) => x.id === created.id)?.name).toBe('Semiconductors');
    deleteGroup(created.id);
    expect(listGroups().find((x) => x.id === created.id)).toBeUndefined();
  });

  it('falls back to a name when the user submits nothing', () => {
    const created = createGroup('   ');
    expect(created.name.length).toBeGreaterThan(0);
  });
});

describe('holdings', () => {
  beforeEach(() => {
    resetDbForTests();
    clearAllUserData();
  });

  it('stores quantity, cost, currency and date exactly as entered', () => {
    const row = addHolding({ instrumentId: 'equity:US:AAPL', quantity: 120, averageCost: 189.5, currency: 'USD', purchasedAt: '2026-01-15', note: 'first' });
    expect(row.quantity).toBe(120);
    expect(row.average_cost).toBe(189.5);
    expect(row.currency).toBe('USD');
    expect(row.purchased_at).toBe('2026-01-15');
    updateHolding(row.id, { quantity: 130 });
    const after = listHoldings().find((h) => h.id === row.id);
    expect(after?.quantity).toBe(130);
    expect(after?.currency).toBe('USD');
    removeHolding(row.id);
    expect(listHoldings()).toHaveLength(0);
  });
});

describe('alerts', () => {
  beforeEach(() => {
    resetDbForTests();
    clearAllUserData();
  });

  it('persists a condition and toggles enable/disable with re-arming', () => {
    const a = createAlert({ instrumentId: 'equity:US:AAPL', condition: { type: 'price-above', threshold: 400 } });
    expect(a.armed).toBe(true);
    setAlertEnabled(a.id, false);
    expect(listAlerts()[0].enabled).toBe(false);
    setAlertEnabled(a.id, true);
    expect(listAlerts()[0].enabled).toBe(true);
    expect(listAlerts()[0].armed).toBe(true);
  });

  it('disarms on fire and records the event', () => {
    const a = createAlert({ instrumentId: 'equity:US:AAPL', condition: { type: 'price-above', threshold: 400 }, cooldownMinutes: 5 });
    markAlertFired(a.id, { instrumentId: 'equity:US:AAPL' }, 'AAPL 401 ≥ 400', 401);
    const after = listAlerts()[0];
    expect(after.armed).toBe(false);
    expect(after.triggeredCount).toBe(1);
    expect(after.lastTriggeredAt).not.toBeNull();
    const events = listAlertEvents();
    expect(events[0].detail).toBe('AAPL 401 ≥ 400');
    expect(events[0].price).toBe(401);
  });

  it('re-arms only an alert that is still disarmed', () => {
    const a = createAlert({ instrumentId: 'equity:US:AAPL', condition: { type: 'price-below', threshold: 100 } });
    markAlertFired(a.id, { instrumentId: 'equity:US:AAPL' }, 'x', 9);
    rearmAlert(a.id);
    expect(listAlerts()[0].armed).toBe(true);
    const count = listAlerts()[0].triggeredCount;
    rearmAlert(a.id);
    expect(listAlerts()[0].triggeredCount).toBe(count);
  });

  it('updates a condition and cooldown', () => {
    const a = createAlert({ instrumentId: 'equity:US:AAPL', condition: { type: 'price-above', threshold: 400 } });
    updateAlert(a.id, { condition: { type: 'change-percent-above', threshold: 4 }, cooldownMinutes: 90 });
    const after = listAlerts()[0];
    expect(after.condition).toEqual({ type: 'change-percent-above', threshold: 4 });
    expect(after.cooldownMinutes).toBe(90);
    deleteAlert(a.id);
    expect(listAlerts()).toHaveLength(0);
  });

  it('exports the user state for backup', () => {
    createAlert({ instrumentId: 'equity:US:AAPL', condition: { type: 'price-above', threshold: 400 } });
    addHolding({ instrumentId: 'equity:US:AAPL', quantity: 10, averageCost: 100, currency: 'USD', purchasedAt: '2026-02-01' });
    const dump = exportUserData();
    expect(dump.version).toBe(1);
    expect(dump.alerts).toHaveLength(1);
    expect(dump.groups.length).toBeGreaterThan(0);
  });
});
