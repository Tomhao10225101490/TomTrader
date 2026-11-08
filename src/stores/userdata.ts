'use client';
import { api } from '@/lib/api';
import { create } from 'zustand';
import type { AlertEvent,PriceAlert,WatchlistGroup } from '../server/types';
import type { QuoteSnapshot } from '../shared/api';
import { useLive } from './live';

/**
 * Client mirror of the server-side user data.
 *
 * Mutations are optimistic: the list changes the moment you click, the request
 * follows, and a failure rolls the row back and surfaces the reason. Watching
 * a moving market should never feel like waiting for a database.
 */

interface UserDataState {
  groups: WatchlistGroup[];
  activeGroupId: string | null;
  snapshots: Record<string, QuoteSnapshot>;
  alerts: PriceAlert[];
  alertEvents: AlertEvent[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  setActiveGroup: (id: string) => void;
  addSymbol: (groupId: string, instrumentId: string) => Promise<boolean>;
  removeSymbol: (groupId: string, instrumentId: string) => Promise<void>;
  reorder: (groupId: string, ids: string[]) => Promise<void>;
  togglePin: (groupId: string, instrumentId: string) => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  loadAlerts: () => Promise<void>;
  createAlert: (input: { instrumentId: string; condition: PriceAlert['condition']; cooldownMinutes?: number }) => Promise<string | null>;
  toggleAlert: (id: string, enabled: boolean) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
}

export const useUserData = create<UserDataState>((set, get) => ({
  groups: [],
  activeGroupId: null,
  snapshots: {},
  alerts: [],
  alertEvents: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    const res = await api.watchlist.get();
    if (!res.data || res.error) {
      set({ loading: false, error: res.error ?? 'watchlist request failed' });
      return;
    }
    let saved: string | null = null;
    try { saved = localStorage.getItem('tomtrader.activeGroup'); } catch {}
    const preferred = get().activeGroupId ?? saved;
    const { groups, snapshots } = res.data as { groups: WatchlistGroup[]; snapshots: QuoteSnapshot[] };
    set({
      groups,
      snapshots: Object.fromEntries(snapshots.map((s) => [s.instrument.id, s])),
      activeGroupId: preferred && groups.some((g) => g.id === preferred) ? preferred : (groups[0]?.id ?? null),
      loading: false,
    });
    useLive.getState().primeSnapshots(snapshots);
  },

  setActiveGroup: (id) => {
    try { localStorage.setItem('tomtrader.activeGroup', id); } catch {}
    set({ activeGroupId: id });
  },

  addSymbol: async (groupId, instrumentId) => {
    const before = get().groups;
    const optimistic = before.map((g) =>
      g.id === groupId && !g.instrumentIds.includes(instrumentId) ? { ...g, instrumentIds: [...g.instrumentIds, instrumentId] } : g,
    );
    set({ groups: optimistic });
    const res = await api.watchlist.post({ op: 'add', groupId, instrumentId });
    if (res.error) {
      set({ groups: before, error: res.error });
      return false;
    }
    await get().load();
    return true;
  },

  removeSymbol: async (groupId, instrumentId) => {
    const before = get().groups;
    set({
      groups: before.map((g) =>
        g.id === groupId ? { ...g, instrumentIds: g.instrumentIds.filter((i) => i !== instrumentId), pinned: g.pinned.filter((i) => i !== instrumentId) } : g,
      ),
    });
    const res = await api.watchlist.post({ op: 'remove', groupId, instrumentId });
    if (res.error) set({ groups: before, error: res.error });
  },

  reorder: async (groupId, ids) => {
    const before = get().groups;
    set({ groups: before.map((g) => (g.id === groupId ? { ...g, instrumentIds: ids } : g)) });
    const res = await api.watchlist.post({ op: 'reorder', groupId, ids });
    if (res.error) set({ groups: before, error: res.error });
  },

  togglePin: async (groupId, instrumentId) => {
    await api.watchlist.post({ op: 'pin', groupId, instrumentId });
    await get().load();
  },

  createGroup: async (name) => {
    await api.watchlist.post({ op: 'create', name });
    await get().load();
  },

  renameGroup: async (id, name) => {
    await api.watchlist.post({ op: 'rename', groupId: id, name });
    await get().load();
  },

  deleteGroup: async (id) => {
    await api.watchlist.post({ op: 'delete', groupId: id });
    await get().load();
  },

  loadAlerts: async () => {
    const res = await api.alerts.get();
    if (res.data) {
      const { alerts, events } = res.data as { alerts: PriceAlert[]; events: AlertEvent[] };
      set({ alerts, alertEvents: events });
    }
  },

  createAlert: async (input) => {
    const res = await api.alerts.post({ op: 'create', ...input });
    if (res.error) return res.error;
    await get().loadAlerts();
    return null;
  },

  toggleAlert: async (id, enabled) => {
    const before = get().alerts;
    set({ alerts: before.map((a) => (a.id === id ? { ...a, enabled } : a)) });
    const res = await api.alerts.post({ op: 'toggle', id, enabled });
    if (res.error) set({ alerts: before });
    else await get().loadAlerts();
  },

  deleteAlert: async (id) => {
    const before = get().alerts;
    set({ alerts: before.filter((a) => a.id !== id) });
    const res = await api.alerts.post({ op: 'delete', id });
    if (res.error) set({ alerts: before });
  },
}));
