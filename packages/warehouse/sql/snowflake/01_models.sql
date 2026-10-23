-- ─────────────────────────────────────────────────────────────────────────────
-- Snowflake port of packages/warehouse/sql/duckdb/*.sql (same model names & columns).
-- Run after 00_setup.sql. In a real setup each statement becomes a dbt model
-- (stg_events/dim_agents as incremental, the rest as tables or dynamic tables).
--
-- NOTE: written for the POC and not yet run against a live account; the DuckDB
-- versions are the ones exercised by the local dashboard and tests.
-- ─────────────────────────────────────────────────────────────────────────────
USE SCHEMA AGENT_ANALYTICS.MARTS;

CREATE OR REPLACE TABLE STG_EVENTS AS
SELECT
  RAW:messageId::STRING                                        AS MESSAGE_ID,
  RAW:type::STRING                                             AS CALL_TYPE,
  IFF(RAW:type::STRING = 'page', 'Page Viewed', RAW:event::STRING) AS EVENT,
  RAW:userId::STRING                                           AS AGENT_ID,
  RAW:anonymousId::STRING                                      AS ANONYMOUS_ID,
  TRY_TO_TIMESTAMP_TZ(RAW:timestamp::STRING)                   AS TS,
  TRY_TO_TIMESTAMP_TZ(RAW:receivedAt::STRING)                  AS RECEIVED_AT,
  RAW:properties:session_id::STRING                            AS SESSION_ID,
  RAW:properties:tab_id::STRING                                AS TAB_ID,
  RAW:properties:page_view_id::STRING                          AS PAGE_VIEW_ID,
  RAW:properties:replay_id::STRING                             AS REPLAY_ID,
  RAW:properties:zone::STRING                                  AS ZONE,
  COALESCE(RAW:properties:page_type::STRING, RAW:name::STRING) AS PAGE_TYPE,
  RAW:properties:investigation_id::STRING                      AS INVESTIGATION_ID,
  RAW:properties:order_id::STRING                              AS ORDER_ID,
  RAW:properties:ticket_id::STRING                             AS TICKET_ID,
  RAW:properties:entry_point::STRING                           AS ENTRY_POINT,
  TRY_TO_NUMBER(RAW:properties:seq::STRING)                    AS SEQ,
  RAW:properties:element_id::STRING                            AS ELEMENT_ID,
  RAW:properties:element_key::STRING                           AS ELEMENT_KEY,
  RAW:properties:section::STRING                               AS SECTION,
  RAW:properties                                               AS PROPERTIES,
  RAW:context:page:path::STRING                                AS PAGE_PATH
FROM AGENT_ANALYTICS.RAW.SEGMENT_EVENTS
WHERE RAW:type::STRING IN ('track', 'page') AND RAW:messageId IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY RAW:messageId::STRING ORDER BY RAW:receivedAt::STRING) = 1;

CREATE OR REPLACE TABLE DIM_AGENTS AS
SELECT
  RAW:userId::STRING                                                        AS AGENT_ID,
  MAX_BY(RAW:traits:name::STRING, RAW:timestamp::STRING)                    AS AGENT_NAME,
  MAX_BY(RAW:traits:team::STRING, RAW:timestamp::STRING)                    AS TEAM,
  MAX_BY(TRY_TO_NUMBER(RAW:traits:tenure_months::STRING), RAW:timestamp::STRING) AS TENURE_MONTHS
FROM AGENT_ANALYTICS.RAW.SEGMENT_EVENTS
WHERE RAW:type::STRING = 'identify' AND RAW:userId IS NOT NULL
GROUP BY 1;

CREATE OR REPLACE TABLE ELEMENT_EXPOSURE AS
SELECT
  e.INVESTIGATION_ID, e.PAGE_VIEW_ID, e.AGENT_ID, e.PAGE_TYPE, e.TS,
  el.value:element_id::STRING                              AS ELEMENT_ID,
  el.value:element_key::STRING                             AS ELEMENT_KEY,
  el.value:section::STRING                                 AS SECTION,
  COALESCE(TRY_TO_NUMBER(el.value:visible_ms::STRING), 0)  AS VISIBLE_MS,
  COALESCE(TRY_TO_NUMBER(el.value:hover_ms::STRING), 0)    AS HOVER_MS,
  TRY_TO_DOUBLE(el.value:max_ratio::STRING)                AS MAX_RATIO,
  TRY_TO_BOOLEAN(el.value:viewed::STRING)                  AS VIEWED
FROM STG_EVENTS e,
     LATERAL FLATTEN(input => e.PROPERTIES:elements) el
WHERE e.EVENT = 'Element Exposure Recorded';

CREATE OR REPLACE TABLE INVESTIGATIONS AS
WITH ev AS (SELECT * FROM STG_EVENTS WHERE INVESTIGATION_ID IS NOT NULL),
started AS (
  SELECT INVESTIGATION_ID,
         ANY_VALUE(PROPERTIES:ticket_reason::STRING)     AS TICKET_REASON,
         ANY_VALUE(PROPERTIES:entry_point_order::STRING) AS ENTRY_POINT,
         ANY_VALUE(PROPERTIES:order_status::STRING)      AS ORDER_STATUS
  FROM ev WHERE EVENT = 'Investigation Started' GROUP BY 1
),
eng AS (
  SELECT INVESTIGATION_ID,
         SUM(TRY_TO_NUMBER(PROPERTIES:engaged_ms::STRING)) AS ENGAGED_MS,
         SUM(TRY_TO_NUMBER(PROPERTIES:visible_ms::STRING)) AS VISIBLE_MS,
         SUM(TRY_TO_NUMBER(PROPERTIES:hidden_ms::STRING))  AS HIDDEN_MS,
         SUM(TRY_TO_NUMBER(PROPERTIES:blurred_ms::STRING)) AS BLURRED_MS,
         SUM(TRY_TO_NUMBER(PROPERTIES:idle_ms::STRING))    AS IDLE_MS,
         MAX(TRY_TO_NUMBER(PROPERTIES:scroll_max_pct::STRING)) AS SCROLL_MAX_PCT
  FROM ev WHERE EVENT = 'Engagement Time Recorded' GROUP BY 1
),
dwell AS (
  SELECT INVESTIGATION_ID,
         SUM(IFF(ELEMENT_ID = 'address_card', VISIBLE_MS, NULL))  AS ADDRESS_DWELL_MS,
         SUM(IFF(ELEMENT_ID IN ('address_card.shipping', 'address_card.billing'), HOVER_MS, NULL)) AS ADDRESS_HOVER_MS,
         SUM(IFF(ELEMENT_ID = 'events_panel', VISIBLE_MS, NULL))  AS EVENTS_PANEL_DWELL_MS,
         SUM(IFF(ELEMENT_ID = 'line_item.eta', HOVER_MS, NULL))   AS ETA_HOVER_MS
  FROM ELEMENT_EXPOSURE WHERE INVESTIGATION_ID IS NOT NULL GROUP BY 1
),
agg AS (
  SELECT
    INVESTIGATION_ID,
    ANY_VALUE(AGENT_ID)  AS AGENT_ID,
    ANY_VALUE(ORDER_ID)  AS ORDER_ID,
    ANY_VALUE(TICKET_ID) AS TICKET_ID,
    MIN(TS) AS STARTED_AT,
    MAX(TS) AS ENDED_AT,
    COUNT(DISTINCT TAB_ID)       AS TABS,
    COUNT(DISTINCT PAGE_VIEW_ID) AS PAGE_VIEWS,
    COUNT_IF(EVENT = 'Element Clicked')       AS CLICKS,
    COUNT_IF(EVENT = 'Content Copied')        AS COPIES,
    COUNT_IF(EVENT = 'Page Left')             AS LEAVES,
    COALESCE(SUM(IFF(EVENT = 'Page Returned', TRY_TO_NUMBER(PROPERTIES:away_ms::STRING), NULL)), 0) AS AWAY_MS,
    COUNT_IF(EVENT = 'Rage Click Detected')   AS RAGE_CLICKS,
    COUNT_IF(EVENT = 'Dead Click Detected')   AS DEAD_CLICKS,
    COUNT_IF(EVENT = 'Find In Page Used')     AS FIND_IN_PAGE,
    COUNT_IF(EVENT = 'Error Encountered')     AS ERRORS,
    COUNT_IF(EVENT = 'Empty State Shown')     AS EMPTY_STATES,
    COUNT_IF(EVENT = 'Events Filter Changed') AS FILTER_CHANGES,
    COUNT_IF(EVENT = 'Agent Idle')            AS IDLE_PERIODS,
    BOOLOR_AGG(EVENT = 'Events Panel Opened')                                              AS USED_EVENTS_PANEL,
    BOOLOR_AGG(EVENT = 'Events Panel Opened' AND PROPERTIES:line_item_id::STRING IS NOT NULL) AS USED_ITEM_EVENTS,
    BOOLOR_AGG(EVENT = 'Tracking Link Clicked')                                            AS USED_CARRIER_LINK,
    BOOLOR_AGG(EVENT = 'Artwork Preview Opened')                                           AS USED_ARTWORK_PREVIEW,
    BOOLOR_AGG(EVENT = 'Order Totals Expanded')                                            AS USED_TOTALS,
    BOOLOR_AGG(EVENT = 'Timeline Step Clicked')                                            AS USED_TIMELINE,
    BOOLOR_AGG(EVENT = 'Line Item Expanded')                                               AS USED_ITEM_DETAILS,
    BOOLOR_AGG(EVENT = 'Element Hovered' AND ELEMENT_ID = 'line_item.eta')                 AS USED_ETA_TOOLTIP,
    BOOLOR_AGG(EVENT = 'Content Copied' AND PROPERTIES:field::STRING = 'tracking_number')  AS COPIED_TRACKING,
    BOOLOR_AGG(EVENT IN ('Content Copied', 'Text Selected') AND PROPERTIES:field::STRING IN ('shipping_address', 'billing_address', 'postal_code')) AS COPIED_ADDRESS,
    BOOLOR_AGG(EVENT = 'Content Copied' AND PROPERTIES:field::STRING = 'order_id')         AS COPIED_ORDER_ID,
    BOOLOR_AGG((EVENT = 'Events Filter Changed' AND PROPERTIES:to::STRING = 'shipping')   OR (EVENT = 'Events Panel Opened' AND PROPERTIES:filter::STRING = 'shipping'))   AS VIEWED_SHIPPING_EVENTS,
    BOOLOR_AGG((EVENT = 'Events Filter Changed' AND PROPERTIES:to::STRING = 'artwork')    OR (EVENT = 'Events Panel Opened' AND PROPERTIES:filter::STRING = 'artwork'))    AS VIEWED_ARTWORK_EVENTS,
    BOOLOR_AGG((EVENT = 'Events Filter Changed' AND PROPERTIES:to::STRING = 'production') OR (EVENT = 'Events Panel Opened' AND PROPERTIES:filter::STRING = 'production')) AS VIEWED_PRODUCTION_EVENTS,
    BOOLOR_AGG(EVENT = 'Page Returned' AND TRY_TO_BOOLEAN(PROPERTIES:left_after_copy::STRING)) AS COPY_THEN_LEAVE
  FROM ev
  GROUP BY 1
)
SELECT
  a.*,
  s.TICKET_REASON,
  COALESCE(s.ENTRY_POINT, 'unknown') AS ENTRY_POINT,
  s.ORDER_STATUS,
  COALESCE(e.ENGAGED_MS, 0) AS ENGAGED_MS,
  COALESCE(e.VISIBLE_MS, 0) AS VISIBLE_MS,
  COALESCE(e.HIDDEN_MS, 0)  AS HIDDEN_MS,
  COALESCE(e.BLURRED_MS, 0) AS BLURRED_MS,
  COALESCE(e.IDLE_MS, 0)    AS IDLE_MS,
  e.SCROLL_MAX_PCT,
  COALESCE(d.ADDRESS_DWELL_MS, 0)      AS ADDRESS_DWELL_MS,
  COALESCE(d.ADDRESS_HOVER_MS, 0)      AS ADDRESS_HOVER_MS,
  COALESCE(d.EVENTS_PANEL_DWELL_MS, 0) AS EVENTS_PANEL_DWELL_MS,
  COALESCE(d.ETA_HOVER_MS, 0)          AS ETA_HOVER_MS,
  DATEDIFF(millisecond, a.STARTED_AT, a.ENDED_AT) AS WALL_MS,
  (a.RAGE_CLICKS + a.DEAD_CLICKS + a.FIND_IN_PAGE + a.ERRORS) AS FRICTION_SIGNALS,
  CASE
    WHEN a.USED_ARTWORK_PREVIEW OR a.VIEWED_ARTWORK_EVENTS                                  THEN 'artwork_issue'
    WHEN a.COPIED_ADDRESS OR COALESCE(d.ADDRESS_HOVER_MS, 0) >= 5000                        THEN 'address_change'
    WHEN s.ORDER_STATUS = 'delivered' AND (a.COPIED_TRACKING OR a.USED_CARRIER_LINK OR a.VIEWED_SHIPPING_EVENTS) THEN 'delivery_dispute'
    WHEN s.ORDER_STATUS = 'partially_shipped' AND a.USED_ITEM_EVENTS                        THEN 'missing_items'
    WHEN a.COPIED_TRACKING OR a.USED_CARRIER_LINK                                           THEN 'where_is_my_order'
    WHEN a.USED_ETA_TOOLTIP OR a.VIEWED_PRODUCTION_EVENTS OR a.USED_TIMELINE                THEN 'order_delay'
    WHEN a.VIEWED_SHIPPING_EVENTS                                                           THEN 'where_is_my_order'
    WHEN a.USED_TOTALS                                                                      THEN 'billing_question'
    ELSE 'unclear'
  END AS INFERRED_PROBLEM,
  CASE s.TICKET_REASON
    WHEN 'wismo'          THEN 'where_is_my_order'
    WHEN 'not_received'   THEN 'delivery_dispute'
    WHEN 'missing_items'  THEN 'missing_items'
    WHEN 'order_delay'    THEN 'order_delay'
    WHEN 'address_change' THEN 'address_change'
    WHEN 'artwork'        THEN 'artwork_issue'
    WHEN 'billing'        THEN 'billing_question'
  END AS TICKET_PROBLEM
FROM agg a
LEFT JOIN started s USING (INVESTIGATION_ID)
LEFT JOIN eng e USING (INVESTIGATION_ID)
LEFT JOIN dwell d USING (INVESTIGATION_ID);

CREATE OR REPLACE TABLE FEATURE_USAGE AS
WITH features AS (
  SELECT column1 AS FEATURE, column2 AS EVENT_NAME, column3 AS ELEMENT_FILTER
  FROM VALUES
    ('Events panel',            'Events Panel Opened',    NULL),
    ('Events panel filter tabs','Events Filter Changed',  NULL),
    ('Event row details',       'Event Row Expanded',     NULL),
    ('Timeline step → events',  'Timeline Step Clicked',  NULL),
    ('Price breakdown',         'Order Totals Expanded',  NULL),
    ('Line item details',       'Line Item Expanded',     NULL),
    ('Artwork preview',         'Artwork Preview Opened', NULL),
    ('Artwork zoom',            'Artwork Zoomed',         NULL),
    ('Carrier tracking link',   'Tracking Link Clicked',  NULL),
    ('ETA explanation tooltip', 'Element Hovered',        'line_item.eta'),
    ('Copy tracking # button',  'Content Copied',         'copy.tracking_number'),
    ('Copy address button',     'Content Copied',         'copy.shipping_address'),
    ('Copy order id button',    'Content Copied',         'copy.order_id')
),
uses AS (
  SELECT f.FEATURE, e.INVESTIGATION_ID, e.AGENT_ID, e.TS
  FROM features f
  JOIN STG_EVENTS e ON e.EVENT = f.EVENT_NAME AND (f.ELEMENT_FILTER IS NULL OR e.ELEMENT_ID = f.ELEMENT_FILTER)
  WHERE e.INVESTIGATION_ID IS NOT NULL
)
SELECT
  f.FEATURE,
  COUNT(u.INVESTIGATION_ID)                                   AS TOTAL_USES,
  COUNT(DISTINCT u.INVESTIGATION_ID)                          AS INVESTIGATIONS,
  ROUND(100 * COUNT(DISTINCT u.INVESTIGATION_ID) / NULLIF((SELECT COUNT(*) FROM INVESTIGATIONS), 0), 1) AS PCT_INVESTIGATIONS,
  COUNT(DISTINCT u.AGENT_ID)                                  AS AGENTS,
  MEDIAN(DATEDIFF(millisecond, i.STARTED_AT, u.TS))           AS MEDIAN_MS_TO_USE
FROM features f
LEFT JOIN uses u ON u.FEATURE = f.FEATURE
LEFT JOIN INVESTIGATIONS i ON i.INVESTIGATION_ID = u.INVESTIGATION_ID
GROUP BY f.FEATURE
ORDER BY PCT_INVESTIGATIONS DESC NULLS LAST;

CREATE OR REPLACE TABLE ELEMENT_STATS AS
WITH pv AS (
  SELECT PAGE_TYPE, COUNT(DISTINCT PAGE_VIEW_ID) AS PAGE_VIEWS FROM STG_EVENTS WHERE EVENT = 'Page Viewed' GROUP BY 1
),
exp_pv AS (
  SELECT PAGE_TYPE, ELEMENT_ID, PAGE_VIEW_ID,
         SUM(VISIBLE_MS) / GREATEST(COUNT(DISTINCT COALESCE(ELEMENT_KEY, '')), 1) AS VISIBLE_MS,
         SUM(HOVER_MS)   / GREATEST(COUNT(DISTINCT COALESCE(ELEMENT_KEY, '')), 1) AS HOVER_MS,
         BOOLOR_AGG(VIEWED) AS VIEWED
  FROM ELEMENT_EXPOSURE GROUP BY 1, 2, 3
),
exp AS (
  SELECT PAGE_TYPE, ELEMENT_ID,
         COUNT(*)            AS PV_EXPOSED,
         COUNT_IF(VIEWED)    AS PV_VIEWED,
         SUM(VISIBLE_MS)     AS VISIBLE_MS,
         SUM(HOVER_MS)       AS HOVER_MS
  FROM exp_pv GROUP BY 1, 2
),
ev AS (
  SELECT PAGE_TYPE, ELEMENT_ID,
         COUNT_IF(EVENT = 'Element Clicked')     AS CLICKS,
         COUNT_IF(EVENT = 'Rage Click Detected') AS RAGE_CLICKS,
         COUNT_IF(EVENT = 'Dead Click Detected') AS DEAD_CLICKS,
         COUNT_IF(EVENT = 'Content Copied')      AS COPIES,
         COUNT_IF(EVENT = 'Text Selected')       AS SELECTIONS,
         COUNT_IF(EVENT = 'Element Hovered')     AS HOVER_INTENTS
  FROM STG_EVENTS WHERE ELEMENT_ID IS NOT NULL GROUP BY 1, 2
)
SELECT
  COALESCE(exp.PAGE_TYPE, ev.PAGE_TYPE)   AS PAGE_TYPE,
  COALESCE(exp.ELEMENT_ID, ev.ELEMENT_ID) AS ELEMENT_ID,
  pv.PAGE_VIEWS,
  COALESCE(exp.PV_VIEWED, 0) AS PV_VIEWED,
  ROUND(100 * COALESCE(exp.PV_VIEWED, 0) / NULLIF(pv.PAGE_VIEWS, 0), 1) AS VIEW_RATE_PCT,
  ROUND(COALESCE(exp.VISIBLE_MS, 0) / NULLIF(pv.PAGE_VIEWS, 0))         AS AVG_VISIBLE_MS_PER_PV,
  ROUND(COALESCE(exp.HOVER_MS, 0) / NULLIF(pv.PAGE_VIEWS, 0))           AS AVG_HOVER_MS_PER_PV,
  COALESCE(ev.CLICKS, 0) AS CLICKS, COALESCE(ev.RAGE_CLICKS, 0) AS RAGE_CLICKS, COALESCE(ev.DEAD_CLICKS, 0) AS DEAD_CLICKS,
  COALESCE(ev.COPIES, 0) AS COPIES, COALESCE(ev.SELECTIONS, 0) AS SELECTIONS, COALESCE(ev.HOVER_INTENTS, 0) AS HOVER_INTENTS
FROM exp
FULL OUTER JOIN ev ON ev.PAGE_TYPE = exp.PAGE_TYPE AND ev.ELEMENT_ID = exp.ELEMENT_ID
LEFT JOIN pv ON pv.PAGE_TYPE = COALESCE(exp.PAGE_TYPE, ev.PAGE_TYPE);

CREATE OR REPLACE TABLE CLICK_POINTS AS
SELECT PAGE_TYPE, ELEMENT_ID, ELEMENT_KEY,
       TRY_TO_DOUBLE(PROPERTIES:x_rel::STRING)            AS X_REL,
       TRY_TO_DOUBLE(PROPERTIES:y_rel::STRING)            AS Y_REL,
       TRY_TO_BOOLEAN(PROPERTIES:is_interactive::STRING)  AS IS_INTERACTIVE,
       INVESTIGATION_ID, AGENT_ID, TS
FROM STG_EVENTS
WHERE EVENT = 'Element Clicked' AND ELEMENT_ID IS NOT NULL;

CREATE OR REPLACE TABLE SCROLL_REACH AS
WITH pv AS (SELECT PAGE_TYPE, COUNT(DISTINCT PAGE_VIEW_ID) AS PAGE_VIEWS FROM STG_EVENTS WHERE EVENT = 'Page Viewed' GROUP BY 1)
SELECT
  e.PAGE_TYPE,
  e.PROPERTIES:container::STRING                       AS CONTAINER,
  TRY_TO_NUMBER(e.PROPERTIES:depth_pct::STRING)        AS DEPTH_PCT,
  COUNT(DISTINCT e.PAGE_VIEW_ID)                       AS PAGE_VIEWS_REACHED,
  ROUND(100 * COUNT(DISTINCT e.PAGE_VIEW_ID) / NULLIF(ANY_VALUE(pv.PAGE_VIEWS), 0), 1) AS PCT_OF_PAGE_VIEWS,
  MEDIAN(TRY_TO_NUMBER(e.PROPERTIES:time_to_reach_ms::STRING)) AS MEDIAN_MS_TO_REACH
FROM STG_EVENTS e
JOIN pv ON pv.PAGE_TYPE = e.PAGE_TYPE
WHERE e.EVENT = 'Scroll Depth Reached'
GROUP BY 1, 2, 3;

CREATE OR REPLACE TABLE COPY_STATS AS
WITH copies AS (
  SELECT INVESTIGATION_ID, PAGE_VIEW_ID, AGENT_ID, TS,
         PROPERTIES:field::STRING AS FIELD, PROPERTIES:method::STRING AS METHOD, PROPERTIES:detected_type::STRING AS DETECTED_TYPE
  FROM STG_EVENTS WHERE EVENT = 'Content Copied'
),
leaves AS (
  SELECT PAGE_VIEW_ID, TS AS LEFT_AT, PROPERTIES:last_copy_field::STRING AS LAST_COPY_FIELD
  FROM STG_EVENTS WHERE EVENT = 'Page Left'
),
returns AS (
  SELECT PAGE_VIEW_ID, TS AS RETURNED_AT, TRY_TO_NUMBER(PROPERTIES:away_ms::STRING) AS AWAY_MS
  FROM STG_EVENTS WHERE EVENT = 'Page Returned'
),
copy_leave AS (
  SELECT c.*, l.LEFT_AT,
         (SELECT MIN_BY(r.AWAY_MS, r.RETURNED_AT) FROM returns r WHERE r.PAGE_VIEW_ID = c.PAGE_VIEW_ID AND r.RETURNED_AT >= l.LEFT_AT) AS AWAY_MS
  FROM copies c
  LEFT JOIN leaves l
    ON l.PAGE_VIEW_ID = c.PAGE_VIEW_ID AND l.LAST_COPY_FIELD = c.FIELD
   AND l.LEFT_AT BETWEEN c.TS AND DATEADD(second, 15, c.TS)
)
SELECT FIELD, METHOD, DETECTED_TYPE,
       COUNT(*) AS COPIES, COUNT(DISTINCT INVESTIGATION_ID) AS INVESTIGATIONS, COUNT(DISTINCT AGENT_ID) AS AGENTS,
       COUNT(LEFT_AT) AS LEFT_WITHIN_15S, ROUND(100 * COUNT(LEFT_AT) / COUNT(*), 1) AS PCT_LEFT_WITHIN_15S,
       MEDIAN(AWAY_MS) AS MEDIAN_AWAY_MS_AFTER
FROM copy_leave
GROUP BY 1, 2, 3
ORDER BY COPIES DESC;

CREATE OR REPLACE TABLE AWAY_EPISODES AS
WITH l AS (
  SELECT PAGE_VIEW_ID, INVESTIGATION_ID, AGENT_ID, PAGE_TYPE, TS AS LEFT_AT,
         PROPERTIES:leave_type::STRING AS LEAVE_TYPE, PROPERTIES:last_action::STRING AS LAST_ACTION,
         PROPERTIES:last_element_id::STRING AS LAST_ELEMENT_ID, PROPERTIES:last_copy_field::STRING AS LAST_COPY_FIELD,
         TRY_TO_NUMBER(PROPERTIES:ms_since_last_copy::STRING) AS MS_SINCE_LAST_COPY,
         ROW_NUMBER() OVER (PARTITION BY PAGE_VIEW_ID ORDER BY TS) AS N
  FROM STG_EVENTS WHERE EVENT = 'Page Left'
),
r AS (
  SELECT PAGE_VIEW_ID, TS AS RETURNED_AT, PROPERTIES:away_type::STRING AS AWAY_TYPE,
         TRY_TO_NUMBER(PROPERTIES:away_ms::STRING) AS AWAY_MS,
         ROW_NUMBER() OVER (PARTITION BY PAGE_VIEW_ID ORDER BY TS) AS N
  FROM STG_EVENTS WHERE EVENT = 'Page Returned'
)
SELECT l.*, r.RETURNED_AT, COALESCE(r.AWAY_TYPE, l.LEAVE_TYPE) AS AWAY_TYPE, r.AWAY_MS,
       (l.MS_SINCE_LAST_COPY IS NOT NULL AND l.MS_SINCE_LAST_COPY < 15000) AS AFTER_COPY,
       CASE WHEN r.AWAY_MS IS NULL THEN 'never returned'
            WHEN r.AWAY_MS < 10000 THEN '< 10s'
            WHEN r.AWAY_MS < 60000 THEN '10–60s'
            WHEN r.AWAY_MS < 300000 THEN '1–5 min'
            ELSE '> 5 min' END AS AWAY_BUCKET
FROM l LEFT JOIN r ON r.PAGE_VIEW_ID = l.PAGE_VIEW_ID AND r.N = l.N;

CREATE OR REPLACE TABLE FRICTION AS
SELECT EVENT AS SIGNAL, PAGE_TYPE,
       COALESCE(ELEMENT_ID, PROPERTIES:reason::STRING, '(page)') AS ELEMENT_ID,
       COALESCE(PROPERTIES:kind::STRING, PROPERTIES:reason::STRING) AS DETAIL,
       COUNT(*) AS OCCURRENCES, COUNT(DISTINCT INVESTIGATION_ID) AS INVESTIGATIONS, COUNT(DISTINCT AGENT_ID) AS AGENTS
FROM STG_EVENTS
WHERE EVENT IN ('Rage Click Detected', 'Dead Click Detected', 'Find In Page Used', 'Error Encountered', 'Empty State Shown')
GROUP BY ALL
ORDER BY OCCURRENCES DESC;

CREATE OR REPLACE TABLE AGENT_SUMMARY AS
SELECT
  i.AGENT_ID, a.AGENT_NAME, a.TEAM, a.TENURE_MONTHS,
  COUNT(*)              AS INVESTIGATIONS,
  MEDIAN(i.ENGAGED_MS)  AS MEDIAN_ENGAGED_MS,
  MEDIAN(i.WALL_MS)     AS MEDIAN_WALL_MS,
  SUM(i.AWAY_MS)        AS AWAY_MS,
  SUM(i.IDLE_MS)        AS IDLE_MS,
  AVG(i.FRICTION_SIGNALS) AS AVG_FRICTION,
  AVG(IFF(i.USED_EVENTS_PANEL, 1, 0)) * 100 AS PCT_USED_EVENTS_PANEL,
  AVG(IFF(i.USED_CARRIER_LINK, 1, 0)) * 100 AS PCT_USED_CARRIER_LINK,
  SUM(i.COPIES)         AS COPIES
FROM INVESTIGATIONS i
LEFT JOIN DIM_AGENTS a USING (AGENT_ID)
GROUP BY ALL
ORDER BY INVESTIGATIONS DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Using Segment's native Snowflake destination instead of raw S3?
-- Segment writes <SOURCE>.TRACKS (common columns) and one table per event, with
-- properties flattened into columns and context into CONTEXT_* columns. Replace the
-- STG_EVENTS definition with a UNION of the per-event tables you care about, e.g.
--   SELECT ID AS MESSAGE_ID, 'track' AS CALL_TYPE, EVENT_TEXT AS EVENT, USER_ID AS AGENT_ID, ...,
--          OBJECT_CONSTRUCT_KEEP_NULL(*) AS PROPERTIES
--   FROM <SOURCE>.ELEMENT_CLICKED UNION ALL ...
-- and keep every model below it unchanged. Arrays (Element Exposure `elements`) land as
-- JSON strings there, so wrap them with PARSE_JSON() before FLATTEN.
-- ─────────────────────────────────────────────────────────────────────────────
