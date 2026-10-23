-- What gets copied, how, and whether the agent then left the tab (likely pasting it somewhere else).
CREATE OR REPLACE TABLE copy_stats AS
WITH copies AS (
  SELECT investigation_id, page_view_id, agent_id, ts,
         (properties->>'field')         AS field,
         (properties->>'method')        AS method,
         (properties->>'detected_type') AS detected_type
  FROM stg_events WHERE event = 'Content Copied'
),
leaves AS (
  SELECT page_view_id, ts AS left_at, (properties->>'last_copy_field') AS last_copy_field,
         TRY_CAST(properties->>'ms_since_last_copy' AS BIGINT) AS ms_since_copy
  FROM stg_events WHERE event = 'Page Left'
),
returns AS (
  SELECT page_view_id, ts AS returned_at, TRY_CAST(properties->>'away_ms' AS BIGINT) AS away_ms
  FROM stg_events WHERE event = 'Page Returned'
),
copy_leave AS (
  SELECT c.*, l.left_at,
         (SELECT min_by(r.away_ms, r.returned_at) FROM returns r WHERE r.page_view_id = c.page_view_id AND r.returned_at >= l.left_at) AS away_ms
  FROM copies c
  LEFT JOIN leaves l
    ON l.page_view_id = c.page_view_id AND l.last_copy_field = c.field
   AND l.left_at >= c.ts AND l.left_at <= c.ts + INTERVAL 15 SECOND
)
SELECT field, method, detected_type,
       count(*)                                        AS copies,
       count(DISTINCT investigation_id)                AS investigations,
       count(DISTINCT agent_id)                        AS agents,
       count(left_at)                                  AS left_within_15s,
       round(100.0 * count(left_at) / count(*), 1)     AS pct_left_within_15s,
       median(away_ms)                                 AS median_away_ms_after
FROM copy_leave
GROUP BY 1, 2, 3
ORDER BY copies DESC;

-- Every time attention left the page: why (tab switch vs other window), for how long, and what preceded it.
CREATE OR REPLACE TABLE away_episodes AS
WITH l AS (
  SELECT page_view_id, investigation_id, agent_id, page_type, ts AS left_at,
         (properties->>'leave_type')  AS leave_type,
         (properties->>'last_action') AS last_action,
         (properties->>'last_element_id') AS last_element_id,
         (properties->>'last_copy_field') AS last_copy_field,
         TRY_CAST(properties->>'ms_since_last_copy' AS BIGINT) AS ms_since_last_copy,
         row_number() OVER (PARTITION BY page_view_id ORDER BY ts) AS n
  FROM stg_events WHERE event = 'Page Left'
),
r AS (
  SELECT page_view_id, ts AS returned_at, (properties->>'away_type') AS away_type,
         TRY_CAST(properties->>'away_ms' AS BIGINT) AS away_ms,
         row_number() OVER (PARTITION BY page_view_id ORDER BY ts) AS n
  FROM stg_events WHERE event = 'Page Returned'
)
SELECT l.*, r.returned_at, coalesce(r.away_type, l.leave_type) AS away_type, r.away_ms,
       (l.ms_since_last_copy IS NOT NULL AND l.ms_since_last_copy < 15000) AS after_copy,
       CASE WHEN r.away_ms IS NULL THEN 'never returned'
            WHEN r.away_ms < 10000 THEN '< 10s'
            WHEN r.away_ms < 60000 THEN '10–60s'
            WHEN r.away_ms < 300000 THEN '1–5 min'
            ELSE '> 5 min' END AS away_bucket
FROM l LEFT JOIN r ON r.page_view_id = l.page_view_id AND r.n = l.n;

-- Friction signals by element.
CREATE OR REPLACE TABLE friction AS
SELECT event AS signal, page_type, coalesce(element_id, (properties->>'reason'), '(page)') AS element_id,
       coalesce(properties->>'kind', (properties->>'reason')) AS detail,
       count(*) AS occurrences, count(DISTINCT investigation_id) AS investigations, count(DISTINCT agent_id) AS agents
FROM stg_events
WHERE event IN ('Rage Click Detected', 'Dead Click Detected', 'Find In Page Used', 'Error Encountered', 'Empty State Shown')
GROUP BY ALL
ORDER BY occurrences DESC;

-- Per-agent rollup.
CREATE OR REPLACE TABLE agent_summary AS
SELECT
  i.agent_id, a.agent_name, a.team, a.tenure_months,
  count(*)                                 AS investigations,
  median(i.engaged_ms)                     AS median_engaged_ms,
  median(i.wall_ms)                        AS median_wall_ms,
  sum(i.away_ms)                           AS away_ms,
  sum(i.idle_ms)                           AS idle_ms,
  avg(i.friction_signals)                  AS avg_friction,
  avg(CASE WHEN i.used_events_panel THEN 1 ELSE 0 END) * 100 AS pct_used_events_panel,
  avg(CASE WHEN i.used_carrier_link THEN 1 ELSE 0 END) * 100 AS pct_used_carrier_link,
  sum(i.copies)                            AS copies
FROM investigations i
LEFT JOIN dim_agents a USING (agent_id)
GROUP BY ALL
ORDER BY investigations DESC;
