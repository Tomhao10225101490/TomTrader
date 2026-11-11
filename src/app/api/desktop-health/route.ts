export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Startup handshake only; this is not authentication for the application's API. */
export function GET(request: Request) {
  const token = process.env.TOMTRADER_DESKTOP_TOKEN;
  if (!token || request.headers.get('x-tomtrader-token') !== token) {
    return new Response(null, { status: 404 });
  }
  return Response.json({ pid: process.pid, node: process.versions.node, sqlite: process.versions.sqlite ?? 'builtin' }, { headers: { 'cache-control': 'no-store' } });
}
