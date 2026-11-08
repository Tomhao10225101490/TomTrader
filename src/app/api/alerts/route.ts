import { resolveInstrument } from '@/server/service';
import type { PriceAlert } from '@/server/types';
import { createAlert,deleteAlert,listAlertEvents,listAlerts,setAlertEnabled,updateAlert } from '@/server/userdata';
import type { NextRequest } from 'next/server';
import { fail,guarded,mutationAllowed } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded(() => Promise.resolve({ alerts: listAlerts(), events: listAlertEvents(40) }), 'alerts');
}

type Body = {
  op?: string;
  id?: string;
  instrumentId?: string;
  condition?: PriceAlert['condition'];
  cooldownMinutes?: number;
  enabled?: boolean;
};

export async function POST(req: NextRequest) {
  if (!mutationAllowed(req)) return fail('Cross-origin mutations are not allowed', 403);
  const raw: unknown = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Expected a JSON object', 400);
  const body = raw as Body;
  for (const key of ['op', 'id', 'instrumentId', 'groupId', 'name', 'currency', 'purchasedAt', 'note'] as const) {
    if (key in raw && typeof (raw as Record<string, unknown>)[key] !== 'string') return fail(`${key} must be a string`, 400);
  }
  if (body.condition !== undefined) { const problem = checkCondition(body.condition); if (problem) return fail(problem, 400); }
  if (body.cooldownMinutes !== undefined && (!Number.isFinite(body.cooldownMinutes) || body.cooldownMinutes < 0 || body.cooldownMinutes > 1440)) return fail('cooldown must be between 0 and 1440 minutes', 400);
  switch (body.op) {
    case 'create': {
      if (!body.instrumentId || !body.condition) return fail('instrumentId and condition required', 400);
      if (!resolveInstrument(body.instrumentId)) return fail('unknown instrument', 404);
      const problem = checkCondition(body.condition);
      if (problem) return fail(problem, 400);
      if (body.cooldownMinutes !== undefined && (body.cooldownMinutes < 0 || body.cooldownMinutes > 1440)) {
        return fail('cooldown must be between 0 and 1440 minutes', 400);
      }
      return guarded(
        () =>
          Promise.resolve(
            createAlert({
              instrumentId: body.instrumentId!,
              condition: body.condition!,
              cooldownMinutes: body.cooldownMinutes,
            }),
          ),
        'alerts',
      );
    }
    case 'toggle':
      if (!body.id) return fail('id required', 400);
      return guarded(() => Promise.resolve(setAlertEnabled(body.id!, body.enabled !== false)), 'alerts');
    case 'update':
      if (!body.id) return fail('id required', 400);
      return guarded(
        () =>
          Promise.resolve(
            updateAlert(body.id!, {
              condition: body.condition,
              cooldownMinutes: body.cooldownMinutes,
            }),
          ),
        'alerts',
      );
    case 'delete':
      if (!body.id) return fail('id required', 400);
      return guarded(() => Promise.resolve(deleteAlert(body.id!)), 'alerts');
    default:
      return fail(`unknown op ${body.op ?? '(none)'}`, 400);
  }
}

function checkCondition(c: PriceAlert['condition'] | undefined): string | null {
  if (!c || typeof c !== 'object' || !('type' in c)) return 'condition missing';
  if (c.type === 'five-two-week-high' || c.type === 'five-two-week-low') {
    // Not silently accepted: without a fundamentals feed this condition can
    // never be evaluated honestly, so creation is refused instead of deferred.
    return '52-week conditions need a fundamentals provider that is not connected';
  }
  if (!['price-above', 'price-below', 'change-percent-above', 'change-percent-below'].includes(c.type)) return 'unknown alert condition';
  if (!Number.isFinite((c as { threshold: number }).threshold)) return 'threshold must be a number';
  return null;
}
