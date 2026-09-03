# User guide

1. Run `npm run fetch` to capture the current public status page and RSS feed.
2. Run `npm run build` to parse, validate, and generate the browser data.
3. Run `npm run serve`, then open `http://127.0.0.1:4180`.
4. Review **Needs review** first. Each item shows the source fields side by side.
5. Confirm the original notice before carrying a flagged value forward.
6. Review **Calendar** for records that passed the readiness gate. Records with
   blocking conflicts remain under **Held for review** and are not carried into
   the calendar.
7. Open **Summary** to read the handoff and download either the Markdown brief
   or the `.ics` file containing only calendar-ready records.

The **Refresh from source** button performs the first two steps while the local
server is running. It does not write to an external system. The refresh first
captures into a temporary location and validates the source structure, hashes,
and parsed records. A failed refresh does not replace the last verified product
output. Every successful refresh keeps a dated copy of the validated raw source
files.

On the public static demo, the checked source data loads automatically and the
refresh button is hidden. The scheduled deployment workflow owns public source
refreshes so a visitor cannot start or interrupt the capture process.
