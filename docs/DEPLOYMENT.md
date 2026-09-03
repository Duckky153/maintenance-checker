# Public demo deployment

## Target

- Repository: `Duckky153/maintenance-checker`
- Site: `https://duckky153.github.io/maintenance-checker/`
- Hosting: GitHub Pages using GitHub Actions

## One-time owner-controlled setup

1. Create the public GitHub repository named `maintenance-checker`.
2. Add it as this repository's `origin` and push `main`.
3. In **Settings → Pages**, select **GitHub Actions** as the source.
4. Run **Deploy public demo** once from the Actions tab.
5. Open the published URL and check Notices, Needs review, Calendar, Summary,
   both downloads, and at least one original-source link.

Repository creation, pushing, and enabling Pages are external actions and require
the owner's separate approval.

## Ongoing behavior

The workflow runs after each push, on manual request, and every six hours. It
installs dependencies and Chromium, captures both public CoreWeave status
sources, runs all automated and browser checks, and deploys `site/` only after a
passing run. GitHub Pages retains the last successful deployment if a later
source refresh or verification fails.

The public site is intentionally read-only. It uses the validated static report,
hides the server-only refresh button, and still supports source review and both
downloads. Local `npm run serve` retains the working refresh API.
