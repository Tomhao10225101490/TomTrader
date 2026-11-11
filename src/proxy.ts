import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** Desktop-only gate, including GETs, SSE and static resources. Web mode is unchanged. */
export function proxy(request: NextRequest) {
  const expected = process.env.TOMTRADER_DESKTOP_TOKEN;
  if (expected) {
    const received = request.headers.get('x-tomtrader-token') ?? '';
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return new NextResponse('Desktop session required', {
        status: 401,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain', 'x-content-type-options': 'nosniff' },
      });
    }
    const origin = request.headers.get('origin');
    // A valid token alone must not make cross-site browser requests acceptable.
    if (origin && origin !== `http://127.0.0.1:${process.env.PORT}`) {
      return new NextResponse('Invalid origin', { status: 403 });
    }
  }
  return NextResponse.next();
}
