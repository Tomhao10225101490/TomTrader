'use client';
import { Picker } from '@/app/(app)/watchlist/page';
import { Block,Page } from '@/components/Page';
import { ChangeText,displayName,PriceText } from '@/components/quote';
import { Button,EmptyState,Field,Modal,Segmented,SelectInput,TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import { resolveInstrument } from '@/lib/clientInstruments';
import { formatClock,formatPercent,formatPrice } from '@/lib/format';
import { useI18n } from '@/lib/i18n-context';
import { useInterest } from '@/lib/useInterest';
import type { AlertCondition,PriceAlert } from '@/server/types';
import { useLive } from '@/stores/live';
import { usePrefs } from '@/stores/prefs';
import { useUserData } from '@/stores/userdata';
import { BellOff,Pencil,Plus,Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';

const CONDITION_TYPES: AlertCondition['type'][] = ['price-above', 'price-below', 'change-percent-above', 'change-percent-below'];

/**
 * Alerts page.
 *
 * Two limits are stated on the page rather than hidden in a tooltip: alerts
 * only fire while this browser tab is running (there is no server-side push
 * channel in a local-first build), and 52-week conditions are refused at
 * creation because no connected provider supplies that data.
 */
export default function AlertsPage() {
  const { t, locale, zoneOf } = useI18n();
  const alerts = useUserData((s) => s.alerts);
  const alertIds = alerts.filter((a) => a.enabled).map((a) => a.instrumentId);
  useInterest(alertIds);
  const events = useUserData((s) => s.alertEvents);
  const load = useUserData((s) => s.loadAlerts);
  const toggle = useUserData((s) => s.toggleAlert);
  const del = useUserData((s) => s.deleteAlert);
  const snapshots = useLive((s) => s.snapshots);
  const notificationsOptIn = usePrefs((s) => s.notificationsOptIn);
  const setPref = usePrefs((s) => s.set);
  const [newInstrumentId, setNewInstrumentId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PriceAlert | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const loaded = useRef(false);

  useEffect(() => {
    const symbol = new URLSearchParams(window.location.search).get('symbol');
    if (!symbol || !resolveInstrument(symbol)) return;
    const timer = setTimeout(() => { setNewInstrumentId(symbol); setCreateOpen(true); }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    // The trigger log is written by the server-side evaluator, so this page
    // re-reads it on a slow timer while open: the user should not have to
    // reload to see that an alert fired.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <Page
      title={t('alerts.title')}
      subtitle={t('alerts.appOnly')}
      actions={
        <>
          {permission !== 'granted' && permission !== 'unsupported' ? (
            <Button
              size="sm"
              onClick={async () => {
                const result = await Notification.requestPermission();
                setPermission(result);
                if (result === 'granted') setPref('notificationsOptIn', true);
              }}
            >
              {t('alerts.grantNotifications')}
            </Button>
          ) : null}
          {permission === 'granted' ? (
            <Segmented
              size="sm"
              value={notificationsOptIn ? 'on' : 'off'}
              onChange={(v) => setPref('notificationsOptIn', v === 'on')}
              options={[{ value: 'on', label: locale === 'zh' ? '系统通知' : 'System' }, { value: 'off', label: locale === 'zh' ? '站内通知' : 'In-app' }]}
            />
          ) : null}
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={12} /> {t('alerts.new')}
          </Button>
        </>
      }
    >
      {permission === 'denied' ? <p className="text-[11.5px] text-[var(--t-warn)]">{t('alerts.notificationsBlocked')}</p> : null}

      <Block flush title={t('alerts.title')} subtitle={`${alerts.length}`}>
        {alerts.length === 0 ? (
          <EmptyState title={t('common.empty')} body={t('alerts.appOnly')} action={<Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>{t('alerts.new')}</Button>} />
        ) : (
          <div className="divide-y divide-line-faint">
            {alerts.map((alert) => {
              const snap = snapshots[alert.instrumentId];
              return (
                <div key={alert.id} data-testid="alert-row" className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="w-[104px] shrink-0">
                    <Link href={`/stocks/${encodeURIComponent(alert.instrumentId)}`} className="num text-[12.5px] font-semibold text-ink no-underline hover:text-accent">
                      {snap?.instrument.displaySymbol ?? alert.instrumentId.split(':')[2]}
                    </Link>
                    <p className="max-w-[100px] truncate text-[10.5px] text-ink-faint">{snap ? displayName(snap.instrument, locale) : ''}</p>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <p className="text-[12px] text-ink-secondary">
                      <span className="text-ink-faint">{t(`alerts.type.${alert.condition.type}`)}</span>{' '}
                      {conditionValue(alert.condition)}
                    </p>
                    <p className="text-[10.5px] text-ink-faint">
                      {t('alerts.cooldown')}: {alert.cooldownMinutes}m · {alert.armed ? (locale === 'zh' ? '待触发' : 'armed') : (locale === 'zh' ? '等待重新满足条件' : 'waiting to re-arm')}
                      {alert.lastTriggeredAt ? ` · ${t('alerts.lastFired')}: ${formatClock(alert.lastTriggeredAt, zoneOf(), locale, { date: true })}` : ''}
                    </p>
                  </div>
                  <div className="w-[70px] text-right"><PriceText snapshot={snap} size="sm" /></div>
                  <div className="w-[64px] text-right"><ChangeText snapshot={snap} size="sm" showGlyph={false} /></div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void toggle(alert.id, !alert.enabled)}
                      title={alert.enabled ? t('alerts.paused') : t('alerts.enabled')}
                      className={
                        alert.enabled
                          ? 'rounded-[3px] border border-[var(--t-up)]/40 bg-[var(--t-up-soft)] px-1.5 py-[2px] text-[10.5px] text-[var(--t-up-strong)]'
                          : 'rounded-[3px] border border-line px-1.5 py-[2px] text-[10.5px] text-ink-muted'
                      }
                    >
                      {alert.enabled ? t('alerts.enabled') : t('alerts.paused')}
                    </button>
                    <Button size="icon" variant="ghost" aria-label={locale === 'zh' ? '修改提醒' : 'Edit alert'} onClick={() => setEditing(alert)}><Pencil size={12} /></Button>
                    {!alert.enabled ? <BellOff size={12} className="text-ink-faint" /> : null}
                    <button type="button" onClick={() => void del(alert.id)} title={t('alerts.delete')} aria-label={t('alerts.delete')} className="rounded-[2px] p-1 text-ink-faint hover:text-[var(--t-down)]">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Block>

      <Block flush title={t('alerts.history')} subtitle={`${events.length}`}>
        {events.length === 0 ? <p className="px-3 py-4 text-[12px] text-ink-muted">{t('alerts.noHistory')}</p> : (
          <ul className="divide-y divide-line-faint">
            {events.slice(0, 30).map((e) => (
              <li key={e.id} data-testid="alert-event" className="flex items-center justify-between gap-3 px-3 py-[6px] text-[11.5px]">
                <span className="truncate text-ink-secondary">{e.detail}</span>
                <span className="num shrink-0 text-ink-faint">{formatClock(e.at, zoneOf(), locale, { date: true, seconds: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {createOpen || editing ? <CreateAlert key={editing?.id ?? 'new'} open onClose={() => { setCreateOpen(false); setEditing(null); }} initial={editing} instrumentIdOnCreate={newInstrumentId} /> : null}
    </Page>
  );
}

function conditionValue(c: AlertCondition): string {
  if (c.type === 'price-above' || c.type === 'price-below') return formatPrice(c.threshold, { assetType: 'equity', currency: 'USD' } as never, 'en', { symbol: false })?.text ?? String(c.threshold);
  if (c.type === 'change-percent-above' || c.type === 'change-percent-below') return formatPercent(Math.abs(c.threshold), 'en');
  return '';
}

function CreateAlert({ open, onClose, initial, instrumentIdOnCreate }: { open: boolean; onClose: () => void; initial?: PriceAlert | null; instrumentIdOnCreate?: string | null }) {
  const { t, locale } = useI18n();
  const [pickOpen, setPickOpen] = useState(false);
  const [instrumentId, setInstrumentId] = useState<string | null>(initial?.instrumentId ?? instrumentIdOnCreate ?? null);
  const [type, setType] = useState<(typeof CONDITION_TYPES)[number]>(initial?.condition.type ?? 'price-above');
  const [threshold, setThreshold] = useState(initial && 'threshold' in initial.condition ? String(initial.condition.threshold) : '');
  const [cooldown, setCooldown] = useState(String(initial?.cooldownMinutes ?? 30));
  const [error, setError] = useState<string | null>(null);
  const snap = useLive((s) => instrumentId ? s.snapshots[instrumentId] : undefined);
  const instrument = instrumentId ? resolveInstrument(instrumentId) : null;
  const price = snap?.quote?.last;



  const isPercent = type.startsWith('change-percent');

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={initial ? (locale === 'zh' ? '修改提醒' : 'Edit alert') : t('alerts.new')}
        footer={
          <>
            <Button size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!instrumentId || !threshold}
              onClick={async () => {
                setError(null);
                const condition: AlertCondition =
                  type === 'price-above'
                    ? { type, threshold: Number(threshold) }
                    : type === 'price-below'
                      ? { type, threshold: Number(threshold) }
                      : type === 'change-percent-above'
                        ? { type, threshold: Math.abs(Number(threshold)) }
                        : { type, threshold: Math.abs(Number(threshold)) };
                const message = initial ? (await api.alerts.post({ op: 'update', id: initial.id, condition, cooldownMinutes: Number(cooldown) })).error : await useUserData.getState().createAlert({
                  instrumentId: instrumentId!,
                  condition,
                  cooldownMinutes: Number(cooldown),
                });
                if (message) setError(message);
                else {
                  await useUserData.getState().loadAlerts();
                  onClose();
                  setInstrumentId(null);
                  setThreshold('');
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('common.symbol')}>
            <div className="flex items-center gap-2">
              <TextInput readOnly value={instrument ? `${instrument.displaySymbol} · ${instrument.currency}` : ''} placeholder="—" className="flex-1 bg-surface-inset" />
              <Button size="sm" disabled={Boolean(initial)} onClick={() => setPickOpen(true)}>{t('search.title')}</Button>
            </div>
          </Field>
          <Field label={t('alerts.condition')}>
            <SelectInput
              value={type}
              onChange={setType}
              options={CONDITION_TYPES.map((c) => ({ value: c, label: t(`alerts.type.${c}` as never) }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('alerts.threshold')} hint={isPercent ? '%' : snap ? `last ${formatPrice(price ?? null, snap.instrument, locale, { symbol: false })?.text}` : undefined}>
              <TextInput data-field="threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" className="num" />
            </Field>
            <Field label={t('alerts.cooldown')} hint={t('alerts.cooldownHint')}>
              <TextInput data-field="cooldown" value={cooldown} onChange={(e) => setCooldown(e.target.value)} inputMode="numeric" className="num" />
            </Field>
          </div>
          <p className="text-[10.5px] leading-relaxed text-ink-faint">{t('alerts.unsupported')}</p>
          {error ? <p className="text-[11.5px] text-[var(--t-down)]">{error}</p> : null}
        </div>
      </Modal>
      <Picker
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        onPick={(id) => {
          setInstrumentId(id);
          setPickOpen(false);
          void useLive.getState();
        }}
      />
    </>
  );
}

export type { PriceAlert };
