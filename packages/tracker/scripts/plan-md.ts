/** Regenerates docs/tracking-plan.md from src/tracking-plan.ts:  pnpm --filter @poc/tracker plan:md */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { EVENTS, type PlannedEvent } from '../src/tracking-plan.ts';

const Q: Record<string, string> = { what: 'What', how: 'How', why: 'Why', time: 'Time', pain: 'Pain', usage: 'Usage' };
const rows = (Object.values(EVENTS) as PlannedEvent[]).map(
  (e) => `| **${e.name}** | ${e.source === 'auto' ? 'automatic' : 'app code'} | ${e.questions.map((q) => Q[q]).join(', ')} | ${e.description} | ${e.props.map((p) => `\`${p}\``).join(', ') || '—'} |`,
);

const md = `# Tracking plan

<!-- Generated from packages/tracker/src/tracking-plan.ts — edit that file, then run: pnpm --filter @poc/tracker plan:md -->

Every event carries these **common properties** (so any row joins back to a session, browser tab, page view, replay and order):
\`session_id\`, \`tab_id\`, \`page_view_id\`, \`replay_id\`, \`zone\`, \`page_type\`, \`investigation_id\`, \`order_id\`, \`ticket_id\`, \`entry_point\`, \`app_version\`, \`seq\`.
The agent is the Segment \`userId\` (from \`identify\`), with \`team\` and \`tenure_months\` as traits.

**Answers** maps each event to the product questions: *What* the agent is doing, *How* they do it, *Why* (what problem they're solving),
*Time* spent, *Pain* (friction) and feature *Usage*.

| Event | Source | Answers | Why it exists | Key properties |
|---|---|---|---|---|
${rows.join('\n')}

## DOM conventions

Automatic events need no code — micro frontends opt in with attributes:

| Attribute | Meaning |
|---|---|
| \`data-track-id="line_item.eta"\` | Stable, type-level id. Used for aggregation and to anchor heatmap clicks. |
| \`data-track-key="li_10482_1"\` | Instance key (which line item / event row). |
| \`data-track-section="line_items"\` | Page section for scroll maps. |
| \`data-track-field="tracking_number"\` | Semantic field name for copy/select analytics. |
| \`data-track-hover\` | Emit \`Element Hovered\` after 800ms hover intent. |
| \`data-track-scroll="events_panel"\` | Scroll container whose depth is measured. |
| \`data-track-view-event="off"\` | Count in exposure summaries only (no per-element \`Element Viewed\`), for long lists. |
| \`data-pii\` | Masked in session replay; copied text classified only as \`pii\`. |
| \`data-track-ignore\` | Tracker and replay ignore this subtree. |
`;

writeFileSync(path.resolve(import.meta.dirname, '../../../docs/tracking-plan.md'), md);
console.log('wrote docs/tracking-plan.md');
