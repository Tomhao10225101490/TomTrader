import { getNews } from '@/server/service';
import type { NextRequest } from 'next/server';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 30);
  return guarded(async () => ({ ...(await getNews(id, limit)), generatedAt: Date.now() }), 'news');
}
