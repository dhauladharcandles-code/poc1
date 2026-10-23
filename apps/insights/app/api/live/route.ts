import { recentEvents } from '@poc/warehouse';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await recentEvents(150));
}
