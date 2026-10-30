# GitHub Pages deployment plan (H4N-6) — plan only

Nothing in this document has been done. No repository settings were changed, nothing was published,
no domain was registered, nothing was bought. Each step below needs Yunhan's explicit approval.

## Build output

There is no build step. The site is the repository root as committed:

```
index.html  styles.css  src/*.js  assets/fonts/*.woff2  (+ assets/fonts/OFL.txt)
```

`docs/`, `tests/` and `package.json` are harmless if served but could be excluded with the
Actions-based option below. Total payload ≈ 100 KB (fonts ≈ 43 KB), no third-party requests —
fonts are self-hosted, so the page makes no calls to Google or any CDN.

## Option A — deploy from a branch (simplest)

1. Repository → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
2. Add an empty `.nojekyll` file at the root so Pages serves files as-is.
3. URL: `https://opsdlc.github.io/afterhour/` (project site). All asset paths are relative, so the
   sub-path works without changes.

## Option B — GitHub Actions (only ship the site files)

`.github/workflows/pages.yml` using `actions/upload-pages-artifact` with a staging folder that copies
`index.html`, `styles.css`, `src/`, `assets/`; then `actions/deploy-pages`. Run `npm test` before the
upload so a failing simulation test blocks the deploy. Recommended once there is a second contributor.

## HTTPS

- `*.github.io` is always HTTPS. Keep **Enforce HTTPS** on.
- HTTPS is required, not optional: the microphone (`getUserMedia`) only works in a secure context.
- With a custom domain, Pages provisions a Let's Encrypt certificate after DNS resolves; enable
  **Enforce HTTPS** once it is issued (can take up to ~24 h).

## Custom domain — needed?

Not for the MVP: the github.io URL works, is HTTPS, and costs nothing. A domain matters for sharing
and press. Candidates (availability **not checked** — search-only check belongs to H4N-7):

| Domain | Notes |
| --- | --- |
| afterhour.app | `.app` is HSTS-preloaded (HTTPS-only), fits a web app |
| afterhour.art | fits an experimental piece |
| afterhour.rain / yeyu.(…) | if the 夜雨 persona leads |
| afterhour.studio / .site | cheaper fallbacks |

If a domain is approved: add `CNAME` file with the domain, apex `A`/`AAAA` records to GitHub Pages IPs
(or `CNAME` for a `www`/subdomain), verify the domain in the org settings to prevent takeover.

**Decision left to Yunhan.**
