import { query, type Row } from './index.ts';

/** Typed reads used by the insights zone. Each maps to a model in sql/duckdb (and sql/snowflake). */

export interface Overview extends Row {
  investigations: number;
  agents: number;
  orders: number;
  events: number;
  median_engaged_ms: number | null;
  median_wall_ms: number | null;
  total_engaged_ms: number | null;
  total_idle_ms: number | null;
  total_away_ms: number | null;
  total_blurred_ms: number | null;
  pct_with_friction: number | null;
  pct_left_page: number | null;
  copies: number;
  first_event: string | null;
  last_event: string | null;
}

export async function overview(): Promise<Overview> {
  const [row] = await query<Overview>(`
    SELECT
      (SELECT count(*) FROM investigations)                                  AS investigations,
      (SELECT count(DISTINCT agent_id) FROM investigations)                  AS agents,
      (SELECT count(DISTINCT order_id) FROM investigations)                  AS orders,
      (SELECT count(*) FROM stg_events)                                      AS events,
      (SELECT median(engaged_ms) FROM investigations)                        AS median_engaged_ms,
      (SELECT median(wall_ms) FROM investigations)                           AS median_wall_ms,
      (SELECT sum(engaged_ms) FROM investigations)                           AS total_engaged_ms,
      (SELECT sum(idle_ms) FROM investigations)                              AS total_idle_ms,
      (SELECT sum(away_ms) FROM investigations)                              AS total_away_ms,
      (SELECT sum(blurred_ms) FROM investigations)                           AS total_blurred_ms,
      (SELECT round(100.0 * avg(CASE WHEN friction_signals > 0 THEN 1 ELSE 0 END), 1) FROM investigations) AS pct_with_friction,
      (SELECT round(100.0 * avg(CASE WHEN leaves > 0 THEN 1 ELSE 0 END), 1) FROM investigations)           AS pct_left_page,
      (SELECT count(*) FROM stg_events WHERE event = 'Content Copied')      AS copies,
      (SELECT min(ts) FROM stg_events)                                       AS first_event,
      (SELECT max(ts) FROM stg_events)                                       AS last_event
  `);
  return row;
}

export const problemMix = () =>
  query<{ problem: string; inferred: number; from_ticket: number; median_engaged_ms: number | null; median_wall_ms: number | null } & Row>(`
    WITH p AS (
      SELECT inferred_problem AS problem, count(*) AS inferred, median(engaged_ms) AS median_engaged_ms, median(wall_ms) AS median_wall_ms
      FROM investigations GROUP BY 1
    ), t AS (
      SELECT ticket_problem AS problem, count(*) AS from_ticket FROM investigations WHERE ticket_problem IS NOT NULL GROUP BY 1
    )
    SELECT coalesce(p.problem, t.problem) AS problem, coalesce(p.inferred, 0) AS inferred, coalesce(t.from_ticket, 0) AS from_ticket,
           p.median_engaged_ms, p.median_wall_ms
    FROM p FULL OUTER JOIN t ON t.problem = p.problem
    ORDER BY inferred DESC`);

export const inferenceAccuracy = () =>
  query<{ labelled: number; matched: number; pct: number | null } & Row>(`
    SELECT count(*) AS labelled, count(*) FILTER (WHERE inferred_problem = ticket_problem) AS matched,
           round(100.0 * count(*) FILTER (WHERE inferred_problem = ticket_problem) / nullif(count(*), 0), 1) AS pct
    FROM investigations WHERE ticket_problem IS NOT NULL`);

export const entryPoints = () =>
  query<{ entry_point: string; investigations: number; median_engaged_ms: number | null } & Row>(`
    SELECT entry_point, count(*) AS investigations, median(engaged_ms) AS median_engaged_ms
    FROM investigations GROUP BY 1 ORDER BY 2 DESC`);

export const featureUsage = () =>
  query<{ feature: string; total_uses: number; investigations: number; pct_investigations: number | null; agents: number; median_ms_to_use: number | null } & Row>(
    `SELECT * FROM feature_usage`,
  );

export const elementStats = (pageType: string) =>
  query<{
    element_id: string;
    page_views: number;
    pv_viewed: number;
    view_rate_pct: number | null;
    avg_visible_ms_per_pv: number | null;
    avg_hover_ms_per_pv: number | null;
    clicks: number;
    rage_clicks: number;
    dead_clicks: number;
    copies: number;
    selections: number;
    hover_intents: number;
  } & Row>(`SELECT * FROM element_stats WHERE page_type = $page_type ORDER BY avg_visible_ms_per_pv DESC NULLS LAST`, { page_type: pageType });

export const clickPoints = (pageType: string) =>
  query<{ element_id: string; element_key: string | null; x_rel: number | null; y_rel: number | null; is_interactive: boolean } & Row>(
    `SELECT element_id, element_key, x_rel, y_rel, is_interactive FROM click_points WHERE page_type = $page_type AND x_rel IS NOT NULL LIMIT 5000`,
    { page_type: pageType },
  );

export const scrollReach = (pageType: string) =>
  query<{ container: string; depth_pct: number; pct_of_page_views: number; page_views_reached: number; median_ms_to_reach: number | null } & Row>(
    `SELECT container, depth_pct, pct_of_page_views, page_views_reached, median_ms_to_reach FROM scroll_reach WHERE page_type = $page_type ORDER BY container, depth_pct`,
    { page_type: pageType },
  );

export const copyStats = () => query(`SELECT * FROM copy_stats`);

export const awaySummary = () =>
  query<{ away_bucket: string; away_type: string; episodes: number; after_copy: number } & Row>(`
    SELECT away_bucket, away_type, count(*) AS episodes, count(*) FILTER (WHERE after_copy) AS after_copy
    FROM away_episodes GROUP BY 1, 2
    ORDER BY CASE away_bucket WHEN '< 10s' THEN 1 WHEN '10–60s' THEN 2 WHEN '1–5 min' THEN 3 WHEN '> 5 min' THEN 4 ELSE 5 END, 2`);

export const leaveTriggers = () =>
  query<{ last_action: string; episodes: number; median_away_ms: number | null } & Row>(`
    SELECT coalesce(last_action, '(none)') AS last_action, count(*) AS episodes, median(away_ms) AS median_away_ms
    FROM away_episodes GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);

export const friction = () => query(`SELECT * FROM friction LIMIT 50`);

export const agents = () => query(`SELECT * FROM agent_summary`);

export const investigationsList = (limit = 200) =>
  query(`
    SELECT i.investigation_id, i.agent_id, a.agent_name, i.order_id, i.ticket_id, i.ticket_reason, i.entry_point, i.order_status,
           i.started_at, i.wall_ms, i.engaged_ms, i.idle_ms, i.away_ms, i.leaves, i.copies, i.clicks, i.friction_signals,
           i.inferred_problem, i.ticket_problem, i.tabs, i.page_views
    FROM investigations i LEFT JOIN dim_agents a USING (agent_id)
    ORDER BY i.started_at DESC LIMIT ${Math.max(1, Math.min(1000, Math.floor(limit)))}`);

export const investigation = async (id: string) => (await query(`SELECT i.*, a.agent_name, a.team FROM investigations i LEFT JOIN dim_agents a USING (agent_id) WHERE investigation_id = $id`, { id }))[0] ?? null;

export const investigationEvents = (id: string) =>
  query(`
    SELECT ts, event, page_type, zone, element_id, element_key, tab_id, page_view_id, replay_id, seq,
           CAST(properties AS VARCHAR) AS properties
    FROM stg_events WHERE investigation_id = $id ORDER BY ts, seq`,
    { id },
  );

export const recentEvents = (limit = 100) =>
  query(`
    SELECT ts, received_at, event, agent_id, zone, page_type, order_id, element_id, CAST(properties AS VARCHAR) AS properties
    FROM stg_events ORDER BY received_at DESC, seq DESC LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}`);

export const eventVolume = () =>
  query<{ event: string; n: number } & Row>(`SELECT event, count(*) AS n FROM stg_events GROUP BY 1 ORDER BY 2 DESC`);
