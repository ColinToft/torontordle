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
| `Clue 1 type` … `Clue 6 type` | no | Optional small-caps label per clue (e.g., `Vitals`, `Imaging`). |

Rows missing a diagnosis or all clues are skipped (so diagnosis-only stub rows in a work-in-progress sheet are simply not yet playable).

> **Not yet wired up:** the live sheet also has per-clue imaging/pathology "drop-down" description columns (with references). These are parsed-around for now; surfacing them as expandable clue references is the next phase.

## Deploy

Push to `main`. The GitHub Actions workflow at `.github/workflows/deploy.yml` builds with `npm run build`, uploads `dist/`, and publishes to GitHub Pages. The custom domain `colintoft.com` is inherited from `ColinToft/ColinToft.github.io`, so the project site lives at `colintoft.com/torontordle/`.

The `base: '/torontordle/'` in `vite.config.ts` is what makes asset URLs resolve correctly under the subpath.

## Credits

Design handoff (look, layout, copy) by the Torontordle design team.
