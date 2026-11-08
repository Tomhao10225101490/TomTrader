'use client';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/** Consistent page chrome: one title line, one subtitle, generous width. */
export function Page({ title, subtitle, actions, children, className, wide }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn('mx-auto flex w-full flex-col gap-4 px-4 py-4 md:px-6 md:py-5', wide ? 'max-w-[1680px]' : 'max-w-[1420px]', className)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[12px] text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Block({ title, subtitle, right, children, className, flush }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn('min-w-0 rounded-[var(--t-radius)] border border-line bg-surface', className)}>
      {title ? (
        <header className={cn('flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2', flush && 'px-0')}>
          <div>
            <h2 className="section-title">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-ink-muted">{subtitle}</p> : null}
          </div>
          {right ? <div className="flex items-center gap-2">{right}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
