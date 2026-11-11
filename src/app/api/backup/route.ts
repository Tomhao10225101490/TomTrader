import { snapshotDatabase } from '@/server/db';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mutationAllowed } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!mutationAllowed(request)) return new Response(null, { status: 403 });
  const destination = path.join(os.tmpdir(), `tomtrader-backup-${randomUUID()}.db`);
  try {
    snapshotDatabase(destination);
    const data = await readFile(destination);
    return new Response(data, { headers: {
      'content-type': 'application/octet-stream', 'cache-control': 'no-store',
      'content-disposition': 'attachment; filename="TomTrader-backup.db"',
    } });
  } catch {
    return Response.json({ error: 'Backup failed. The original database was not modified.' }, { status: 500 });
  } finally { await rm(destination, { force: true }); }
}
