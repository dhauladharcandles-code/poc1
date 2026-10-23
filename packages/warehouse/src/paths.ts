import { existsSync } from 'node:fs';
import path from 'node:path';

/** Repo root = nearest ancestor with pnpm-workspace.yaml (apps run with cwd = apps/<zone>). */
function repoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(/*turbopackIgnore: true*/ path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** Where the local collector lands data. Stand-in for Segment → S3/Snowflake and New Relic replay storage. */
export function dataDir(): string {
  return process.env.POC_DATA_DIR ?? path.join(repoRoot(), '.data');
}

export const eventsDir = () => path.join(dataDir(), 'events');
export const replayDir = () => path.join(dataDir(), 'replay');
