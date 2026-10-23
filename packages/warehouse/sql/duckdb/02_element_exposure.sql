-- Viewability/hover dwell, unnested from the batched `Element Exposure Recorded` events.
CREATE OR REPLACE TABLE element_exposure AS
WITH x AS (
  SELECT investigation_id, page_view_id, agent_id, page_type, ts,
         unnest(from_json(properties->'elements', '["json"]')) AS el
  FROM stg_events
  WHERE event = 'Element Exposure Recorded'
)
SELECT
  investigation_id, page_view_id, agent_id, page_type, ts,
  (el->>'element_id')                          AS element_id,
  (el->>'element_key')                         AS element_key,
  (el->>'section')                             AS section,
  coalesce(TRY_CAST(el->>'visible_ms' AS BIGINT), 0) AS visible_ms,
  coalesce(TRY_CAST(el->>'hover_ms' AS BIGINT), 0)   AS hover_ms,
  TRY_CAST(el->>'max_ratio' AS DOUBLE)       AS max_ratio,
  TRY_CAST(el->>'viewed' AS BOOLEAN)         AS viewed
FROM x;
