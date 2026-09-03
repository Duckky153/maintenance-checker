# Public demo deployment

## Target

- Repository: `Duckky153/maintenance-checker`
- Site: `https://duckky153.github.io/maintenance-checker/`
- Hosting: GitHub Pages using GitHub Actions

## Published state

The public repository and GitHub Pages site were enabled on September 3, 2026.
Deployment run `33811511955` passed the full workflow. A Chrome review then
confirmed Notices, Needs review, Calendar, Summary, original-source links, and
both downloads on the public URL.

## Ongoing behavior

The workflow runs after each push, on manual request, and every six hours. It
installs dependencies and Chromium, captures both public CoreWeave status
sources, runs all automated and browser checks, and deploys `site/` only after a
passing run. GitHub Pages retains the last successful deployment if a later
source refresh or verification fails.

The public site is intentionally read-only. It uses the validated static report,
hides the server-only refresh button, and still supports source review and both
downloads. Local `npm run serve` retains the working refresh API.
