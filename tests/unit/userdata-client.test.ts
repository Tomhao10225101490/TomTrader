import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceAlert, WatchlistGroup } from '@/server/types';
import { api } from '@/lib/api';
import { useUserData } from '@/stores/userdata';

vi.mock('@/lib/api', () => ({ api: {
  watchlist: { get: vi.fn(), post: vi.fn() },
  alerts: { get: vi.fn(), post: vi.fn() },
} }));
vi.mock('@/stores/live', () => ({ useLive: { getState: () => ({ primeSnapshots: vi.fn() }) } }));

const group: WatchlistGroup = { id: 'g1', name: 'Saved list', instrumentIds: ['equity:US:AAPL'], pinned: [], builtin: false, createdAt: 0 };
const alert = { id: 'a1', instrumentId: 'equity:US:AAPL', enabled: true } as PriceAlert;
const denied = { data: null, error: 'Injected local write failure', degraded: false };
const ok = { data: { ok: true }, error: null, degraded: false };

beforeEach(() => {
  vi.resetAllMocks();
  useUserData.setState({ groups: [group], activeGroupId: group.id, snapshots: {}, alerts: [alert], alertEvents: [], error: null, loading: false });
  vi.mocked(api.watchlist.get).mockResolvedValue({ data: { groups: [group], snapshots: [] }, error: null, degraded: false });
  vi.mocked(api.alerts.get).mockResolvedValue({ data: { alerts: [alert], events: [] }, error: null, degraded: false });
  vi.mocked(api.watchlist.post).mockResolvedValue(denied);
  vi.mocked(api.alerts.post).mockResolvedValue(denied);
});

describe('client mutations retain data and surface failures (mock API)', () => {
  it.each(['create', 'rename', 'delete', 'pin'] as const)('reports failed group %s without masking the error with a reload', async (action) => {
    const store = useUserData.getState();
    if (action === 'create') expect(await store.createGroup('New')).toBe(false);
    if (action === 'rename') expect(await store.renameGroup(group.id, 'New')).toBe(false);
    if (action === 'delete') await store.deleteGroup(group.id);
    if (action === 'pin') await store.togglePin(group.id, 'equity:US:AAPL');
    expect(useUserData.getState().groups).toEqual([group]);
    expect(useUserData.getState().activeGroupId).toBe(group.id);
    expect(useUserData.getState().error).toBe(denied.error);
    expect(api.watchlist.get).not.toHaveBeenCalled();
  });

  it('clears an earlier group mutation error only when retrying and returns success', async () => {
    await useUserData.getState().createGroup('New');
    vi.mocked(api.watchlist.post).mockResolvedValueOnce(ok);
    expect(await useUserData.getState().createGroup('New')).toBe(true);
    expect(api.watchlist.get).toHaveBeenCalledOnce();
    expect(useUserData.getState().error).toBeNull();
  });

  it('keeps saved alerts when an alert reload fails', async () => {
    vi.mocked(api.alerts.get).mockResolvedValueOnce(denied);
    await useUserData.getState().loadAlerts();
    expect(useUserData.getState().alerts).toEqual([alert]);
    expect(useUserData.getState().error).toBe(denied.error);
  });

  it.each(['toggle', 'delete'] as const)('restores the prior alert and shows a failed %s', async (action) => {
    if (action === 'toggle') await useUserData.getState().toggleAlert(alert.id, false);
    else await useUserData.getState().deleteAlert(alert.id);
    expect(useUserData.getState().alerts).toEqual([alert]);
    expect(useUserData.getState().error).toBe(denied.error);
    expect(api.alerts.get).not.toHaveBeenCalled();
  });
});
