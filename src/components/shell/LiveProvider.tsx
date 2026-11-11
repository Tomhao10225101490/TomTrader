'use client';
import { useLive } from '@/stores/live';
import { usePrefs } from '@/stores/prefs';
import { useEffect,type ReactNode } from 'react';

/** Starts the single app-wide stream and keeps it aligned with the policy. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const policy = usePrefs((s) => s.refreshPolicy);
  const init = useLive((s) => s.init);
  const setPolicy = useLive((s) => s.setRefreshPolicy);

  useEffect(() => {
    setPolicy(policy);
    init();
  }, [policy, init, setPolicy]);

  useEffect(() => {
    // A window resize that crosses a breakpoint must not change behaviour, but
    // the grid template does — CSS custom property is enough, no JS state.
    const onResize = () => document.documentElement.style.setProperty('--tt-viewport', String(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return <>{children}</>;
}
