import { redact } from '@/server/redact';
import { ensureBoot } from '@/server/boot';
import { NextResponse } from 'next/server';

export const NO_STORE = {
  'cache-control': 'no-store, max-age=0',
} as const;

export function json(data: unknown, init?: ResponseInit): NextResponse {
  ensureBoot();
  return NextResponse.json(data === undefined ? { ok: true } : data, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

export function fail(message: string, status = 500): NextResponse {
  return json({ error: message }, { status });
}

export function listParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 400);
}

export function idsFromRequest(req: Request, params: URLSearchParams): Promise<string[]> {
  const fromQuery = listParam(params.get('ids'));
  if (fromQuery.length) return Promise.resolve(fromQuery);
  return req
    .json()
    .then((body: unknown) => {
      const ids = (body as { ids?: unknown })?.ids;
      return Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))].slice(0, 400) : [];
    })
    .catch(() => [] as string[]);
}

/** A route that throws must still answer with something the client understands. */
export async function guarded<T>(fn: () => Promise<T>, label: string): Promise<NextResponse> {
  try {
    ensureBoot();
    return json(await fn());
  } catch (e) {
    const message = redact((e as Error)?.message ?? e);
    return json(
      {
        error: message,
        label,
        generatedAt: Date.now(),
      },
      { status: 500 },
    );
  }
}

/** This single-user local service accepts browser mutations only from its own origin. */
export function mutationAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  const url = new URL(req.url);
  // Next normalizes the handler URL's hostname; Host preserves the browser-facing origin.
  const expected = `${url.protocol}//${req.headers.get('host') ?? url.host}`;
  return !origin || origin === expected;
}
