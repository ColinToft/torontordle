# Torontordle

Daily diagnosis-guessing game for U of T med students — a clinical-reasoning take on Wordle/Doctordle.

Live: <https://colintoft.com/torontordle/>

## How to play

You're given **one symptom** to start. Type a working diagnosis and submit. Each incorrect guess reveals one new clinical clue. You have **six** guesses. New case at midnight ET.

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
```

## Diagnosis bank (Google Sheet)

Cases are sourced live from a Google Sheet. Sheet ID is in `src/sheet.ts`.

**Sharing requirement:** the sheet must be set to *Anyone with the link → Viewer* (or *Publish to web → CSV*) for the gviz CSV endpoint to be reachable from the browser. If it's private, the game silently falls back to the bundled vignettes in `src/cases.ts`.

The case shown on a given date is `hash(YYYY-MM-DD) % cases.length` — deterministic, so every visitor sees the same case that day.

### Sheet schema

The parser locates the header row automatically (preamble rows above it are ignored), then matches columns case-insensitively.

| column                | required | notes |
| --- | --- | --- |
| `Diagnosis?` (or `Diagnosis`) | yes | Canonical diagnosis. A trailing parenthetical like `(PE)` is auto-extracted as an alias. |
| `Clue 1` … `Clue 6`   | at least 1 | Clue body. Up to 8 clues supported. |
| `Week` (or `Category`)| no       | Shown in the case header (e.g., `Immunology II`). Defaults to `General`. |
| `Aliases`             | no       | Pipe- or semicolon-separated alternates accepted as correct guesses. |
| `Difficulty`          | no       | `MS1` / `MS2` / `MS3` / `MS4`. Defaults to `MS2`. |
| `Clue 1 type` … `Clue 6 type` | no | Optional small-caps label per clue (e.g., `Vitals`, `Imaging`). |

Rows missing a diagnosis or all clues are skipped.

## Deploy

Push to `main`. The GitHub Actions workflow at `.github/workflows/deploy.yml` builds with `npm run build`, uploads `dist/`, and publishes to GitHub Pages. The custom domain `colintoft.com` is inherited from `ColinToft/ColinToft.github.io`, so the project site lives at `colintoft.com/torontordle/`.

The `base: '/torontordle/'` in `vite.config.ts` is what makes asset URLs resolve correctly under the subpath.

## Credits

Design handoff (look, layout, copy) by the Torontordle design team. Bundled fallback cases are fictional teaching vignettes from the handoff and should not be used clinically.
