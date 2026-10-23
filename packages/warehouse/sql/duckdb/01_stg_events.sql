-- One row per track/page call with the common properties promoted to columns.
CREATE OR REPLACE TABLE stg_events AS
SELECT
  messageId                                              AS message_id,
  type                                                   AS call_type,
  CASE WHEN type = 'page' THEN 'Page Viewed' ELSE event END AS event,
  userId                                                 AS agent_id,
  anonymousId                                            AS anonymous_id,
  CAST("timestamp" AS TIMESTAMPTZ)                       AS ts,
  CAST(receivedAt AS TIMESTAMPTZ)                        AS received_at,
  (properties->>'session_id')                              AS session_id,
  (properties->>'tab_id')                                  AS tab_id,
  (properties->>'page_view_id')                            AS page_view_id,
  (properties->>'replay_id')                               AS replay_id,
  (properties->>'zone')                                    AS zone,
  coalesce(properties->>'page_type', name)               AS page_type,
  (properties->>'investigation_id')                        AS investigation_id,
  (properties->>'order_id')                                AS order_id,
  (properties->>'ticket_id')                               AS ticket_id,
  (properties->>'entry_point')                             AS entry_point,
  TRY_CAST(properties->>'seq' AS INTEGER)                AS seq,
  (properties->>'element_id')                              AS element_id,
  (properties->>'element_key')                             AS element_key,
  (properties->>'section')                                 AS section,
  properties,
  (context->'page'->>'path')                               AS page_path
FROM raw_events
WHERE type IN ('track', 'page') AND messageId IS NOT NULL
QUALIFY row_number() OVER (PARTITION BY messageId ORDER BY receivedAt) = 1; -- Segment retries can duplicate

CREATE OR REPLACE TABLE dim_agents AS
SELECT
  userId                                                  AS agent_id,
  arg_max(traits->>'name', "timestamp")                   AS agent_name,
  arg_max(traits->>'team', "timestamp")                   AS team,
  arg_max(TRY_CAST(traits->>'tenure_months' AS INTEGER), "timestamp") AS tenure_months
FROM raw_events
WHERE type = 'identify' AND userId IS NOT NULL
GROUP BY 1;
