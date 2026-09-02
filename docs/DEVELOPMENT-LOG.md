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
