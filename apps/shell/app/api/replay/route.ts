import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { replayDir } from '@poc/warehouse/paths';
import { CORS_HEADERS, preflight } from '../_cors';

/** Stand-in for New Relic Session Replay ingestion: rrweb chunks appended per replay id. */
export const OPTIONS = preflight;

const ID = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request) {
  let body: { replay_id?: string; session_id?: string; tab_id?: string; zone?: string; chunk_seq?: number; events?: { timestamp?: number }[] };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return Response.json({ success: false }, { status: 400, headers: CORS_HEADERS });
  }
  if (!body.replay_id || !ID.test(body.replay_id) || !Array.isArray(body.events)) {
    return Response.json({ success: false, error: 'bad replay chunk' }, { status: 400, headers: CORS_HEADERS });
  }
  const dir = replayDir();
  await mkdir(dir, { recursive: true });
  const receivedAt = new Date().toISOString();
  await appendFile(path.join(dir, `${body.replay_id}.ndjson`), JSON.stringify({ chunk_seq: body.chunk_seq ?? 0, events: body.events }) + '\n');
  if ((body.chunk_seq ?? 0) === 0) {
    const first = body.events[0]?.timestamp;
    await appendFile(
      path.join(dir, '_index.ndjson'),
      JSON.stringify({
        replay_id: body.replay_id,
        session_id: body.session_id ?? null,
        tab_id: body.tab_id ?? null,
        zone: body.zone ?? null,
        started_at: first ? new Date(first).toISOString() : receivedAt,
        received_at: receivedAt,
      }) + '\n',
    );
  }
  return Response.json({ success: true }, { headers: CORS_HEADERS });
}
