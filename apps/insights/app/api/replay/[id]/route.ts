import { readReplay } from '@poc/warehouse';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json(await readReplay(id));
}
