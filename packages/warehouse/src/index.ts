import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { eventsDir, replayDir } from './paths.ts';

export { dataDir, eventsDir, replayDir } from './paths.ts';

/** SQL models live next to this package; resolved relative to the repo so it works under Next.js bundling too. */
function sqlDir(): string {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sql/duckdb'),
    path.resolve(process.cwd(), '../../packages/warehouse/sql/duckdb'),
    path.resolve(process.cwd(), 'packages/warehouse/sql/duckdb'),
  ];
  return candidates.find((c) => existsSync(/*turbopackIgnore: true*/ c)) ?? candidates[0];
}

export type Row = Record<string, string | number | boolean | null | Row[] | string[]>;

interface Warehouse {
  signature: string;
  conn: DuckDBConnection;
}

let current: Promise<Warehouse> | null = null;
let currentSignature = '';

async function signature(): Promise<string> {
  const dir = eventsDir();
  if (!existsSync(/*turbopackIgnore: true*/ dir)) return 'empty';
  const files = (await readdir(/*turbopackIgnore: true*/ dir)).filter((f) => f.endsWith('.ndjson')).sort();
  const parts = await Promise.all(files.map(async (f) => `${f}:${(await stat(/*turbopackIgnore: true*/ path.join(dir, f))).size}`));
  return parts.join('|') || 'empty';
}

const EMPTY_RAW = `CREATE OR REPLACE TABLE raw_events (
  messageId VARCHAR, type VARCHAR, event VARCHAR, name VARCHAR, userId VARCHAR, anonymousId VARCHAR,
  "timestamp" VARCHAR, receivedAt VARCHAR, properties JSON, context JSON, traits JSON)`;

async function build(sig: string): Promise<Warehouse> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run(`SET TimeZone = 'UTC'`);
  const files = (await readdir(/*turbopackIgnore: true*/ sqlDir())).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    let sql = await readFile(/*turbopackIgnore: true*/ path.join(sqlDir(), f), 'utf8');
    if (f.startsWith('00_')) {
      if (sig === 'empty') sql = EMPTY_RAW;
      else sql = sql.replaceAll('{{events_glob}}', path.join(eventsDir(), '*.ndjson').replaceAll("'", "''"));
    }
    await conn.run(sql);
  }
  return { signature: sig, conn };
}

/** In-memory DuckDB with all models built; rebuilt only when new events have landed. */
export async function warehouse(): Promise<DuckDBConnection> {
  const sig = await signature();
  if (!current || sig !== currentSignature) {
    currentSignature = sig;
    current = build(sig);
    current.catch(() => {
      current = null;
      currentSignature = '';
    });
  }
  return (await current).conn;
}

function normalize(v: unknown): Row[string] {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((x) => normalize(x)) as unknown as Row[];
  if (typeof v === 'object') {
    // DuckDB timestamp / decimal / json values expose toString()
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return new Date(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString();
    const n = Number(s);
    if (s.trim() !== '' && !Number.isNaN(n)) return n;
    return s;
  }
  return v as Row[string];
}

// One DuckDB connection can't run statements concurrently, so queries are queued.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export async function query<T extends Row = Row>(sql: string, params: Record<string, string | number | boolean | null> = {}): Promise<T[]> {
  const reader = await serial(async () => {
    const conn = await warehouse();
    return Object.keys(params).length ? conn.runAndReadAll(sql, params as never) : conn.runAndReadAll(sql);
  });
  return reader.getRowObjectsJS().map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) out[k] = normalize(v);
    return out as T;
  });
}

// ── Replay storage (stand-in for New Relic Session Replay) ─────────────────────────────

const ID = /^[0-9a-f-]{36}$/i;

export async function readReplay(replayId: string): Promise<unknown[]> {
  if (!ID.test(replayId)) return [];
  const file = path.join(replayDir(), `${replayId}.ndjson`);
  if (!existsSync(/*turbopackIgnore: true*/ file)) return [];
  const chunks = (await readFile(/*turbopackIgnore: true*/ file, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { chunk_seq: number; events: { timestamp: number }[] });
  return chunks
    .sort((a, b) => a.chunk_seq - b.chunk_seq)
    .flatMap((c) => c.events)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function hasReplay(replayId: string): boolean {
  return ID.test(replayId) && existsSync(/*turbopackIgnore: true*/ path.join(replayDir(), `${replayId}.ndjson`));
}

export * from './queries.ts';
