# Torontordle

Daily diagnosis-guessing game for preclerkship students in Toronto — a clinical-reasoning take on Wordle/Doctordle.

Live: <https://torontordle.com>

## How to play

You're given **one symptom** to start. Type a working diagnosis and submit. Each incorrect guess reveals one new clinical clue. You have **six** guesses. When the case closes, you're asked how you'd manage the patient — jot it down and compare against a model answer. New case at midnight ET.

## Stack

- Vite + React + TypeScript (static SPA)
- Source Serif Pro via Google Fonts
- localStorage for daily progress and aggregate stats
- Hosted on GitHub Pages at the custom apex domain `torontordle.com`

## Develop

```bash
npm install
npm run dev       # http://localhost:5173/
npm run build     # → dist/
npm test          # parser/share/reference test suite (vitest)
npm run sync-data # re-bake src/cases.json + images from the sheet (needs creds)
```

## Diagnosis bank (Google Sheet)

Cases — clue text **and** in-cell images — are **baked at build time** from a Google Sheet into `src/cases.json` (committed) by `scripts/sync-data.ts`. The app imports that JSON directly; **the client never reads the sheet**, so the sheet ID lives only in the sync script. Content edits go live only after a sync runs (nightly, or *Run workflow* on demand) — there's no live read.

**Sharing requirement:** the sheet must stay *Anyone with the link → Viewer* — the sync reads its CSV (and exports its XLSX for images). It's only ever read by `sync-data` in CI, never by the browser.

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

Some clue cells hold an **in-cell image** (a radiograph, karyotype, histology slide) rather than text. In-cell images can't be read via the CSV or the Sheets API, so the sync extracts them from the workbook's XLSX export and attaches them to their clue — all part of the one build-time bake (`npm run sync-data`).

`scripts/sync-data.ts` authenticates with Google (reads `token.json`; defaults to the `google-docs-mcp` creds path, override with `GOOGLE_OAUTH_TOKEN`), exports the sheet as XLSX, maps each image's anchor cell to a **diagnosis + clue number**, downscales it to ≤1200px JPEG (quality 82) via `sharp`, and writes `public/case-images/`. It then parses the clue text from the CSV (`parseSheetCsv`), attaches the images per-clue, and writes the complete `src/cases.json`. Because text and images come from the **same snapshot**, an image always lands on its clue — and the run **fails** if any extracted image can't be matched to a case (catching diagnosis renames). Assets no longer in the sheet are pruned. A clue with no image just shows its text/caption — never a broken image.

#### Automatic nightly sync

You don't normally run the sync by hand. The workflow at `.github/workflows/sync-data.yml` runs it **nightly** (07:00 UTC) and on demand (Actions tab → *Sync diagnosis data* → *Run workflow*). It re-bakes the data, commits `public/case-images/` + `src/cases.json` only if they changed, then builds and redeploys to Pages in the same job.

> Why deploy in the same workflow? A commit pushed by the default `GITHUB_TOKEN` does **not** trigger `deploy.yml` (GitHub blocks workflow-triggering-workflow to avoid loops), so this workflow handles the build + deploy itself rather than relying on a separate PAT secret.

**One-time setup:** a GitHub Actions secret named `GOOGLE_OAUTH_TOKEN_JSON` (repo → Settings → Secrets and variables → Actions) holds the OAuth creds JSON the sync uses. The script parses it inline when that env var is set; otherwise it falls back to the local `token.json` file.

To push a content change live: edit the sheet, then trigger the workflow (or run `npm run sync-data` locally and push).

## Deploy

Push to `main`. The GitHub Actions workflow at `.github/workflows/deploy.yml` builds with `npm run build`, uploads `dist/`, and publishes to GitHub Pages. The site is served at the custom apex domain **`torontordle.com`**.

The custom domain is set by `public/CNAME` (copied verbatim into `dist/` at build time, which is how GitHub Pages picks it up). DNS lives in Cloudflare (the `torontordle.com` zone): apex `A`/`AAAA` records point at GitHub Pages' IPs and `www` is a `CNAME` to `colintoft.github.io`, all **DNS-only** (unproxied) so GitHub can provision the Let's Encrypt certificate. `base: '/'` in `vite.config.ts` is what makes asset URLs resolve at the domain root.

## Credits

Design handoff (look, layout, copy) by the Torontordle design team.
