# User guide

1. Run `npm run fetch` to capture the current public status page and RSS feed.
2. Run `npm run build` to parse, validate, and generate the browser data.
3. Run `npm run serve`, then open `http://127.0.0.1:4180`.
4. Review **Problems found** first. Each item shows the source fields side by side.
5. Confirm the original notice before carrying a flagged value forward.
6. Review **Calendar** for active and upcoming maintenance.
7. Download **Summary** for the handoff.

The **Refresh from source** button performs the first two steps while the local
server is running. It does not write to an external system.
