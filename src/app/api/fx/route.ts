import { fx } from '@/server/service';
import { guarded } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded(() => fx(), 'fx');
}
