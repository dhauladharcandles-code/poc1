-- ─────────────────────────────────────────────────────────────────────────────
-- Snowflake landing zone for raw Segment events.
--
-- Recommended path:  Segment  →  Amazon S3 destination (raw JSON, one object per batch)
--                             →  Snowpipe (auto-ingest)  →  RAW.SEGMENT_EVENTS (VARIANT)
-- Keeping the raw payload as VARIANT means new properties never break the load, and the
-- models below read exactly what the POC's local collector writes (same message shape).
--
-- Alternative: Segment's native Snowflake warehouse destination creates TRACKS/PAGES
-- plus one table per event with flattened columns. If you use it, point STG_EVENTS at
-- those tables instead (see note at the bottom of 01_models.sql).
--
-- NOTE: written for the POC and not yet run against a live account.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS AGENT_ANALYTICS;
CREATE SCHEMA IF NOT EXISTS AGENT_ANALYTICS.RAW;
CREATE SCHEMA IF NOT EXISTS AGENT_ANALYTICS.MARTS;
USE SCHEMA AGENT_ANALYTICS.RAW;

CREATE FILE FORMAT IF NOT EXISTS NDJSON_FORMAT TYPE = JSON STRIP_OUTER_ARRAY = FALSE;

-- For the POC: an internal stage you can PUT the collector's .data/events/*.ndjson into.
CREATE STAGE IF NOT EXISTS SEGMENT_EVENTS_STAGE FILE_FORMAT = NDJSON_FORMAT;
-- For production: an external stage on the bucket Segment's S3 destination writes to.
-- CREATE STAGE SEGMENT_S3_STAGE URL = 's3://<bucket>/segment-logs/<source-id>/'
--   STORAGE_INTEGRATION = <integration> FILE_FORMAT = NDJSON_FORMAT;

CREATE TABLE IF NOT EXISTS SEGMENT_EVENTS (
  RAW        VARIANT,
  FILENAME   STRING,
  LOADED_AT  TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP()
);

-- POC load (from SnowSQL):
--   PUT file://./.data/events/*.ndjson @SEGMENT_EVENTS_STAGE AUTO_COMPRESS=TRUE;
COPY INTO SEGMENT_EVENTS (RAW, FILENAME)
FROM (SELECT $1, METADATA$FILENAME FROM @SEGMENT_EVENTS_STAGE)
ON_ERROR = 'CONTINUE';

-- Production: continuous load.
-- CREATE PIPE SEGMENT_EVENTS_PIPE AUTO_INGEST = TRUE AS
--   COPY INTO SEGMENT_EVENTS (RAW, FILENAME)
--   FROM (SELECT $1, METADATA$FILENAME FROM @SEGMENT_S3_STAGE);
