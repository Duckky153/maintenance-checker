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
