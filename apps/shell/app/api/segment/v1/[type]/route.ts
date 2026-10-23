import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { eventsDir } from '@poc/warehouse/paths';
import { CORS_HEADERS, preflight } from '../../../_cors';

/**
 * Local, Segment-compatible tracking API (the subset analytics-next uses):
 *   POST /api/segment/v1/b          batch  { batch: [...], sentAt }
 *   POST /api/segment/v1/{t,p,i,g}  single message
 * Messages are appended untouched (plus receivedAt) as NDJSON — the same raw shape
 * Segment would archive to S3 / load into Snowflake.
 */
const SINGLE: Record<string, string> = { t: 'track', p: 'page', i: 'identify', g: 'group', a: 'alias', s: 'screen' };
const SPEC_TYPES = new Set(Object.values(SINGLE));

export const OPTIONS = preflight;

export async function POST(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  let body: Record<string, unknown>;
  try {
    // analytics-next sends JSON as text/plain to avoid CORS preflights.
    body = JSON.parse(await req.text());
  } catch {
    return Response.json({ success: false, error: 'invalid json' }, { status: 400, headers: CORS_HEADERS });
  }

  const receivedAt = new Date().toISOString();
  const messages: Record<string, unknown>[] =
    type === 'b' || type === 'batch'
      ? Array.isArray(body.batch)
        ? (body.batch as Record<string, unknown>[])
        : []
      : [{ type: SINGLE[type] ?? type, ...body }];

  const lines: string[] = [];
  for (const m of messages) {
    // Only Segment Spec calls; analytics-next also posts its own SDK metrics (`/m`), which aren't agent data.
    if (!m || typeof m !== 'object' || typeof m.type !== 'string' || !SPEC_TYPES.has(m.type)) continue;
    const { writeKey: _w, ...rest } = m;
    lines.push(JSON.stringify({ ...rest, sentAt: body.sentAt ?? rest.sentAt ?? null, receivedAt }));
  }
  if (lines.length) {
    const dir = eventsDir();
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, `${receivedAt.slice(0, 10)}.ndjson`), lines.join('\n') + '\n');
  }
  return Response.json({ success: true, accepted: lines.length }, { headers: CORS_HEADERS });
}
