# Test plan

## Deterministic evidence

The automated tests use the archived September 2, 2026 capture of CoreWeave's
real public status page and RSS feed. They verify provenance, parsing, event
merging, strict date parsing, date-only extension handling, local/UTC time
checks, field conflicts, lifecycle history, calendar quarantine, `.ics` export,
and summary links.

Rejection tests truncate or tamper with copies of the real capture to confirm
that the source contract catches unexpected content, hash mismatches, zero
parsed records from either source, failed two-source capture, transaction
rollback, validation failures, malformed HTTP paths, and concurrent refreshes.
These invalid inputs are never accepted as product records.

## Live checks

The verification run separately confirms that both public source URLs respond
and still match the expected page/RSS structure. It records live byte counts and
hashes but does not expect the event count to remain fixed.

## Browser checks

- all four views load;
- the displayed counts match the generated report;
- a problem includes side-by-side source evidence;
- calendar-ready and held-for-review counts match the report;
- the downloaded summary and calendar bytes match their generated files;
- the health and JSON report endpoints return the generated schema and counts;
- the refresh workflow completes;
- desktop and mobile pages have no horizontal overflow;
- all navigation and stacked notice cards remain visible on mobile;
- the same build loads from a repository subpath with no API, hides the
  unavailable refresh control, and keeps static assets and downloads relative;
- no browser console error is recorded.

The verification report calculates source-host, source-identity, and manifest
hash checks from the generated records and current captures. It records the
exact test count instead of relying on a hard-coded number.
