# Interview walkthrough

## Thirty-second explanation

“Maintenance information can appear in a title, structured fields, and later
updates. I built a small checker against CoreWeave's public status records. It
keeps the source text, compares the fields, flags differences for human review,
creates a chronological calendar, and exports a handoff summary. I used a dated
real-data snapshot for repeatable tests and a separate live-source check.”

## Two-minute demonstration

1. Open **Notices** and show the source link, structured window, location, and
   status on one row.
2. Open **Problems found** and explain one real field comparison. State that the
   checker requests human review rather than declaring the source wrong.
3. Open **Calendar** to show how the same records become an operational view.
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
