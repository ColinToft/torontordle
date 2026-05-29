# Torontordle

Daily diagnosis-guessing game for U of T med students — a clinical-reasoning take on Wordle/Doctordle.

Live: <https://colintoft.com/torontordle/>

## How to play

You're given **one symptom** to start. Type a working diagnosis and submit. Each incorrect guess reveals one new clinical clue. You have **six** guesses. When the case closes, you're asked how you'd manage the patient — jot it down and compare against a model answer. New case at midnight ET.

## Stack

- Vite + React + TypeScript (static SPA)
- Source Serif Pro via Google Fonts
- localStorage for daily progress and aggregate stats
- Hosted on GitHub Pages at `colintoft.com/torontordle/`

## Develop

```bash
npm install
npm run dev   # http://localhost:5173/torontordle/
npm run build # → dist/
npm test      # run the sheet-parser test suite (vitest)
```

## Diagnosis bank (Google Sheet)

Cases are sourced live from a Google Sheet. Sheet ID is in `src/sheet.ts`.

**Sharing requirement:** the sheet must be set to *Anyone with the link → Viewer* (or *Publish to web → CSV*) for the gviz CSV endpoint to be reachable from the browser. If it's private, the page shows a load error.

The case shown on a given date is `hash(YYYY-MM-DD) % cases.length` — deterministic, so every visitor sees the same case that day.

### Sheet schema

The parser locates the header row automatically (any preamble or scratch tables above it are ignored — the real header is the one row that has *both* a `Diagnosis` cell and a `Clue 1…` cell), then matches columns case-insensitively **by prefix**, so trailing annotations in the title are fine.

| column                | required | notes |
| --- | --- | --- |
| `Diagnosis?` (or `Diagnosis`) | yes | The full string is the displayed answer. For `Trisomy 21 (Down Syndrome)`, both the stem (`Trisomy 21`) and the parenthetical (`Down Syndrome`) are added as accepted aliases. |
| `Clue 1` … `Clue 6`   | at least 1 | Clue body. Up to 8 clues supported. Header may carry an annotation, e.g. `Clue 1 (most typical chief complaint; broad)`. |
| `Week` (or `Category`)| no       | Shown in the case header (e.g., `Immunology II`). **Filled only on the first row of each week block** — the value is carried down to the blank rows beneath it. Defaults to `General`. |
| `Aliases`             | no       | Pipe- or semicolon-separated alternates accepted as correct guesses. |
| `Description`         | no       | Short study note shown to the player after the case ends (win or lose). |
| `Management?` (or `Management`) | no | Model answer for the post-case management step. When present, the player is asked how they'd manage the patient (free text), then reveals this answer to self-compare. |
| a `"drop down"` description column | no | Caption for the clue **immediately to its left** (associated by position — e.g. an imaging caption after `Clue 5`). Rendered as a collapsed "Show detail" disclosure. A trailing `Retrieved from <DOI\|URL>` is split off into an inline `Reference ↗` link (bare DOIs resolve via doi.org). |
| `Clue 1 type` … `Clue 6 type` | no | Optional small-caps label per clue (e.g., `Vitals`, `Imaging`). |

Rows missing a diagnosis or all clues are skipped (so diagnosis-only stub rows in a work-in-progress sheet are simply not yet playable).

### Image clues (imaging / pathology)

Some clue cells hold an **in-cell image** (a radiograph, karyotype, histology slide) rather than text. In-cell images can't be fetched via the gviz CSV or the Sheets API, so they're pulled in a build-time step:

```bash
npm run sync-images   # exports the sheet, extracts in-cell images, writes assets + manifest
```

This authenticates with Google (reads `token.json`; defaults to the `google-docs-mcp` creds path, override with `GOOGLE_OAUTH_TOKEN`), exports the sheet as XLSX, reads each image's anchor cell, and maps it to a **diagnosis + clue number**. It writes the images to `public/case-images/` and a manifest to `src/caseImages.json` (keyed `{ [diagnosis]: { [clueNumber]: path } }`), both committed.

At runtime, text stays **live via CSV**; `parseSheetCsv` merges the committed manifest by diagnosis (stable across row reordering) and the app renders the image inline. A clue with no synced image just shows its text/caption — never a broken image.

#### Automatic nightly sync

You don't normally need to run the sync by hand. The workflow at `.github/workflows/sync-images.yml` runs it **nightly** (07:00 UTC) and on demand (Actions tab → *Sync image clues* → *Run workflow*, i.e. `workflow_dispatch`). It re-runs the sync, commits `public/case-images/` + `src/caseImages.json` only if they changed, then builds and redeploys to Pages in the same job.

> Why deploy in the same workflow? A commit pushed by the default `GITHUB_TOKEN` does **not** trigger `deploy.yml` (GitHub blocks workflow-triggering-workflow to avoid loops), so this workflow handles the build + deploy itself rather than relying on a separate PAT secret.

**One-time setup (required before the automation works):** add a GitHub Actions secret named `GOOGLE_OAUTH_TOKEN_JSON` (repo → Settings → Secrets and variables → Actions) containing the OAuth creds JSON the sync uses. The script parses it inline when that env var is set; otherwise it falls back to the local `token.json` file.

For CI, **strongly prefer a dedicated read-only Google service account** over a personal refresh token:

- **Recommended — service account (read-only):** create a service account in Google Cloud, enable the Drive + Sheets APIs, download its key JSON, and share *just this sheet* with the service-account email as **Viewer**. Store that key JSON in the secret. (Scope CI access to exactly this sheet, nothing else in your Drive.)
- **Alternative — personal OAuth token:** paste the same `client_id` / `client_secret` / `refresh_token` JSON the local sync uses. Simpler, but it grants CI your personal Drive scope, so it's less safe.

To run the sync manually after a sheet change, you can still: `npm run sync-images` then push (or just trigger the workflow).

## Deploy

Push to `main`. The GitHub Actions workflow at `.github/workflows/deploy.yml` builds with `npm run build`, uploads `dist/`, and publishes to GitHub Pages. The custom domain `colintoft.com` is inherited from `ColinToft/ColinToft.github.io`, so the project site lives at `colintoft.com/torontordle/`.

The `base: '/torontordle/'` in `vite.config.ts` is what makes asset URLs resolve correctly under the subpath.

## Credits

Design handoff (look, layout, copy) by the Torontordle design team.
