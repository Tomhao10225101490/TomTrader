'use client';
import { Picker } from '@/app/(app)/watchlist/page';
import { Block,Page } from '@/components/Page';
import { PriceText,displayName,stockHref } from '@/components/quote';
import { Button,EmptyState,ErrorState,Field,Modal,Segmented,Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { resolveInstrument } from '@/lib/clientInstruments';
import { currencySymbol,formatAgo,formatChange,formatPercent,formatValue } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { marketName } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useAsync } from '@/lib/useAsync';
import { useInterest } from '@/lib/useInterest';
import type { CurrencyCode } from '@/server/types';
import type { PortfolioSummary } from '@/shared/api';
import { useLive } from '@/stores/live';
import { usePrefs } from '@/stores/prefs';
import { Download,Plus,Trash2,Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';

const CURRENCIES: CurrencyCode[] = ['USD', 'CNY', 'HKD', 'EUR', 'JPY', 'GBP'];

/**
 * Read-only portfolio tracker.
 *
 * The whole page is built around the two mistakes this kind of tool makes:
 * adding currencies that do not convert, and calling a historical cost a
 * current one. Both are handled explicitly — a position with no rate is shown
 * as unvalued with the reason, and the FX source and timestamp are printed
 * next to every total.
 */
export default function PortfolioPage() {
  const { t, locale } = useI18n();
  const valuation = usePrefs((s) => s.valuationCurrency);
  const setValuation = usePrefs((s) => s.set);
  const snapshots = useLive((s) => s.snapshots);
  const now = useNow(30_000);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const lastStamp = useRef(0);
  const lastRefresh = useRef(0);

  const load = useAsync(
    useCallback(async () => (await api.portfolio.get(valuation)).data as PortfolioSummary | null, [valuation]),
    [valuation, refreshTick],
  );

  const data = load.data;
  const ids = useMemo(() => (data?.positions ?? []).map((p) => p.instrument.id), [data]);
  useInterest(ids);

  // Live prices arrive over the stream. When their exchange timestamps move we
  // re-request the valuation so the totals and the tape cannot drift apart;
  // the 20s floor keeps that from becoming a polling loop.
  useEffect(() => {
    let stamps = 0;
    for (const id of ids) stamps += snapshots[id]?.quote?.exchangeTimestamp ?? 0;
    if (!stamps || stamps === lastStamp.current) return;
    if (lastStamp.current && Date.now() - lastRefresh.current < 20_000) return;
    lastStamp.current = stamps;
    lastRefresh.current = Date.now();
    setRefreshTick((n) => n + 1);
  }, [snapshots, ids]);

  const positions = data?.positions ?? [];
  const valued = positions.filter((p) => p.marketValue !== null);
  const unvalued = positions.filter((p) => p.marketValue === null);

  return (
    <Page
      title={t('portfolio.title')}
      subtitle={t('portfolio.readonly')}
      actions={
        <>
          <Segmented
            size="sm"
            ariaLabel={t('portfolio.valuationCurrency')}
            value={valuation}
            onChange={(v) => setValuation('valuationCurrency', v as CurrencyCode)}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload size={12} /> {t('portfolio.import')}
          </Button>
          <ExportButton />
          <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
            <Plus size={12} /> {t('portfolio.addHolding')}
          </Button>
        </>
      }
    >
      <p className="text-[10.5px] text-ink-faint"><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a> · {locale === 'zh' ? '每日参考汇率 · 盈亏按当前汇率折算成本和市值，不含历史汇兑收益' : 'Daily reference FX · cost and value translated at current FX; historical currency return excluded'}</p>
      {load.loading && !data ? <Spinner label={t('common.loading')} /> : null}
      {load.error && !data ? <ErrorState title={t('common.error')} body={load.error} onRetry={load.reload} /> : null}

      {data && positions.length === 0 ? (
        <Block flush>
          <EmptyState title={t('portfolio.empty')} action={<Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>{t('portfolio.addHolding')}</Button>} />
        </Block>
      ) : null}

      {data && positions.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label={t('portfolio.totalValue')}
              value={data.totalValue === null ? '—' : `${currencySymbol(data.valuationCurrency)}${formatValue(data.totalValue, locale, 2)}`}
              note={data.fx && now !== null ? t('portfolio.fxAsOf', { at: formatAgo(data.fx.at, now, locale) }) : data.fx ? t('portfolio.fxRate') : null}
            />
            <Metric
              label={t('portfolio.totalPnl')}
              value={data.totalPnl === null ? '—' : `${data.totalPnl > 0 ? '+' : data.totalPnl < 0 ? '−' : ''}${currencySymbol(data.valuationCurrency)}${formatValue(Math.abs(data.totalPnl), locale, 2)}`}
              tone={data.totalPnl === null ? 'flat' : data.totalPnl > 0 ? 'up' : data.totalPnl < 0 ? 'down' : 'flat'}
              note={data.totalPnlPercent === null ? null : formatPercent(data.totalPnlPercent, locale)}
            />
            <Metric label={t('portfolio.totalCost')} value={`${currencySymbol(data.valuationCurrency)}${formatValue(data.totalCost, locale, 2)}`} note={t('portfolio.valuationCurrency') + ': ' + data.valuationCurrency} />
            <Metric
              label={t('portfolio.distribution')}
              value={`${valued.length}/${positions.length}`}
              tone={unvalued.length ? 'warn' : 'flat'}
              note={
                data.partialCoverage.note
                  ? data.partialCoverage.note
                  : data.issue
                    ? `FX: ${data.issue}`
                    : `${t('portfolio.byCountry')} · ${t('portfolio.bySector')} · ${t('portfolio.byCurrency')}`
              }
            />
          </div>

          {unvalued.length > 0 ? (
            <div className="rounded-[var(--t-radius-sm)] border border-[var(--t-warn)]/40 bg-[var(--t-warn-soft)] px-3 py-2 text-[11.5px] text-[var(--t-warn)]">
              <p className="font-medium">{t('portfolio.partial', { covered: valued.length, total: positions.length })}</p>
              <ul className="mt-1 space-y-0.5">
                {unvalued.map((p) => (
                  <li key={p.id} className="num">
                    {p.instrument.displaySymbol} ({p.currency}) — {p.blockedReason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Block flush title={t('portfolio.title')} subtitle={data.fx ? `${data.fx.source} · ${data.fx.tier}` : undefined}>
            <div className="overflow-x-auto">
              <table data-testid="portfolio-table" className="w-full min-w-[900px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                    <th className="px-3 py-2 font-medium">{t('common.symbol')}</th>
                    <th className="px-3 py-2 font-medium">{t('portfolio.quantity')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('portfolio.avgCost')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('detail.lastPrice')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('portfolio.value')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('portfolio.pnl')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('portfolio.weight')}</th>
                    <th className="w-[40px] px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const live = snapshots[p.instrument.id] ?? p.quote;
                    return (
                      <tr key={p.id} className="border-b border-line-faint last:border-b-0 hover:bg-surface-alt">
                        <td className="px-3 py-[6px]">
                          <Link href={stockHref(p.instrument)} className="num font-medium text-ink no-underline hover:text-accent">
                            {p.instrument.displaySymbol}
                          </Link>
                          <p className="max-w-[180px] truncate text-[10.5px] text-ink-faint">{displayName(p.instrument, locale)}</p>
                        </td>
                        <td className="num px-3 py-[6px] text-ink-secondary">
                          {formatValue(p.quantity, locale, p.quantity % 1 === 0 ? 0 : 2)}
                          <span className="ml-1 text-[10px] text-ink-faint">{p.currency}</span>
                        </td>
                        <td className="num px-3 py-[6px] text-right text-ink-secondary">{formatValue(p.averageCost, locale, 2)}</td>
                        <td className="px-3 py-[6px] text-right">
                          <PriceText snapshot={live ?? undefined} />
                          <p className="text-[10px] text-ink-faint">{p.currency !== p.instrument.currency ? '≠ trading currency' : ''}</p>
                        </td>
                        <td className="num px-3 py-[6px] text-right text-ink">
                          {p.marketValue === null ? <span className="text-ink-faint">{t('common.unavailable')}</span> : `${currencySymbol(data.valuationCurrency)}${formatValue(p.marketValue, locale, 2)}`}
                        </td>
                        <td className="px-3 py-[6px] text-right">
                          {p.unrealizedPnl === null ? (
                            <span className="text-ink-faint">—</span>
                          ) : (
                            <span className={p.unrealizedPnl >= 0 ? 'num text-[var(--t-up)]' : 'num text-[var(--t-down)]'}>
                              {formatChange(p.unrealizedPnl, locale, 2)}
                              <span className="ml-1 text-[10.5px] opacity-80">{p.unrealizedPnlPercent === null ? '' : formatPercent(p.unrealizedPnlPercent, locale)}</span>
                            </span>
                          )}
                        </td>
                        <td className="num px-3 py-[6px] text-right text-ink-muted">{p.weight === null ? '—' : `${p.weight.toFixed(1)}%`}</td>
                        <td className="px-2 py-[6px]">
                          <button
                            type="button"
                            title={t('portfolio.remove')}
                            aria-label={t('portfolio.remove')}
                            onClick={async () => {
                              await api.portfolio.post({ op: 'remove', id: p.id });
                              load.reload();
                            }}
                            className="rounded-[2px] p-1 text-ink-faint hover:text-[var(--t-down)]"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Block>

          <div className="grid gap-3 md:grid-cols-3">
            <Distribution title={t('portfolio.byCountry')} rows={data.byCountry.map((d) => ({ label: marketName(locale, d.market), value: d.value, weight: d.weight }))} currency={data.valuationCurrency} locale={locale} />
            <Distribution title={t('portfolio.bySector')} rows={data.bySector.map((d) => ({ label: d.sector, value: d.value, weight: d.weight }))} currency={data.valuationCurrency} locale={locale} />
            <Distribution title={t('portfolio.byCurrency')} rows={data.byCurrency.map((d) => ({ label: d.currency, value: d.value, weight: d.weight }))} currency={data.valuationCurrency} locale={locale} />
          </div>
        </>
      ) : null}

      <AddHolding open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => load.reload()} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={() => load.reload()} t={t} />
    </Page>
  );
}

function Metric({ label, value, note, tone = 'flat' }: { label: string; value: string; note?: string | null; tone?: 'up' | 'down' | 'flat' | 'warn' }) {
  const color = tone === 'up' ? 'text-[var(--t-up)]' : tone === 'down' ? 'text-[var(--t-down)]' : tone === 'warn' ? 'text-[var(--t-warn)]' : 'text-ink';
  return (
    <div className="rounded-[var(--t-radius)] border border-line bg-surface px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">{label}</p>
      <p className={`num mt-1 text-[19px] font-medium tracking-[-0.01em] ${color}`}>{value}</p>
      {note ? <p className="mt-0.5 text-[10.5px] leading-snug text-ink-muted">{note}</p> : null}
    </div>
  );
}

function Distribution({
  title,
  rows,
  currency,
  locale,
}: {
  title: string;
  rows: { label: string; value: number; weight: number }[];
  currency: string;
  locale: 'en' | 'zh';
}) {
  if (!rows.length) return null;
  return (
    <Block title={title}>
      <div className="px-3 py-2">
        {rows.map((row) => (
          <div key={row.label} className="mb-1.5 last:mb-0">
            <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
              <span className="truncate text-ink-secondary">{row.label}</span>
              <span className="num text-ink-faint">{row.weight.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-surface-inset">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(1, row.weight))}%`, opacity: 0.75 }} />
            </div>
            <p className="num mt-0.5 text-[10px] text-ink-faint">
              {currencySymbol(currency as never)}
              {formatValue(row.value, locale, 0)}
            </p>
          </div>
        ))}
      </div>
    </Block>
  );
}

function AddHolding({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t, locale } = useI18n();
  const [pickOpen, setPickOpen] = useState(false);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('100');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const instrument = instrumentId ? resolveInstrument(instrumentId) : null;

  useEffect(() => {
    // Synchronize the currency field with the selected instrument from the quote store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (instrument?.currency) setCurrency(instrument.currency);
  }, [instrument?.currency]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('portfolio.addHolding')}
        footer={
          <>
            <Button size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!instrumentId || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const res = await api.portfolio.post({
                  op: 'add',
                  instrumentId,
                  quantity: Number(quantity),
                  averageCost: Number(cost),
                  currency,
                  purchasedAt: date,
                });
                setBusy(false);
                if (res.error) setError(res.error);
                else {
                  onSaved();
                  onClose();
                  setInstrumentId(null);
                  setCost('');
                }
              }}
            >
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('common.symbol')}>
            <div className="flex items-center gap-2">
              <input readOnly value={instrument?.displaySymbol ?? ''} placeholder="—" className="h-[30px] flex-1 rounded-[var(--t-radius-sm)] border border-line bg-surface-inset px-2 text-[12.5px] text-ink" />
              <Button size="sm" onClick={() => setPickOpen(true)} aria-label={t('search.title')}>
                {t('search.title')}
              </Button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('portfolio.quantity')}>
              <input data-field="quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className="num h-[30px] rounded-[var(--t-radius-sm)] border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent" />
            </Field>
            <Field label={t('portfolio.avgCost')}>
              <input data-field="averageCost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="num h-[30px] rounded-[var(--t-radius-sm)] border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent" />
            </Field>
            <Field label={t('portfolio.currency')}>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className="h-[30px] rounded-[var(--t-radius-sm)] border border-line bg-surface px-1.5 text-[12.5px]">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label={t('portfolio.purchaseDate')}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num h-[30px] rounded-[var(--t-radius-sm)] border border-line bg-surface px-2 text-[12.5px]" />
            </Field>
          </div>
          {error ? <p className="text-[11.5px] text-[var(--t-down)]">{error}</p> : null}
          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            {locale === 'zh'
              ? '市值按交易货币计价后按上方标注的汇率换算；无法换算的持仓不会计入合计。'
              : 'Positions are valued in their trading currency and converted with the FX rate printed beside the totals; anything that cannot convert is excluded rather than guessed.'}
          </p>
        </div>
      </Modal>
      <Picker open={pickOpen} onClose={() => setPickOpen(false)} onPick={(id) => { setInstrumentId(id); setPickOpen(false); }} />
    </>
  );
}

function ExportButton() {
  const { t } = useI18n();
  return (
    <Button
      size="sm"
      onClick={async () => {
        const res = await api.portfolio.post({ op: 'export' });
        if (!res.data) return;
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tomtrader-portfolio-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download size={12} /> {t('portfolio.export')}
    </Button>
  );
}

function ImportDialog({ open, onClose, onDone, t }: { open: boolean; onClose: () => void; onDone: () => void; t: (k: never, v?: Record<string, string | number>) => string }) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('portfolio.import' as never)}
      footer={
        <>
          <Button size="sm" onClick={onClose}>{t('common.cancel' as never)}</Button>
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              let parsed: { holdings?: unknown[] };
              try {
                parsed = JSON.parse(text);
              } catch {
                setMessage('invalid JSON');
                return;
              }
              const holdings = Array.isArray(parsed.holdings) ? parsed.holdings : [];
              if (!holdings.length) {
                setMessage('no holdings array');
                return;
              }
              const res = await api.portfolio.post({ op: 'import', holdings });
              setMessage(res.error ?? t('portfolio.imported' as never, { n: holdings.length }));
              if (!res.error) {
                onDone();
                onClose();
                setText('');
              }
            }}
          >
            {t('common.save' as never)}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder='{ "holdings": [ { "instrumentId": "equity:US:AAPL", "quantity": 100, "averageCost": 180.5, "currency": "USD", "purchasedAt": "2026-01-15" } ] }'
        className="num w-full rounded-[var(--t-radius-sm)] border border-line bg-surface p-2 font-mono text-[11px] outline-none focus:border-accent"
      />
      {message ? <p className="mt-1 text-[11.5px] text-[var(--t-warn)]">{message}</p> : null}
    </Modal>
  );
}
