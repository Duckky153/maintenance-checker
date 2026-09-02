# Maintenance Notice Checker

This project reads CoreWeave's public status page and RSS feed, checks each
maintenance notice for inconsistent locations, dates, times, extensions, missing
details, and overlapping windows, then produces a clean calendar and a
downloadable maintenance summary.

The checked-in records are public source captures, not invented operating data.
Each capture includes its source URL, retrieval time, and SHA-256 hash. The app
does not claim access to CoreWeave systems, employees, telemetry, or internal
procedures.

## Archived evidence

The September 2, 2026 snapshot contains 15 distinct public notices: 12
maintenance records and three incidents. It includes five upcoming maintenance
windows and four focused review cases. The saved cases cover an extension beyond
the structured end date, a title and location-field conflict, one same-site
overlap, and an incident that returned from monitoring to investigating.

## Run it

```bash
npm install
npm run fetch
npm run verify
npm run serve
```

Open `http://127.0.0.1:4180`.

## What to demonstrate

1. Open **Notices** to see the source records and update history.
2. Open **Problems found** to compare conflicting source fields.
3. Open **Calendar** to see maintenance grouped by date and location.
4. Open **Summary** to download the next-maintenance brief.

## Evidence boundary

- Source: `https://status.coreweave.com/`
- Feed: `https://status.coreweave.com/pages/5e126e998f2f032e1f8f0f4b/rss`
- Product data: public incidents and maintenance notices only
- Tests: captured real source records plus a live-source availability check
- Claims: parser, validation, calendar, summary, tests, and documentation
