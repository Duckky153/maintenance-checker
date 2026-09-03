# Local integration contract

Run `npm run serve`, then use these read-only local endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Current schema version, generation time, and record counts |
| `GET /api/report` | Full checked report as JSON |
| `GET /calendar.ics` | Calendar-ready maintenance only |
| `POST /api/refresh` | Fetch, validate, generate, archive, and atomically promote a new public-source capture |

`GET /api/report` currently returns schema version 2. Consumers should check
`schemaVersion` before reading `counts`, `events`, `findings`, `calendar`, and
`heldFromCalendar`. The `.ics` file contains only records that pass every
blocking calendar check; held records remain in the JSON and Markdown summary.

## Honest deployment boundary

This contract makes the prototype straightforward to run locally and connect
to another approved tool. It is not a production API: it has no authentication,
TLS, scheduler, shared database, user assignment, or internal CoreWeave system
connection. A real deployment would first confirm the authoritative internal
systems and security requirements with the responsible operations and
engineering teams.

## Static public mode

GitHub Pages serves the checked files in `site/` under the repository path and
without the local API. The browser loads `data.json` directly when it runs under
that path. The refresh control is hidden in this mode because a static page
cannot safely run the capture pipeline. Source links, the review workflow, the
Markdown summary, and the `.ics` calendar remain available.

The scheduled Pages workflow performs the source refresh and verification before
deployment. A failed run does not replace the last successful public artifact.
