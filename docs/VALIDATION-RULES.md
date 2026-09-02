# Validation rules

The checker does not decide that a notice is wrong. It identifies source fields
that need a person to review before the information is handed off.

| Check | Trigger | Evidence shown |
|---|---|---|
| Location conflict | Title and location field name different base location codes | Both exact location codes |
| Local/UTC time conflict | A stated Eastern Time and UTC pair is not four or five hours apart | Both stated times |
| Extension not in schedule | An update extends work beyond the structured end date | Update date and schedule date |
| Handoff fields missing | A public maintenance record has no structured schedule, component, location, or description | Missing field names |
| Invalid window | Parsed end is not later than parsed start | Both timestamps |
| Active after end | Active notice is beyond its stated end without a current parsed extension | Schedule end |
| Returned to investigating | An incident update moves from Monitoring back to Investigating | Full status sequence |
| Overlapping windows | Active or upcoming maintenance windows overlap under the same base location code | Both windows and location code |

Suffix detail such as `US-EAST-04` and `US-EAST-04A` shares one base location
code. Different numbered locations remain distinct even when they share a broad
region. Normalization only standardizes spacing, capitalization, and zero-padded
location numbers. The original title, description, schedule text, and source
URL remain in the generated report.

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
- at least one recognizable event is parsed from each source;
- every parsed event has an identifier, title, and approved public source host;
- a source cannot contain conflicting records under the same identifier.
