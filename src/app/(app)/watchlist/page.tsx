'use client';
import { Block,Page } from '@/components/Page';
import { ChangeText,PriceText,QualityBadge,Sparkline,StateBadge,displayName } from '@/components/quote';
import { Button,EmptyState,ErrorState,Modal,Segmented,SelectInput,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { directionOf,formatVolume } from '@/lib/format';
import { marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useInterest } from '@/lib/useInterest';
import type { WatchlistGroup } from '@/server/types';
import type { SearchResponse } from '@/shared/api';
import { useLive } from '@/stores/live';
import { usePrefs } from '@/stores/prefs';
import { useUserData } from '@/stores/userdata';
import { GripVertical,Pin,Plus,Search,Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';

type SortKey = 'manual' | 'name' | 'change' | 'price' | 'market';

/**
 * Watchlists: multiple groups, drag reorder, pinning, table and compact
 * views, all persisted to the local database rather than to a cookie.
 *
 * Drag-and-drop uses native HTML5 events on purpose — no dependency, and the
 * keyboard path (the row stays a link; ordering has an explicit fallback in
 * the row menu) does not regress because a library owns the gestures.
 */
export default function WatchlistPage() {
  const { t, locale } = useI18n();
  const groups = useUserData((s) => s.groups);
  const activeId = useUserData((s) => s.activeGroupId);
  const setActive = useUserData((s) => s.setActiveGroup);
  const snapshots = useLive((s) => s.snapshots);
  const view = usePrefs((s) => s.watchlistView);
  const setView = usePrefs((s) => s.set);
  const sortKey = usePrefs((s) => (s.watchlistSort[activeId ?? ''] as SortKey) ?? 'manual');
  const loading = useUserData((s) => s.loading);
  const error = useUserData((s) => s.error);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void useUserData.getState().load();
  }, []);

  const group = useMemo(() => groups.find((g) => g.id === activeId) ?? groups[0] ?? null, [groups, activeId]);
  const ids = useMemo(() => group?.instrumentIds ?? [], [group]);
  useInterest(ids);

  const rows = useMemo(() => {
    const list = ids.map((id) => snapshots[id]).filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (sortKey === 'manual') {
      const pinned = group?.pinned ?? [];
      return [...list].sort((a, b) => {
        const pa = pinned.indexOf(a.instrument.id);
        const pb = pinned.indexOf(b.instrument.id);
        if (pa !== -1 && pb !== -1) return pa - pb;
        if (pa !== -1) return -1;
        if (pb !== -1) return 1;
        return ids.indexOf(a.instrument.id) - ids.indexOf(b.instrument.id);
      });
    }
    const cmp: Record<Exclude<SortKey, 'manual'>, (a: NonNullable<(typeof list)[number]>, b: NonNullable<(typeof list)[number]>) => number> = {
      name: (a, b) => displayName(a.instrument, locale).localeCompare(displayName(b.instrument, locale)),
      change: (a, b) => (b.quote?.changePercent ?? -999) - (a.quote?.changePercent ?? -999),
      price: (a, b) => (b.quote?.last ?? 0) - (a.quote?.last ?? 0),
      market: (a, b) => a.instrument.market.localeCompare(b.instrument.market) || a.instrument.displaySymbol.localeCompare(b.instrument.displaySymbol),
    };
    return [...list].sort(cmp[sortKey as Exclude<SortKey, 'manual'>]);
  }, [ids, snapshots, sortKey, group?.pinned, locale]);

  const missing = ids.filter((id) => !snapshots[id]);

  return (
    <Page
      title={t('nav.watchlist')}
      subtitle={`${groups.length} ${t('watchlist.groups').toLowerCase()} · ${t('watchlist.saved')}`}
      actions={
        <>
          <Segmented
            size="sm"
            value={view}
            onChange={(v) => setView('watchlistView', v)}
            options={[
              { value: 'table', label: t('watchlist.view.table') },
              { value: 'compact', label: t('watchlist.view.compact') },
            ]}
          />
          <SelectInput
            ariaLabel={t('watchlist.sortBy')}
            value={sortKey}
            onChange={(v) => setView('watchlistSort', { ...(usePrefs.getState().watchlistSort), [activeId ?? '']: v })}
            options={[
              { value: 'manual', label: t('watchlist.sort.manual') },
              { value: 'name', label: t('watchlist.sort.name') },
              { value: 'change', label: t('watchlist.sort.change') },
              { value: 'price', label: t('watchlist.sort.price') },
              { value: 'market', label: t('watchlist.sort.market') },
            ]}
          />
          <AddSymbol groupId={group?.id ?? null} />
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActive(g.id)}
            className={
              g.id === group?.id
                ? 'rounded-[3px] border border-accent/40 bg-accent-soft px-2 py-[3px] text-[11.5px] font-medium text-accent'
                : 'rounded-[3px] border border-line px-2 py-[3px] text-[11.5px] text-ink-muted hover:border-line-strong hover:text-ink'
            }
          >
            {g.name}
            <span className="num ml-1.5 text-[10px] opacity-70">{g.instrumentIds.length}</span>
          </button>
        ))}
        <NewGroupButton />
        {group ? <GroupActions group={group} /> : null}
      </div>

      {loading ? <Spinner /> : null}
      {error ? <ErrorState title={error} onRetry={() => void useUserData.getState().load()} /> : null}

      <Block flush>
        {!group || ids.length === 0 ? (
          <EmptyState title={t('watchlist.empty')} action={<AddSymbol groupId={group?.id ?? null} compact />} />
        ) : view === 'compact' ? (
          <div className="grid grid-cols-2 gap-px bg-line p-px sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map((snap) => (
              <CompactCell key={snap.instrument.id} snapshot={snap} />
            ))}
          </div>
        ) : (
          <WatchlistTable rows={rows} group={group} sortKey={sortKey} />
        )}
        {missing.length ? (
          <p className="border-t border-line px-3 py-1.5 text-[10.5px] text-[var(--t-warn)]">
            {missing.length} {locale === 'zh' ? '个代码尚未取得数据（首次加载或数据源不可用）' : 'symbols have not returned data yet (first load, or the feed is unavailable)'}
          </p>
        ) : null}
      </Block>
    </Page>
  );
}

function WatchlistTable({ rows, group, sortKey }: { rows: NonNullable<ReturnType<typeof useLive.getState>['snapshots'][string]>[]; group: WatchlistGroup; sortKey: SortKey }) {
  const { t, locale } = useI18n();
  const reorder = useUserData((s) => s.reorder);
  const remove = useUserData((s) => s.removeSymbol);
  const pin = useUserData((s) => s.togglePin);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDrop = useCallback(
    (targetId: string) => {
      const source = dragId.current;
      dragId.current = null;
      setOverId(null);
      if (!source || source === targetId || sortKey !== 'manual') return;
      const ids = [...group.instrumentIds];
      const from = ids.indexOf(source);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      void reorder(group.id, ids);
    },
    [group, reorder, sortKey],
  );

  return (
    <div className="overflow-x-auto">
      <table data-testid="watchlist-table" className="w-full min-w-[840px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.06em] text-ink-faint">
            <th className="w-[26px] px-2 py-2" />
            <th className="px-3 py-2 font-medium">{t('common.symbol')}</th>
            <th className="px-3 py-2 font-medium">{t('common.name')}</th>
            <th className="px-3 py-2 font-medium">{t('common.market')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('common.price')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('common.change')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('common.changePct')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('detail.volume')}</th>
            <th className="px-3 py-2 font-medium">{t('common.status')}</th>
            <th className="w-[72px] px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((snap) => {
            const pinned = group.pinned.includes(snap.instrument.id);
            return (
              <tr
                key={snap.instrument.id}
                draggable={sortKey === 'manual'}
                onDragStart={() => {
                  dragId.current = snap.instrument.id;
                }}
                onDragOver={(e) => {
                  if (!dragId.current) return;
                  e.preventDefault();
                  setOverId(snap.instrument.id);
                }}
                onDragLeave={() => setOverId((prev) => (prev === snap.instrument.id ? null : prev))}
                onDrop={() => onDrop(snap.instrument.id)}
                className={
                  overId === snap.instrument.id
                    ? 'border-b border-line bg-accent-soft'
                    : 'border-b border-line-faint last:border-b-0 hover:bg-surface-alt'
                }
              >
                <td className="px-2 py-[5px] text-ink-faint">
                  {sortKey === 'manual' ? <GripVertical size={13} className="cursor-grab" aria-hidden /> : null}
                </td>
                <td className="px-3 py-[5px]">
                  <Link href={`/stocks/${encodeURIComponent(snap.instrument.id)}`} className="num font-semibold text-ink no-underline hover:text-accent">
                    {snap.instrument.displaySymbol}
                  </Link>
                  {pinned ? <Pin size={10} className="ml-1 inline text-accent" aria-hidden /> : null}
                </td>
                <td className="max-w-[220px] truncate px-3 py-[5px] text-ink-secondary">{displayName(snap.instrument, locale)}</td>
                <td className="px-3 py-[5px] text-[11px] text-ink-muted">{marketName(locale, snap.instrument.market)}</td>
                <td className="px-3 py-[5px] text-right"><PriceText snapshot={snap} /></td>
                <td className="px-3 py-[5px] text-right num text-[11.5px] text-ink-muted">
                  {snap.quote?.change !== null && snap.quote?.change !== undefined ? formatSigned(snap.quote.change) : '—'}
                </td>
                <td className="px-3 py-[5px] text-right"><ChangeText snapshot={snap} /></td>
                <td className="num px-3 py-[5px] text-right text-[11.5px] text-ink-muted">{formatVolume(snap.quote?.volume, locale)}</td>
                <td className="px-3 py-[5px]">
                  <div className="flex items-center gap-1.5">
                    <StateBadge status={snap.status} />
                  </div>
                  <QualityBadge snapshot={snap} className="mt-0.5" />
                </td>
                <td className="px-2 py-[5px]">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => void pin(group.id, snap.instrument.id)}
                      title={pinned ? t('watchlist.unpin') : t('watchlist.pin')}
                      aria-label={pinned ? t('watchlist.unpin') : t('watchlist.pin')}
                      className="rounded-[2px] p-1 text-ink-faint hover:bg-surface-inset hover:text-ink"
                    >
                      <Pin size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(group.id, snap.instrument.id)}
                      title={t('watchlist.remove')}
                      aria-label={t('watchlist.remove')}
                      className="rounded-[2px] p-1 text-ink-faint hover:bg-surface-inset hover:text-[var(--t-down)]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompactCell({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useLive.getState>['snapshots'][string]> }) {
  const { locale } = useI18n();
  return (
    <Link
      href={`/stocks/${encodeURIComponent(snapshot.instrument.id)}`}
      className="flex flex-col gap-1 bg-surface p-2 no-underline hover:bg-surface-alt"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-[11.5px] font-semibold text-ink">{snapshot.instrument.displaySymbol}</span>
        <Sparkline values={snapshot.sparkline} direction={directionOf(snapshot.quote)} width={40} height={12} />
      </div>
      <span className="truncate text-[10.5px] text-ink-faint">{displayName(snapshot.instrument, locale)}</span>
      <div className="flex items-baseline justify-between gap-2">
        <PriceText snapshot={snapshot} size="sm" />
        <ChangeText snapshot={snapshot} size="sm" showGlyph={false} />
      </div>
    </Link>
  );
}

function AddSymbol({ groupId, compact = false }: { groupId: string | null; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const add = useUserData((s) => s.addSymbol);
  return (
    <>
      <Button size="sm" variant={compact ? 'default' : 'primary'} onClick={() => setOpen(true)} disabled={!groupId}>
        <Plus size={12} /> {t('watchlist.add')}
      </Button>
      <Picker
        open={open}
        onClose={() => setOpen(false)}
        onPick={async (id) => {
          if (!groupId) return;
          const ok = await add(groupId, id);
          if (ok) setOpen(false);
        }}
      />
    </>
  );
}

/** Shared instrument picker, search-backed with full result metadata. */
export function Picker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (!open) { setQuery(''); setResult(null); setLoading(false); return; }
      if (!query.trim()) { setResult(null); setLoading(false); return; }
      setLoading(true);
      const res = await api.search(query.trim());
      if (cancelled) return;
      setResult(res.data);
      setError(res.error);
      setLoading(false);
    }, 200);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [query, open]);

  return (
    <Modal open={open} onClose={onClose} title={t('watchlist.add' as never)} width={560}>
      <div data-testid="symbol-picker" className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-[var(--t-radius-sm)] border border-line bg-surface px-2">
          <Search size={13} className="text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="h-[30px] flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-faint"
          />
          {loading ? <Spinner /> : null}
        </div>
        {error ? <p role="alert" className="text-[12px] text-down">{t('search.error', { msg: error })}</p> : null}
        <div className="max-h-[320px] overflow-y-auto">
          {(result?.results ?? []).map((row) => (
            <button
              key={row.instrument.id}
              type="button"
              data-picker-row={row.instrument.id}
              onClick={() => onPick(row.instrument.id)}
              className="flex w-full items-center gap-3 border-b border-line-faint px-2 py-2 text-left last:border-b-0 hover:bg-surface-alt"
            >
              <span className="num w-[76px] shrink-0 text-[12px] font-semibold text-ink">{row.instrument.displaySymbol}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-ink-secondary">{displayName(row.instrument, locale)}</span>
                <span className="block truncate text-[10.5px] text-ink-faint">
                  {marketName(locale, row.instrument.market)} · {row.instrument.exchange} · {row.instrument.currency}
                </span>
              </span>
              <span className="w-[64px] text-right"><PriceText snapshot={{ instrument: row.instrument, quote: row.quote, status: row.status ?? undefined } as never} size="sm" /></span>
            </button>
          ))}
          {result && !result.results.length && !loading ? <p className="px-2 py-4 text-center text-[12px] text-ink-muted">{t('search.noResults', { q: query })}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

function NewGroupButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useUserData((s) => s.createGroup);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Plus size={12} /> {t('watchlist.newGroup')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('watchlist.newGroup')}
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                if (!name.trim()) return;
                await create(name.trim());
                setName('');
                setOpen(false);
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{t('watchlist.groupName')}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-[30px] rounded-[var(--t-radius-sm)] border border-line bg-surface px-2 text-[13px] outline-none focus:border-accent"
          />
        </label>
      </Modal>
    </>
  );
}

function GroupActions({ group }: { group: WatchlistGroup }) {
  const { t } = useI18n();
  const rename = useUserData((s) => s.renameGroup);
  const del = useUserData((s) => s.deleteGroup);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setName(group.name); setOpen(true); }}>
        {t('watchlist.renameGroup')}
      </Button>
      {!group.builtin ? (
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            if (!window.confirm(t('settings.confirmReset'))) return;
            await del(group.id);
          }}
        >
          {t('watchlist.deleteGroup')}
        </Button>
      ) : null}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('watchlist.renameGroup')}
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                await rename(group.id, name);
                setOpen(false);
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-[30px] w-full rounded-[var(--t-radius-sm)] border border-line bg-surface px-2 text-[13px] outline-none focus:border-accent"
        />
      </Modal>
    </>
  );
}

function formatSigned(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${abs.toFixed(digits)}`;
}
