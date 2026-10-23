/**
 * Builds the SQL models over the collected events and prints a quick report.
 *   pnpm models            → summary
 *   pnpm models --export   → also writes every model to .data/marts/*.parquet (ready for COPY INTO Snowflake)
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { dataDir, query, warehouse } from './index.ts';

const MODELS = ['stg_events', 'dim_agents', 'element_exposure', 'investigations', 'feature_usage', 'element_stats', 'click_points', 'scroll_reach', 'copy_stats', 'away_episodes', 'friction', 'agent_summary'];

const conn = await warehouse();
console.log('\nModel row counts');
for (const m of MODELS) {
  const [r] = await query(`SELECT count(*) AS n FROM ${m}`);
  console.log(`  ${m.padEnd(18)} ${r.n}`);
}

console.log('\nInvestigations (latest 10)');
console.table(
  await query(`SELECT order_id, agent_id, entry_point, inferred_problem, ticket_problem, round(engaged_ms/1000,1) AS engaged_s, round(away_ms/1000,1) AS away_s, copies, friction_signals
               FROM investigations ORDER BY started_at DESC LIMIT 10`),
);
console.log('Feature usage');
console.table(await query(`SELECT feature, investigations, pct_investigations FROM feature_usage`));

if (process.argv.includes('--export')) {
  const out = path.join(dataDir(), 'marts');
  await mkdir(out, { recursive: true });
  for (const m of MODELS) await conn.run(`COPY ${m} TO '${path.join(out, `${m}.parquet`).replaceAll("'", "''")}' (FORMAT parquet)`);
  console.log(`\nExported ${MODELS.length} models to ${out}`);
}
