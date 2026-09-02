# Project brief

## Problem

Maintenance notices contain information in several places: title, schedule,
location, component, description, and later updates. A person scanning many
notices can miss an extension, compare differently formatted location codes, or
carry the wrong field into a handoff.

## User

An operations coordinator preparing the next maintenance summary from public
status notices.

## Input

The live CoreWeave status page and its public RSS feed.

## Output

- normalized notice list;
- field-level validation findings;
- calendar grouped by day;
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
