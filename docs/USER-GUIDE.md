# Review a maintenance notice

Start with the [browser guide](https://duckky153.github.io/maintenance-checker/guide.html). It covers the complete review and handoff procedure without installing anything.

1. Check the capture date. Open **Needs review** and compare the source fields.
2. Read the latest update in the original notice. Leave conflicting values unresolved rather than choosing one.
3. Check **Calendar** and its held list. The export contains only active or upcoming maintenance that passes every blocking check.
4. Download the summary and calendar from **Summary**. Review both before handing them to someone else.

There is no manual approval control. A source correction must pass a later refresh before a held record becomes eligible for the calendar. The checker does not approve maintenance, send files or write to another calendar.

## If a refresh fails

The public site refreshes through its scheduled deployment. A failed run leaves the last successful site available. Check its capture date and the original source before relying on it.

The local **Refresh from source** button fetches and validates both sources before replacing the raw capture and generated outputs together. If it fails, the prior data remains visible. Check source availability, then retry. A failed refresh does not make the old export current.

For local setup and API details, see [Integration](INTEGRATION.md). For operator ownership and recovery, see [Deployment](DEPLOYMENT.md).

## Manual review compared with the checker

| Task | Without this checker | With this checker | Still requires judgment |
|---|---|---|---|
| Read updates | Open notices and compare titles, fields and updates. | Relevant source fields appear together with links to the originals. | Check whether the capture is recent enough. |
| Resolve conflicts | Notice inconsistent locations, times or extensions and record them. | Rules flag supported conflicts and hold blocking records. | Ask which source value is authoritative. |
| Prepare a schedule | Copy qualifying windows into a calendar. | Download the checked entries as an ICS file. | Confirm scope and destination before importing. |
| Handoff | Write a list of ready and unresolved notices. | Start from the generated summary. | Assign a reviewer and record any later decision outside this tool. |

This is a comparison of workflow steps, not a time-saving study. No employee use, adoption or measured reduction in effort is claimed.
