import { createRequire } from 'node:module';
import path from 'node:path';
import { dbPath,recentProviderEvents } from '@/server/db';
import { CALENDAR_VERSION } from '@/server/holidays';
import { hubState } from '@/server/realtime';
import { diagnostics } from '@/server/service';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

/** Data-source panel: what is connected, what is cooling down, what it costs us. */
export async function GET() {
  return guarded(
    () =>
      Promise.resolve({
        ...diagnostics(),
        hub: hubState(),
        calendarVersion: CALENDAR_VERSION,
        runtime: { pid: process.pid, node: process.versions.node, sqlite: process.versions.sqlite ?? 'builtin', desktop: Boolean(process.env.TOMTRADER_DESKTOP_TOKEN),
          cwd: process.cwd(), nextModule: createRequire(path.join(process.cwd(), 'package.json')).resolve('next') },
        configuration: { finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY), publicFeedsEnabled: process.env.TOMTRADER_PUBLIC_FEEDS === '1' },
        dbPath: dbPath(),
        recentEvents: recentProviderEvents(40),
        generatedAt: Date.now(),
      }),
    'status',
  );
}
