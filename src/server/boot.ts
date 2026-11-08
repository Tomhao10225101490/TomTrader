import { pruneOldSnapshots } from './cache';
import { getDb } from './db';
import { ALL_INDEX_IDS } from './instruments';
import { registerAlertInstruments,registerAlertSource } from './realtime';
import { listAlerts,listGroups,markAlertFired,rearmAlert } from './userdata';

/**
 * One-time process setup, safe to call from any route handler.
 *
 * Next's dev server can evaluate a module several times across hot reloads, so
 * every registration here is idempotent and the "already done" flag lives on
 * globalThis rather than in module scope.
 */

const g = globalThis as unknown as { __ttBooted?: boolean };

export function ensureBoot(): void {
  if (g.__ttBooted) return;
  g.__ttBooted = true;

  getDb();
  listGroups(); // seeds the default watchlists on a first run
  pruneOldSnapshots(30);

  registerAlertInstruments(listAlerts().filter((a) => a.enabled).map((a) => a.instrumentId));

  registerAlertSource(
    async () => listAlerts(),
    async (alert, snap, detail, price) => {
      markAlertFired(alert.id, { instrumentId: snap.instrument.id }, detail, price);
    },
    (alertId) => rearmAlert(alertId),
  );

  // Sparkline pre-warm, in the background. The shared HTTP limiter paces it, so
  // a cold start still answers the first screen immediately from cache.
  void import('./service').then(({ ensureSparklines }) => ensureSparklines(ALL_INDEX_IDS));
}
