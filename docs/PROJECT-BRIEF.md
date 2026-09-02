# Project brief

## Problem

Maintenance notices contain information in several places: title, schedule,
location, component, description, and later updates. A person scanning many
notices can miss an extension, compare differently formatted location codes, or
carry the wrong field into a handoff.

## Demonstration user

The workflow is designed around an operations coordinator preparing the next
maintenance summary from public status notices. This is a portfolio scenario,
not a user persona validated through CoreWeave employee interviews.

## Evidence for the problem

The archived public records contain a real location disagreement, an extension
that is not reflected in the structured schedule, overlapping windows at the
same normalized site, and an incident that returned to investigating after
monitoring. Those records establish that the checker has real cases to process.
They do not establish how CoreWeave's internal Data Center Operations team
currently performs this work.

## Input

The live CoreWeave status page and its public RSS feed.

## Output

- normalized notice list;
- field-level validation findings;
- calendar grouped by day, with blocking records held for review;
- downloadable maintenance summary with source links.

## Acceptance criteria

1. No invented operating record appears in the product.
2. Every notice links to its original public record.
3. The checker retains raw and normalized values separately.
4. A location disagreement is shown with both source values.
5. Extensions and lifecycle updates remain visible.
6. Overlapping windows are reported only when dates and locations support them.
7. The summary can be understood without reading the implementation.
8. Automated tests and browser checks reproduce the displayed results.
9. A successful HTTP response is rejected if expected source structure is
   missing, the manifest does not match the captured bytes, or no recognizable
   records can be parsed.
10. A failed refresh leaves the last verified product output available.

## Out of scope

- CoreWeave's internal DCIM, ITSM, CMMS, telemetry, work orders, or asset data;
- employee interviews, stakeholder requirements, or user-feedback claims;
- production deployment, adoption, time-saved, or error-reduction claims;
- automated correction of a public notice or external system writeback.
