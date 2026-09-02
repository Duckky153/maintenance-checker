# Validation rules

The checker does not decide that a notice is wrong. It identifies source fields
that need a person to review before the information is handed off.

| Check | Trigger | Evidence shown |
|---|---|---|
| Location conflict | Title and location field name different regions | Both exact location codes |
| Extension not in schedule | An update extends work beyond the structured end date | Update date and schedule date |
| Required fields missing | A public maintenance record has no structured schedule, component, location, or description | Missing field names |
| Invalid window | Parsed end is not later than parsed start | Both timestamps |
| Active after end | Active notice is beyond its stated end without a parsed extension | Schedule end |
| Returned to investigating | An incident update moves from Monitoring back to Investigating | Full status sequence |
| Overlapping windows | Active or upcoming maintenance windows overlap at the same site | Both windows and site |

Expected differences in site suffix detail are normalized rather than reported
as problems. Overlap checks require the same site, not merely the same broad
region. Normalization only standardizes spacing, capitalization, and zero-padded
site numbers. The original title, description, schedule text, and source URL
remain in the generated report.

## Calendar readiness gate

An active or upcoming maintenance record is held out of the calendar when it
has a high-severity finding, lacks a complete parseable window, has an invalid
window, or has no location. Held records remain visible with their source link
and exact reason. An extension that states only a date remains a date-only fact;
the checker does not invent an end time.

## Source contract

A refresh must pass all of these checks before the captured files are promoted:

- both expected public URLs return successfully;
- the page and RSS bodies contain the expected document and CoreWeave markers;
- the manifest URL, byte count, filename, and SHA-256 hash match each body;
- at least one recognizable event is parsed;
- every parsed event has an identifier, title, and approved public source host;
- a source cannot contain conflicting records under the same identifier.
