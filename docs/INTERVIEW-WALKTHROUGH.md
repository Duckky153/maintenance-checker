# Interview walkthrough

## Thirty-second explanation

“Maintenance information can appear in a title, structured fields, and later
updates. I built a small checker against CoreWeave's public status records. It
keeps the source text, compares the fields, flags differences for human review,
holds ambiguous records out of the calendar, and exports a handoff summary. I
used a dated real-data snapshot for repeatable tests and separately check that
the live sources still match the expected structure.”

## Two-minute demonstration

1. Open **Notices** and show the source link, structured window, location, and
   status on one row.
2. Open **Problems found** and explain one real field comparison. State that the
   checker requests human review rather than declaring the source wrong.
3. Open **Calendar** to show that high-severity conflicts are held for review
   instead of being silently carried forward.
4. Open **Summary** and download the handoff file.
5. Explain the evidence boundary: public records only, preserved raw captures,
   hashes, and no claim of CoreWeave affiliation or internal access.

## Defensible tradeoffs

- A rule-based validator is transparent and testable for this narrow task.
- Archived real records make tests repeatable; a separate live check detects
  source availability without making brittle count assumptions.
- Original and normalized values are stored separately so normalization never
  overwrites the evidence.
- A person remains responsible for checking the original notice and deciding
  whether a finding changes the handoff.
- A date-only extension remains date-only. The checker does not invent a time.
- Refreshes are staged and validated before replacing the last verified raw
  capture or generated output.

## Questions that require an explicit boundary

### How did you validate the user need?

I did not interview CoreWeave employees. I treated an operations coordinator as
a demonstration user and grounded the workflow in inconsistencies present in
the public records. The project validates the workflow technically; it does not
claim internal user validation.

### What impact did it have?

There is no adoption, time-saved, or error-reduction result. The measured output
is the number of real public notices processed, findings produced, records held
from the calendar, automated tests passed, and browser checks passed.

### Is this an internal data-center tool?

No. It is a local portfolio project using public customer-facing status data.
It demonstrates requirements, evidence preservation, validation, human review,
documentation, and failure handling. It does not demonstrate a DCIM, ITSM, CMMS,
asset-management, or work-order integration.

### Why rules instead of an AI model?

The checks compare narrow fields and dates. Deterministic rules are transparent,
repeatable, and easy to trace to source evidence. An AI model would add cost and
uncertainty without improving this bounded task.

### What failed, and what changed?

The first version gave a date-only extension an invented 11:59:59 PM end time
and allowed high-conflict records into the calendar. An adversarial review found
both problems. The revised version preserves the date-only fact, quarantines
high-severity records, validates live source structure and hashes, stages
refreshes, and tests 409 and 502 failure responses.

### What would you do next?

Interview real operations users, map the existing process and systems, identify
the authoritative fields, design an approved DCIM or ITSM integration, test with
representative users, and measure adoption, time to prepare a handoff, corrected
errors, and solution health.

## Interview safety rule

Do not claim internal access, employee feedback, production use, adoption,
business impact, or implementation details that you cannot personally explain.
