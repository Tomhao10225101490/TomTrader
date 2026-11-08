'use client';
import { resolveInstrument,stockHrefFromId } from '@/lib/clientInstruments';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n-context';
import { useLive } from '@/stores/live';
import { Bell,CheckCircle2,Info,X } from 'lucide-react';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';

interface Toast {
  id: string;
  kind: 'alert' | 'info' | 'success';
  title: string;
  body?: string;
  href?: string;
}

/**
 * In-app notification surface. Alert frames from the stream become toasts; the
 * system notification is a separate, opt-in path that only fires while the app
 * is running (which is stated in the Alerts page, not pretended here).
 */
export function Toasts() {
  const alerts = useLive((s) => s.alerts);
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!alerts.length) return;
    for (const a of alerts) {
      const instrument = resolveInstrument(a.instrumentId);
      const key = `${a.alertId}:${a.price}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      setToasts((prev) => [
        ...prev.slice(-4),
        {
          id: key,
          kind: 'alert',
          title: instrument ? `${instrument.displaySymbol} · ${instrument.name}` : a.name,
          body: a.detail,
          href: instrument ? stockHrefFromId(instrument.id) : undefined,
        },
      ]);
    }
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 9000);
    return () => clearTimeout(timer);
  }, [alerts]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 8000);
    return () => clearTimeout(timer);
  }, [toasts]);

  void t;
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[300px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-[var(--t-radius)] border bg-elevated px-3 py-2 shadow-[0_10px_26px_-18px_rgba(0,0,0,0.6)]',
            toast.kind === 'alert' ? 'border-[var(--t-warn)]/45' : 'border-line',
          )}
          role="status"
        >
          <span className="mt-[1px] shrink-0">
            {toast.kind === 'alert' ? <Bell size={14} className="text-[var(--t-warn)]" /> : toast.kind === 'success' ? <CheckCircle2 size={14} className="text-[var(--t-up)]" /> : <Info size={14} className="text-ink-muted" />}
          </span>
          <div className="min-w-0 flex-1">
            {toast.href ? (
              <Link href={toast.href} className="block truncate text-[12px] font-medium text-ink no-underline hover:text-accent">
                {toast.title}
              </Link>
            ) : (
              <p className="truncate text-[12px] font-medium text-ink">{toast.title}</p>
            )}
            {toast.body ? <p className="num mt-0.5 text-[11px] leading-snug text-ink-muted">{toast.body}</p> : null}
          </div>
          <button type="button" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))} className="shrink-0 text-ink-faint hover:text-ink" aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
