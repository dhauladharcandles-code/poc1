-- Raw Segment messages exactly as the collector received them (NDJSON).
-- In production this is the Segment → S3 archive loaded by Snowpipe into RAW.SEGMENT_EVENTS (see ../snowflake).
CREATE OR REPLACE VIEW raw_events AS
SELECT *
FROM read_json(
  '{{events_glob}}',
  format = 'newline_delimited',
  ignore_errors = true,
  columns = {
    messageId: 'VARCHAR', type: 'VARCHAR', event: 'VARCHAR', name: 'VARCHAR',
    userId: 'VARCHAR', anonymousId: 'VARCHAR', timestamp: 'VARCHAR', receivedAt: 'VARCHAR',
    properties: 'JSON', context: 'JSON', traits: 'JSON'
  }
);
