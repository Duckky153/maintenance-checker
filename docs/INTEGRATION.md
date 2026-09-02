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
