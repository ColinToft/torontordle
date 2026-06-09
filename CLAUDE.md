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
- `scripts/sync-data.ts` — the only thing that reads the sheet (holds `SPREADSHEET_ID`). Bakes **both year tabs** (gid 0 = Year 1, gid 1808332748 = Year 2): exports the workbook (XLSX), extracts in-cell images → `public/case-images/` (Year 2 files prefixed `y2-` to avoid collisions), parses clue text from each tab's CSV via `parseSheetCsv`, attaches images per-clue, writes `src/cases.json` as `{ "1": TCase[], "2": TCase[] }`. Fails loudly if an image can't be attached. Pure-JS XLSX helpers in `scripts/syncImagesLib.mjs`.
- `src/sheet.ts` — **parser only** (`parseSheetCsv`): header auto-located, columns matched by prefix; reads the optional `Unlock date` column (carried down per week like Week → `TCase.unlockDate`). **Canonical sheet schema lives here.** Shared by the sync (via `tsx`) and tests. No fetch, no sheet ID.
- `src/cases.json` — the baked bank, **per year** (generated; committed). `src/App.tsx` imports it, owns the active **year** (localStorage, default `'1'`) + Archives state, resolves the day's case, and guards the empty case.
- `src/dailyCase.ts` — the deterministic **scheduler**. `buildSchedule(cases, year, today)` replays launch→today: pool = unlocked (unlockDate ≤ day or null) minus used, resetting when exhausted (repeats resume — the "summer/bank" behavior); current week (latest unlock date ≤ today) weighted ×1.5. `caseForDate` = a single day. Same for everyone. With no unlock dates it degrades to a no-repeat cycle. "Day NNN" badge from `LAUNCH_DATE_ET`.
- `src/useGame.ts` — game-state hook, takes the resolved `tCase`, `year`, and `{ dateStr, archive }`. **Archive mode** = practice replay: separate progress slot, never records stats.
- `src/GameView.tsx` — UI (header: About / How to Play / Stats / **Year 1 | Year 2** toggle / **Archives**; archive banner + ArchivesModal).
- `src/storage.ts` — localStorage, **namespaced per year** (`torontordle:y<1|2>:…`): daily + archive progress, aggregate `Stats` (**per-device only**; no server data).
- `src/share.ts` — Wordle-style share grid (🟩 right / 🟥 miss / ⬛ unused). `src/types.ts` — core types (`TCase`, `CasesByYear`, `Year`).

## Gotchas
- All cases (incl. answers) ship in `cases.json` since day-selection is client-side — baking hides the *sheet*, not future answers (that'd need a per-request backend).
- The sheet must stay "Anyone with link → Viewer" — the sync reads its CSV. (It's never read by the browser, only by `sync-data` in CI.)
- Do **not** use `drive.files.export` for the XLSX — it 10 MB-caps and the sheet is ~24 MB. Use the `docs.google.com/.../export?format=xlsx` endpoint.
- Stats/progress are localStorage-only today — cross-user comparison would need a backend.

## Roadmap
Planned work lives in the **"Plan for Torontordle"** Google Doc:
<https://docs.google.com/document/d/1lyxqfa2xXlfUwqiZsCou2rqz6HVxGuqFQTR53-XYco4/edit>
Done: About, contact, share rebrand, baked-data architecture, **Year 1/2 switcher, progressive unlock (dormant until dates set), 1.5× current-week weighting, no-repeat scheduling, Archives**.
Still open: the **`Unlock date` column** needs adding to each year tab (first row of each week block, YYYY-MM-DD; carried down) — until then unlock/weighting are inert. And **cross-user comparative stats** (the "top N% today" banner) still needs a backend.
