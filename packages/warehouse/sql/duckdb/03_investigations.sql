-- The unit of analysis: one agent × one order × one activity window.
CREATE OR REPLACE TABLE investigations AS
WITH ev AS (SELECT * FROM stg_events WHERE investigation_id IS NOT NULL),
started AS (
  SELECT investigation_id,
         any_value(properties->>'ticket_reason')     AS ticket_reason,
         any_value(properties->>'entry_point_order') AS entry_point,
         any_value(properties->>'order_status')      AS order_status
  FROM ev WHERE event = 'Investigation Started' GROUP BY 1
),
eng AS (
  SELECT investigation_id,
         sum(TRY_CAST(properties->>'engaged_ms' AS BIGINT)) AS engaged_ms,
         sum(TRY_CAST(properties->>'visible_ms' AS BIGINT)) AS visible_ms,
         sum(TRY_CAST(properties->>'hidden_ms'  AS BIGINT)) AS hidden_ms,
         sum(TRY_CAST(properties->>'blurred_ms' AS BIGINT)) AS blurred_ms,
         sum(TRY_CAST(properties->>'idle_ms'    AS BIGINT)) AS idle_ms,
         max(TRY_CAST(properties->>'scroll_max_pct' AS INTEGER)) AS scroll_max_pct
  FROM ev WHERE event = 'Engagement Time Recorded' GROUP BY 1
),
dwell AS (
  SELECT investigation_id,
         sum(visible_ms) FILTER (WHERE element_id = 'address_card') AS address_dwell_ms,
         sum(hover_ms)   FILTER (WHERE element_id IN ('address_card.shipping', 'address_card.billing')) AS address_hover_ms,
         sum(visible_ms) FILTER (WHERE element_id = 'events_panel') AS events_panel_dwell_ms,
         sum(hover_ms)   FILTER (WHERE element_id = 'line_item.eta') AS eta_hover_ms
  FROM element_exposure WHERE investigation_id IS NOT NULL GROUP BY 1
),
agg AS (
  SELECT
    investigation_id,
    any_value(agent_id)  AS agent_id,
    any_value(order_id)  AS order_id,
    any_value(ticket_id) AS ticket_id,
    min(ts) AS started_at,
    max(ts) AS ended_at,
    count(DISTINCT tab_id)       AS tabs,
    count(DISTINCT page_view_id) AS page_views,
    count(*) FILTER (WHERE event = 'Element Clicked')       AS clicks,
    count(*) FILTER (WHERE event = 'Content Copied')        AS copies,
    count(*) FILTER (WHERE event = 'Page Left')             AS leaves,
    coalesce(sum(TRY_CAST(properties->>'away_ms' AS BIGINT)) FILTER (WHERE event = 'Page Returned'), 0) AS away_ms,
    count(*) FILTER (WHERE event = 'Rage Click Detected')   AS rage_clicks,
    count(*) FILTER (WHERE event = 'Dead Click Detected')   AS dead_clicks,
    count(*) FILTER (WHERE event = 'Find In Page Used')     AS find_in_page,
    count(*) FILTER (WHERE event = 'Error Encountered')     AS errors,
    count(*) FILTER (WHERE event = 'Empty State Shown')     AS empty_states,
    count(*) FILTER (WHERE event = 'Events Filter Changed') AS filter_changes,
    count(*) FILTER (WHERE event = 'Agent Idle')            AS idle_periods,
    bool_or(event = 'Events Panel Opened')                  AS used_events_panel,
    bool_or(event = 'Events Panel Opened' AND (properties->>'line_item_id') IS NOT NULL) AS used_item_events,
    bool_or(event = 'Tracking Link Clicked')                AS used_carrier_link,
    bool_or(event = 'Artwork Preview Opened')               AS used_artwork_preview,
    bool_or(event = 'Order Totals Expanded')                AS used_totals,
    bool_or(event = 'Timeline Step Clicked')                AS used_timeline,
    bool_or(event = 'Line Item Expanded')                   AS used_item_details,
    bool_or(event = 'Element Hovered' AND element_id = 'line_item.eta') AS used_eta_tooltip,
    bool_or(event = 'Content Copied' AND (properties->>'field') = 'tracking_number') AS copied_tracking,
    bool_or(event IN ('Content Copied', 'Text Selected') AND (properties->>'field') IN ('shipping_address', 'billing_address', 'postal_code')) AS copied_address,
    bool_or(event = 'Content Copied' AND (properties->>'field') = 'order_id') AS copied_order_id,
    bool_or((event = 'Events Filter Changed' AND (properties->>'to') = 'shipping')   OR (event = 'Events Panel Opened' AND (properties->>'filter') = 'shipping'))   AS viewed_shipping_events,
    bool_or((event = 'Events Filter Changed' AND (properties->>'to') = 'artwork')    OR (event = 'Events Panel Opened' AND (properties->>'filter') = 'artwork'))    AS viewed_artwork_events,
    bool_or((event = 'Events Filter Changed' AND (properties->>'to') = 'production') OR (event = 'Events Panel Opened' AND (properties->>'filter') = 'production')) AS viewed_production_events,
    bool_or(event = 'Page Returned' AND TRY_CAST(properties->>'left_after_copy' AS BOOLEAN)) AS copy_then_leave
  FROM ev
  GROUP BY 1
)
SELECT
  a.*,
  s.ticket_reason,
  coalesce(s.entry_point, 'unknown')                       AS entry_point,
  s.order_status,
  coalesce(e.engaged_ms, 0)   AS engaged_ms,
  coalesce(e.visible_ms, 0)   AS visible_ms,
  coalesce(e.hidden_ms, 0)    AS hidden_ms,
  coalesce(e.blurred_ms, 0)   AS blurred_ms,
  coalesce(e.idle_ms, 0)      AS idle_ms,
  e.scroll_max_pct,
  coalesce(d.address_dwell_ms, 0)      AS address_dwell_ms,
  coalesce(d.address_hover_ms, 0)      AS address_hover_ms,
  coalesce(d.events_panel_dwell_ms, 0) AS events_panel_dwell_ms,
  coalesce(d.eta_hover_ms, 0)          AS eta_hover_ms,
  epoch_ms(a.ended_at) - epoch_ms(a.started_at) AS wall_ms,
  (a.rage_clicks + a.dead_clicks + a.find_in_page + a.errors) AS friction_signals,
  -- Rule-based guess at the problem being solved. Ordered: most specific signal first.
  CASE
    WHEN a.used_artwork_preview OR a.viewed_artwork_events                                    THEN 'artwork_issue'
    -- Being on screen says little (the card is near the top); reading it with the mouse, selecting or copying it does.
    WHEN a.copied_address OR coalesce(d.address_hover_ms, 0) >= 5000                          THEN 'address_change'
    WHEN s.order_status = 'delivered' AND (a.copied_tracking OR a.used_carrier_link OR a.viewed_shipping_events) THEN 'delivery_dispute'
    WHEN s.order_status = 'partially_shipped' AND a.used_item_events                          THEN 'missing_items'
    -- Taking the tracking number elsewhere is the strongest "where is it?" signal.
    WHEN a.copied_tracking OR a.used_carrier_link                                             THEN 'where_is_my_order'
    WHEN a.used_eta_tooltip OR a.viewed_production_events OR a.used_timeline                  THEN 'order_delay'
    WHEN a.viewed_shipping_events                                                             THEN 'where_is_my_order'
    WHEN a.used_totals                                                                        THEN 'billing_question'
    ELSE 'unclear'
  END AS inferred_problem,
  -- Ticket reasons (ground truth when the agent came from the helpdesk) mapped onto the same buckets.
  CASE s.ticket_reason
    WHEN 'wismo'          THEN 'where_is_my_order'
    WHEN 'not_received'   THEN 'delivery_dispute'
    WHEN 'missing_items'  THEN 'missing_items'
    WHEN 'order_delay'    THEN 'order_delay'
    WHEN 'address_change' THEN 'address_change'
    WHEN 'artwork'        THEN 'artwork_issue'
    WHEN 'billing'        THEN 'billing_question'
    ELSE NULL
  END AS ticket_problem
FROM agg a
LEFT JOIN started s USING (investigation_id)
LEFT JOIN eng e USING (investigation_id)
LEFT JOIN dwell d USING (investigation_id);
