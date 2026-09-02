# Test plan

## Deterministic evidence

The automated tests use the archived September 2, 2026 capture of CoreWeave's
real public status page and RSS feed. They verify provenance, parsing, event
merging, extension detection, field conflicts, lifecycle history, calendar
generation, and summary links.

## Live checks

The verification run separately confirms that both public source URLs respond.
It does not expect the live event count to remain fixed.

## Browser checks

- all four views load;
- the displayed counts match the generated report;
- a problem includes side-by-side source evidence;
- the calendar and summary contain source-backed records;
- the summary download works;
- the refresh workflow completes;
- desktop and mobile pages have no horizontal overflow outside tables;
- no browser console error is recorded.

No synthetic incident, maintenance, user, adoption, or business-outcome record
is used in the product or test suite.
