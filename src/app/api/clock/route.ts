import { CLOCK_EXCHANGES } from '@/server/exchanges';
import { buildClock } from '@/server/service';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded(async () => ({ rows: buildClock(Date.now(), CLOCK_EXCHANGES), generatedAt: Date.now() }), 'clock');
}
