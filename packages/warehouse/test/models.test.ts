import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/** Builds Segment-shaped messages exactly like the collector stores them. */
function fixture() {
  const t0 = Date.parse('2026-10-20T14:00:00Z');
  let seq = 0;
  let id = 0;
  const lines: object[] = [];
  const msg = (type: 'track' | 'page', name: string, ms: number, ctx: Record<string, unknown>, props: Record<string, unknown> = {}) => {
    seq += 1;
    lines.push({
      type,
      ...(type === 'track' ? { event: name } : { name }),
      messageId: `m-${++id}`,
      userId: ctx.agent,
      anonymousId: 'anon',
      timestamp: new Date(t0 + ms).toISOString(),
      receivedAt: new Date(t0 + ms + 500).toISOString(),
      properties: {
        session_id: 's1', tab_id: 't1', page_view_id: ctx.pv, replay_id: ctx.pv, zone: 'orders', page_type: 'order_detail',
        investigation_id: ctx.inv, order_id: ctx.order, ticket_id: ctx.ticket ?? null, entry_point: 'helpdesk', seq, ...props,
      },
      context: { page: { path: `/orders/${ctx.order}` } },
    });
  };

  // Investigation A: WISMO from a helpdesk ticket — copies the tracking number, leaves for 40s, returns.
  const a = { agent: 'agt_a', inv: 'inv-a', pv: 'pv-a', order: 'ORD-1', ticket: 'T-1' };
  msg('page', 'order_detail', 0, a);
  msg('track', 'Investigation Started', 1, a, { ticket_reason: 'wismo', entry_point_order: 'helpdesk', order_status: 'shipped' });
  msg('track', 'Element Clicked', 5_000, a, { element_id: 'copy.tracking_number', x_rel: 0.5, y_rel: 0.5, is_interactive: true });
  msg('track', 'Content Copied', 5_010, a, { element_id: 'copy.tracking_number', field: 'tracking_number', method: 'button', detected_type: 'tracking_number' });
  msg('track', 'Page Left', 6_000, a, { leave_type: 'tab_hidden', last_action: 'Content Copied', last_copy_field: 'tracking_number', ms_since_last_copy: 990 });
  msg('track', 'Engagement Time Recorded', 6_001, a, { engaged_ms: 6_000, visible_ms: 6_000, hidden_ms: 0, blurred_ms: 0, idle_ms: 0, scroll_max_pct: 80 });
  msg('track', 'Element Exposure Recorded', 6_002, a, {
    elements: [
      { element_id: 'line_item.eta', element_key: 'li_1', visible_ms: 4_000, hover_ms: 0, max_ratio: 1, viewed: true },
      { element_id: 'line_item.eta', element_key: 'li_2', visible_ms: 2_000, hover_ms: 0, max_ratio: 1, viewed: true },
    ],
  });
  msg('track', 'Page Returned', 46_000, a, { away_type: 'tab_hidden', away_ms: 40_000, left_after_copy: true, last_copy_field: 'tracking_number' });
  msg('track', 'Scroll Depth Reached', 47_000, a, { container: 'page', depth_pct: 50 });
  msg('track', 'Engagement Time Recorded', 50_000, a, { engaged_ms: 4_000, visible_ms: 4_000, hidden_ms: 40_000, blurred_ms: 0, idle_ms: 0 });
  // Segment retry: same messageId delivered twice must be counted once.
  lines.push({ ...(lines[3] as object) });

  // Investigation B: no ticket, struggles — dead clicks, rage, Ctrl+F, opens the artwork.
  const b = { agent: 'agt_b', inv: 'inv-b', pv: 'pv-b', order: 'ORD-2' };
  msg('page', 'order_detail', 100_000, b);
  msg('track', 'Investigation Started', 100_001, b, { ticket_reason: null, entry_point_order: 'queue', order_status: 'artwork_review' });
  msg('track', 'Dead Click Detected', 101_000, b, { element_id: 'line_item.tracking_number', kind: 'non_interactive' });
  msg('track', 'Rage Click Detected', 101_500, b, { element_id: 'line_item.tracking_number', click_count: 4 });
  msg('track', 'Find In Page Used', 102_000, b, {});
  msg('track', 'Artwork Preview Opened', 103_000, b, { element_id: 'line_item.artwork', line_item_id: 'li_9' });

  lines.push({ type: 'identify', userId: 'agt_a', messageId: 'id-1', timestamp: new Date(t0).toISOString(), traits: { name: 'Agent A', team: 'tier1', tenure_months: 3 } });
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

let w: typeof import('../src/index.ts');

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'poc-wh-'));
  mkdirSync(path.join(dir, 'events'));
  writeFileSync(path.join(dir, 'events', '2026-10-20.ndjson'), fixture());
  process.env.POC_DATA_DIR = dir;
  w = await import('../src/index.ts');
});

describe('warehouse models', () => {
  it('builds one row per investigation with time, away and friction', async () => {
    const rows = await w.query(`SELECT * FROM investigations ORDER BY investigation_id`);
    expect(rows).toHaveLength(2);
    const [a, b] = rows;
    expect(a).toMatchObject({
      order_id: 'ORD-1', agent_id: 'agt_a', entry_point: 'helpdesk', ticket_reason: 'wismo',
      engaged_ms: 10_000, hidden_ms: 40_000, away_ms: 40_000, copies: 1, leaves: 1,
      copied_tracking: true, copy_then_leave: true, friction_signals: 0,
      inferred_problem: 'where_is_my_order', ticket_problem: 'where_is_my_order',
    });
    expect(b).toMatchObject({ order_id: 'ORD-2', rage_clicks: 1, dead_clicks: 1, find_in_page: 1, friction_signals: 3, inferred_problem: 'artwork_issue', ticket_problem: null });
  });

  it('deduplicates Segment retries by messageId', async () => {
    const [r] = await w.query(`SELECT count(*) AS n FROM stg_events WHERE event = 'Content Copied'`);
    expect(r.n).toBe(1);
  });

  it('measures copy → leave', async () => {
    const [c] = await w.copyStats();
    expect(c).toMatchObject({ field: 'tracking_number', copies: 1, left_within_15s: 1, pct_left_within_15s: 100, median_away_ms_after: 40_000 });
  });

  it('averages repeated elements per instance', async () => {
    const eta = (await w.elementStats('order_detail')).find((s) => s.element_id === 'line_item.eta')!;
    // (4000 + 2000) / 2 instances / 2 page views
    expect(eta.avg_visible_ms_per_pv).toBe(1_500);
    expect(eta.view_rate_pct).toBe(50);
  });

  it('scores inference against ticket ground truth', async () => {
    const [acc] = await w.inferenceAccuracy();
    expect(acc).toMatchObject({ labelled: 1, matched: 1, pct: 100 });
  });

  it('picks up agent traits from identify calls', async () => {
    const agents = await w.agents();
    expect(agents.find((a) => a.agent_id === 'agt_a')).toMatchObject({ agent_name: 'Agent A', team: 'tier1', investigations: 1 });
  });
});
