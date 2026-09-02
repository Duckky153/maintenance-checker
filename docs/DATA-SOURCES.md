# Data sources

## CoreWeave public status page

`https://status.coreweave.com/`

Used for active incidents, active and upcoming maintenance, structured schedule,
component, location, and recent history fields.

## CoreWeave public RSS feed

`https://status.coreweave.com/pages/5e126e998f2f032e1f8f0f4b/rss`

Used for the ten most recent event records and their dated lifecycle updates.

## Capture controls

The fetch step records the URL, HTTP status, retrieval timestamp, byte count, and
SHA-256 hash for each source. Every successful refresh archives its validated
raw capture under `evidence/source-snapshots/` before the temporary staging
area is removed. The browser reads generated JSON, never the raw HTML.
