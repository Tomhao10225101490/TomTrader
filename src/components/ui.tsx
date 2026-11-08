'use client';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';
import {
type ButtonHTMLAttributes,
type InputHTMLAttributes,
type ReactNode,
useEffect,
useId,
useRef,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * UI primitives.
 *
 * The visual contract is deliberately narrow: hairline borders instead of
 * shadows, 3–4px radii, one accent colour reserved for focus and active state,
 * and no component that animates for its own sake. Dense financial surfaces
 * read as calm only when the chrome disappears behind the data.
 */

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'icon';

export function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--t-radius-sm)] border font-medium',
        'transition-[background-color,border-color,color] duration-100',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' && 'h-[26px] px-2 text-[12px]',
        size === 'md' && 'h-[30px] px-2.5 text-[13px]',
        size === 'icon' && 'h-[28px] w-[28px] px-0',
        variant === 'default' && 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-alt hover:text-ink',
        variant === 'primary' && 'border-accent bg-accent text-accent-ink hover:bg-[var(--t-accent-hover)] hover:border-[var(--t-accent-hover)]',
        variant === 'ghost' && 'border-transparent bg-transparent text-ink-muted hover:bg-surface-inset hover:text-ink',
        variant === 'danger' && 'border-[var(--t-down)]/40 bg-transparent text-[var(--t-down)] hover:bg-[var(--t-down-soft)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center rounded-[var(--t-radius-sm)] border border-line bg-surface-alt p-[2px]', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-[2px] font-medium transition-colors duration-100',
              size === 'sm' ? 'h-[22px] px-1.5 text-[11px]' : 'h-[25px] px-2.5 text-[12px]',
              active ? 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--t-line)]' : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">{label}</span>
      {children}
      {hint && !error ? <span className="text-[11px] leading-snug text-ink-faint">{hint}</span> : null}
      {error ? <span className="text-[11px] leading-snug text-[var(--t-down)]">{error}</span> : null}
    </label>
  );
}

export function TextInput({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      className={cn(
        'h-[30px] rounded-[var(--t-radius-sm)] border bg-surface px-2 text-[13px] text-ink',
        'placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40',
        invalid ? 'border-[var(--t-down)]' : 'border-line',
        className,
      )}
    />
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        'h-[30px] rounded-[var(--t-radius-sm)] border border-line bg-surface px-1.5 text-[13px] text-ink',
        'focus:border-accent focus:outline-none',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 460,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--t-scrim)] px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full overflow-hidden rounded-[var(--t-radius)] border border-line bg-surface shadow-[0_18px_44px_-24px_rgba(0,0,0,0.55)]"
        style={{ maxWidth: width }}
      >
        <header className="flex h-[42px] items-center justify-between border-b border-line px-3">
          <h2 id={id} className="text-[13px] font-semibold text-ink">
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={15} />
          </Button>
        </header>
        <div className="p-3">{children}</div>
        {footer ? <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-alt px-3 py-2">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-[13px] font-medium text-ink-secondary">{title}</p>
      {body ? <p className="max-w-[46ch] text-[12px] leading-relaxed text-ink-muted">{body}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title: ReactNode; body?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-[var(--t-radius-sm)] border border-[var(--t-down)]/30 bg-[var(--t-down-soft)] px-3 py-2">
      <p className="text-[12px] font-semibold text-[var(--t-down-strong)]">{title}</p>
      {body ? <p className="text-[11px] leading-relaxed text-ink-secondary">{body}</p> : null}
      {onRetry ? (
        <Button size="sm" variant="default" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-ink-muted">
      <span
        aria-hidden
        className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent"
        style={{ animationDuration: '900ms' }}
      />
      {label}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4 pb-2', className)}>
      <div className="min-w-0">
        <h2 className="section-title truncate">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-[11px] text-ink-muted">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-line bg-surface-alt px-1 py-[1px] font-mono text-[10px] leading-none text-ink-muted">
      {children}
    </kbd>
  );
}

export function StatusDot({ tone, pulse, title }: { tone: 'up' | 'down' | 'flat' | 'accent' | 'warn'; pulse?: boolean; title?: string }) {
  const color =
    tone === 'up'
      ? 'var(--t-up)'
      : tone === 'down'
        ? 'var(--t-down)'
        : tone === 'accent'
          ? 'var(--t-accent)'
          : tone === 'warn'
            ? 'var(--t-warn)'
            : 'var(--t-flat)';
  return (
    <span
      title={title}
      className={cn('led', pulse && 'pulse-dot')}
      style={{ background: color, boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 30%, transparent)` }}
    />
  );
}

/** Small informational tooltip: native title is enough and never steals focus. */
export function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span title={text} className="cursor-help underline decoration-dotted decoration-line-strong underline-offset-2">
      {children}
    </span>
  );
}
