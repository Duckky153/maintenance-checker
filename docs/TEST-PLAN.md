# Test plan

## Deterministic evidence

The automated tests use the archived September 2, 2026 capture of CoreWeave's
real public status page and RSS feed. They verify provenance, parsing, event
merging, date-only extension handling, field conflicts, lifecycle history,
calendar quarantine, and summary links.

Rejection tests truncate or tamper with copies of the real capture to confirm
that the source contract catches unexpected content, hash mismatches, zero
parsed records, failed two-source capture, validation failures, and concurrent
refreshes. These invalid inputs are never accepted as product records.

## Live checks

The verification run separately confirms that both public source URLs respond
and still match the expected page/RSS structure. It records live byte counts and
hashes but does not expect the event count to remain fixed.

## Browser checks

- all four views load;
- the displayed counts match the generated report;
- a problem includes side-by-side source evidence;
- calendar-ready and held-for-review counts match the report;
- the downloaded summary bytes match the displayed summary;
- the refresh workflow completes;
- desktop and mobile pages have no horizontal overflow outside tables;
- no browser console error is recorded.

No synthetic incident, maintenance, user, adoption, or business-outcome record
is accepted into the product. The verification report records the exact current
test count instead of relying on a hard-coded number.
