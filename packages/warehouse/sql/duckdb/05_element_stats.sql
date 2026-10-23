-- Zone heatmap: per tracked element on a page type, how often it is seen, how long, hovered, clicked, copied, and frustrated on.
CREATE OR REPLACE TABLE element_stats AS
WITH pv AS (
  SELECT page_type, count(DISTINCT page_view_id) AS page_views
  FROM stg_events WHERE event = 'Page Viewed' GROUP BY 1
),
-- Per page view, average over instances (7 timeline steps or 6 line items shouldn't add up to 7× the time).
exp_pv AS (
  SELECT page_type, element_id, page_view_id,
         sum(visible_ms) / greatest(count(DISTINCT coalesce(element_key, '')), 1) AS visible_ms,
         sum(hover_ms)   / greatest(count(DISTINCT coalesce(element_key, '')), 1) AS hover_ms,
         bool_or(viewed) AS viewed
  FROM element_exposure GROUP BY 1, 2, 3
),
exp AS (
  SELECT page_type, element_id,
         count(*)                         AS pv_exposed,
         count(*) FILTER (WHERE viewed)   AS pv_viewed,
         sum(visible_ms)                  AS visible_ms,
         sum(hover_ms)                    AS hover_ms
  FROM exp_pv GROUP BY 1, 2
),
ev AS (
  SELECT page_type, element_id,
         count(*) FILTER (WHERE event = 'Element Clicked')     AS clicks,
         count(*) FILTER (WHERE event = 'Rage Click Detected') AS rage_clicks,
         count(*) FILTER (WHERE event = 'Dead Click Detected') AS dead_clicks,
         count(*) FILTER (WHERE event = 'Content Copied')      AS copies,
         count(*) FILTER (WHERE event = 'Text Selected')       AS selections,
         count(*) FILTER (WHERE event = 'Element Hovered')     AS hover_intents
  FROM stg_events WHERE element_id IS NOT NULL GROUP BY 1, 2
)
SELECT
  coalesce(exp.page_type, ev.page_type)   AS page_type,
  coalesce(exp.element_id, ev.element_id) AS element_id,
  pv.page_views,
  coalesce(exp.pv_viewed, 0)              AS pv_viewed,
  round(100.0 * coalesce(exp.pv_viewed, 0) / nullif(pv.page_views, 0), 1) AS view_rate_pct,
  round(coalesce(exp.visible_ms, 0) / nullif(pv.page_views, 0))            AS avg_visible_ms_per_pv,
  round(coalesce(exp.hover_ms, 0) / nullif(pv.page_views, 0))              AS avg_hover_ms_per_pv,
  coalesce(ev.clicks, 0)       AS clicks,
  coalesce(ev.rage_clicks, 0)  AS rage_clicks,
  coalesce(ev.dead_clicks, 0)  AS dead_clicks,
  coalesce(ev.copies, 0)       AS copies,
  coalesce(ev.selections, 0)   AS selections,
  coalesce(ev.hover_intents, 0) AS hover_intents
FROM exp
FULL OUTER JOIN ev ON ev.page_type = exp.page_type AND ev.element_id = exp.element_id
LEFT JOIN pv ON pv.page_type = coalesce(exp.page_type, ev.page_type);

-- Raw click points for the click heatmap (anchored to elements, so they survive layout changes).
CREATE OR REPLACE TABLE click_points AS
SELECT
  page_type, element_id, element_key,
  TRY_CAST(properties->>'x_rel' AS DOUBLE)            AS x_rel,
  TRY_CAST(properties->>'y_rel' AS DOUBLE)            AS y_rel,
  TRY_CAST(properties->>'is_interactive' AS BOOLEAN)  AS is_interactive,
  investigation_id, agent_id, ts
FROM stg_events
WHERE event = 'Element Clicked' AND element_id IS NOT NULL;

-- Scroll map: share of page views that reached each depth.
CREATE OR REPLACE TABLE scroll_reach AS
WITH pv AS (SELECT page_type, count(DISTINCT page_view_id) AS page_views FROM stg_events WHERE event = 'Page Viewed' GROUP BY 1)
SELECT
  e.page_type,
  (properties->>'container')                          AS container,
  TRY_CAST(properties->>'depth_pct' AS INTEGER)     AS depth_pct,
  count(DISTINCT e.page_view_id)                    AS page_views_reached,
  round(100.0 * count(DISTINCT e.page_view_id) / nullif(any_value(pv.page_views), 0), 1) AS pct_of_page_views,
  median(TRY_CAST(properties->>'time_to_reach_ms' AS BIGINT)) AS median_ms_to_reach
FROM stg_events e
JOIN pv USING (page_type)
WHERE e.event = 'Scroll Depth Reached'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
