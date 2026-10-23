-- Feature adoption: share of investigations that used each feature, and how soon.
CREATE OR REPLACE TABLE feature_usage AS
WITH features(feature, event_name, element_filter) AS (
  VALUES
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
inv AS (SELECT investigation_id, started_at FROM investigations),
uses AS (
  SELECT f.feature, e.investigation_id, e.agent_id, e.ts
  FROM features f
  JOIN stg_events e
    ON e.event = f.event_name
   AND (f.element_filter IS NULL OR e.element_id = f.element_filter)
  WHERE e.investigation_id IS NOT NULL
)
SELECT
  f.feature,
  count(u.investigation_id)                                        AS total_uses,
  count(DISTINCT u.investigation_id)                               AS investigations,
  round(100.0 * count(DISTINCT u.investigation_id) / nullif((SELECT count(*) FROM inv), 0), 1) AS pct_investigations,
  count(DISTINCT u.agent_id)                                       AS agents,
  median(epoch_ms(u.ts) - epoch_ms(i.started_at))                  AS median_ms_to_use
FROM features f
LEFT JOIN uses u ON u.feature = f.feature
LEFT JOIN inv i ON i.investigation_id = u.investigation_id
GROUP BY f.feature
ORDER BY pct_investigations DESC NULLS LAST;
