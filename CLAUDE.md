# Torontordle

Daily diagnosis-guessing game (Wordle-style) for Toronto preclerkship med students. Static Vite + React + TypeScript SPA. Cases (clue text **and** images) are **baked at build time** from a Google Sheet into `src/cases.json` — the client never touches the sheet.

## Commands
- `npm run dev` — local dev (http://localhost:5173/)
- `npm run build` — typecheck + Vite build → `dist/`
- `npm test` — vitest (sheet parser, share, references)
- `npm run sync-data` — re-bake the bank from the sheet → `src/cases.json` + `public/case-images/` (needs Google OAuth creds; `tsx scripts/sync-data.ts`)

## Deploy
- GitHub Pages at custom apex **torontordle.com** (DNS in Cloudflare, *Hatolkarved* account: A/AAAA → GitHub IPs + `www` CNAME, all **DNS-only**). `public/CNAME` sets the domain; `base:'/'` in `vite.config.ts`.
- Push to `main` → `.github/workflows/deploy.yml` builds + deploys.
- Nightly + on-demand `.github/workflows/sync-data.yml` (07:00 UTC, or *Run workflow*) re-bakes the data, commits if changed, redeploys. Needs the `GOOGLE_OAUTH_TOKEN_JSON` Actions secret. **Content edits go live only after a sync runs** — there's no live read.

## Architecture
- `scripts/sync-data.ts` — the only thing that reads the sheet (holds `SPREADSHEET_ID`). Exports the workbook (XLSX), extracts in-cell images → `public/case-images/`, parses clue text from the CSV via `parseSheetCsv`, attaches images per-clue, writes `src/cases.json`. Fails loudly if an image can't be attached to a case. Pure-JS XLSX helpers in `scripts/syncImagesLib.mjs`.
- `src/sheet.ts` — **parser only** now (`parseSheetCsv`): header auto-located, columns matched by prefix. **Canonical sheet schema lives here.** Shared by the sync (via `tsx`) and tests. No fetch, no sheet ID.
- `src/cases.json` — the baked bank (generated; committed). `src/App.tsx` imports it directly — no network, no loading state.
- `src/dailyCase.ts` — `pickDailyCase` = `hash(date) % cases.length` (deterministic; ET-midnight rollover via `todayET`). "Day NNN" badge from `LAUNCH_DATE_ET`.
- `src/useGame.ts` — game-state hook. `src/GameView.tsx` — UI (header: About / How to Play / Stats).
- `src/storage.ts` — localStorage daily progress + aggregate `Stats` (**per-device only**; no server data).
- `src/share.ts` — Wordle-style share grid (🟩 right / 🟥 miss / ⬛ unused). `src/types.ts` — core types.

## Gotchas
- All cases (incl. answers) ship in `cases.json` since day-selection is client-side — baking hides the *sheet*, not future answers (that'd need a per-request backend).
- The sheet must stay "Anyone with link → Viewer" — the sync reads its CSV. (It's never read by the browser, only by `sync-data` in CI.)
- Do **not** use `drive.files.export` for the XLSX — it 10 MB-caps and the sheet is ~24 MB. Use the `docs.google.com/.../export?format=xlsx` endpoint.
- Stats/progress are localStorage-only today — cross-user comparison would need a backend.

## Roadmap
Planned work lives in the **"Plan for Torontordle"** Google Doc:
<https://docs.google.com/document/d/1lyxqfa2xXlfUwqiZsCou2rqz6HVxGuqFQTR53-XYco4/edit>
Covers: Year 1 / Year 2 sheets, progressive weekly unlock, no-repeat scheduling, summer mode, cross-user comparative stats, About section, contact email, and share rebrand.
