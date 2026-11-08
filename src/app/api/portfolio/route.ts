import { buildPortfolio } from '@/server/portfolio';
import { resolveInstrument } from '@/server/service';
import type { CurrencyCode } from '@/server/types';
import { addHolding,exportUserData,removeHolding,updateHolding } from '@/server/userdata';
import type { NextRequest } from 'next/server';
import { fail,guarded,mutationAllowed } from '../_lib';

export const dynamic = 'force-dynamic';

const CURRENCIES = new Set<string>(['USD', 'CNY', 'HKD', 'JPY', 'EUR', 'GBP', 'KRW', 'TWD', 'INR', 'AUD', 'BRL']);

export async function GET(req: NextRequest) {
  const valuation = (req.nextUrl.searchParams.get('currency') ?? 'USD') as CurrencyCode;
  if (!CURRENCIES.has(valuation)) return fail('unsupported valuation currency', 400);
  return guarded(() => buildPortfolio({ valuationCurrency: valuation }), 'portfolio');
}

type Body = {
  op?: string;
  id?: string;
  instrumentId?: string;
  quantity?: number;
  averageCost?: number;
  currency?: string;
  purchasedAt?: string;
  note?: string;
  holdings?: unknown[];
};

export async function POST(req: NextRequest) {
  if (!mutationAllowed(req)) return fail('Cross-origin mutations are not allowed', 403);
  const raw: unknown = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Expected a JSON object', 400);
  const body = raw as Body;
  for (const key of ['op', 'id', 'instrumentId', 'groupId', 'name', 'currency', 'purchasedAt', 'note'] as const) {
    if (key in raw && typeof (raw as Record<string, unknown>)[key] !== 'string') return fail(`${key} must be a string`, 400);
  }
  const problem = validate(body);
  if (problem) return fail(problem, 400);

  switch (body.op) {
    case 'add':
      return guarded(
        () =>
          Promise.resolve(
            addHolding({
              instrumentId: body.instrumentId!,
              quantity: Number(body.quantity),
              averageCost: Number(body.averageCost),
              currency: body.currency as string,
              purchasedAt: body.purchasedAt!,
              note: body.note,
            }),
          ),
        'portfolio',
      );
    case 'update':
      if (!body.id) return fail('id required', 400);
      return guarded(() => Promise.resolve(updateHolding(body.id!, body)), 'portfolio');
    case 'remove':
      if (!body.id) return fail('id required', 400);
      return guarded(() => Promise.resolve(removeHolding(body.id!)), 'portfolio');
    case 'import': {
      const rows = (body.holdings ?? []) as Body[];
      return guarded(
        () =>
          Promise.resolve(
            rows.map((row) =>
              addHolding({
                instrumentId: row.instrumentId!,
                quantity: Number(row.quantity),
                averageCost: Number(row.averageCost),
                currency: row.currency ?? 'USD',
                purchasedAt: row.purchasedAt ?? new Date().toISOString().slice(0, 10),
                note: row.note,
              }),
            ),
          ),
        'portfolio',
      );
    }
    case 'export':
      return guarded(() => Promise.resolve(exportUserData()), 'portfolio');
    default:
      return fail(`unknown op ${body.op ?? '(none)'}`, 400);
  }
}

function validate(body: Body): string | null {
  if (body.op === 'import' && (!Array.isArray(body.holdings) || body.holdings.length > 1000)) return 'holdings must be an array of at most 1000 rows';
  if (body.op === 'add' || body.op === 'import') {
    const rows = body.op === 'import' ? ((body.holdings ?? []) as Body[]) : [body];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return 'invalid holding';
      if (typeof row.instrumentId !== 'string') return 'instrumentId must be a string';
      if (!row.instrumentId || !resolveInstrument(row.instrumentId)) return `unknown instrument ${row.instrumentId ?? '(blank)'}`;
      const q = Number(row.quantity);
      const c = Number(row.averageCost);
      if (!Number.isFinite(q) || q <= 0) return 'quantity must be a positive number';
      if (!Number.isFinite(c) || c <= 0) return 'average cost must be a positive number';
      if (row.currency && row.currency !== resolveInstrument(row.instrumentId!)?.currency) return 'holding currency must match the instrument trading currency';
      if (row.currency && !CURRENCIES.has(row.currency)) return `unsupported currency ${row.currency}`;
      if (row.purchasedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(row.purchasedAt) || !Number.isFinite(Date.parse(row.purchasedAt)) || new Date(row.purchasedAt).toISOString().slice(0, 10) !== row.purchasedAt)) return 'purchase date must be YYYY-MM-DD';
    }
    return null;
  }
  if (body.op === 'update') {
    if (body.quantity !== undefined && (!Number.isFinite(Number(body.quantity)) || !(Number(body.quantity) > 0))) return 'quantity must be positive';
    if (body.averageCost !== undefined && (!Number.isFinite(Number(body.averageCost)) || Number(body.averageCost) <= 0)) return 'average cost must be positive';
    if (body.purchasedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(body.purchasedAt) || !Number.isFinite(Date.parse(body.purchasedAt)) || new Date(body.purchasedAt).toISOString().slice(0, 10) !== body.purchasedAt)) return 'invalid purchase date';
    if (body.currency && !CURRENCIES.has(body.currency)) return 'unsupported currency';
  }
  return null;
}
