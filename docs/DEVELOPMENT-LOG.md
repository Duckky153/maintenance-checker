# Development log

## September 2, 2026: real-data baseline

- Captured the public CoreWeave status page and RSS feed with URLs, retrieval
  time, byte counts, and SHA-256 hashes.
- Parsed the archived capture into maintenance and incident records.
- Added traceable validation findings, a calendar view, a downloadable summary,
  automated tests, and browser checks.

## September 2, 2026: adversarial hardening

The interview-defensibility review found four material weaknesses in the first
version:

1. A high-severity source conflict could still flow into the calendar.
2. A date-only extension was converted into an invented end-of-day timestamp.
3. Live verification checked HTTP 200 without checking the returned structure.
4. Refresh failure and concurrency behavior existed but lacked direct tests.

Changes made from that review:

- added a calendar readiness gate and a visible held-for-review queue;
- preserved extension dates without inventing an end time;
- added page, RSS, manifest, hash, parsed-record, identifier, source-host, and
  duplicate-identifier contracts;
- staged live refreshes before promoting the new raw capture;
- preserved the last verified output when capture or validation fails;
- added direct 502 validation-failure and 409 concurrent-refresh tests;
- changed browser verification to complete a real summary download and compare
  its bytes with the displayed summary;
- made the verification report derive its automated-test count from the test
  runner rather than a hard-coded claim.

This log records actual repository changes. It does not represent user research,
deployment, adoption, or operational impact.

## September 2, 2026: release-readiness pass

Five independent audits checked job-description fit, data validity, technical
release behavior, interview defense, and user-interface clarity. The pass found
and corrected an overly broad location comparison, an unflagged impossible
ET/UTC time pair in a real notice, invalid-date rollover, stale extension logic,
partial refresh promotion, parser failure masking, and a malformed-path server
crash. It also added a read-only JSON report, structured health response,
calendar-ready `.ics` export, archived refresh captures, mobile notice cards,
plain review labels, and a readable summary preview.

The result is a local portfolio prototype with a documented handoff boundary.
It is not described as a production CoreWeave deployment or an existing
connection to internal systems.

## September 3, 2026: public-demo readiness

- added a static data fallback and repository-relative assets and downloads;
- hid the local refresh control when the server API is unavailable;
- added a GitHub Pages workflow that refreshes, verifies, and deploys on a
  schedule while retaining the last successful release after a failed run;
- added a browser check that runs the site under the intended repository path
  with no API;
- moved the live refresh before screenshots so displayed counts and verification
  evidence come from the same source capture;
- removed duplicated generated-at and lifecycle labels from the visible
  dashboard while keeping source freshness and review state visible.

These changes prepare a public release but do not create a repository or publish
the site.
