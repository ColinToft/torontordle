# Torontordle

Daily diagnosis-guessing game (Wordle-style) for Toronto preclerkship med students. Static Vite + React + TypeScript SPA; cases are sourced live from a Google Sheet.

## Commands
- `npm run dev` — local dev (http://localhost:5173/)
- `npm run build` — typecheck + Vite build → `dist/`
- `npm test` — vitest (sheet parser, share, references)
- `npm run sync-images` — pull in-cell sheet images → `public/case-images/` + `src/caseImages.json`

## Deploy
- GitHub Pages at custom apex **torontordle.com** (DNS in Cloudflare, *Hatolkarved* account: A/AAAA → GitHub IPs + `www` CNAME, all **DNS-only**). `public/CNAME` sets the domain; `base:'/'` in `vite.config.ts`.
- Push to `main` → `.github/workflows/deploy.yml` builds + deploys.
- Nightly `.github/workflows/sync-images.yml` (07:00 UTC) re-syncs images, commits, redeploys. Needs the `GOOGLE_OAUTH_TOKEN_JSON` Actions secret.

## Architecture
- `src/sheet.ts` — fetches the sheet as CSV (gviz endpoint), parses → `TCase[]`. Header row auto-located; columns matched by prefix. **Canonical sheet schema lives here.** `SHEET_ID`/`SHEET_GID` too.
- `src/dailyCase.ts` — `pickDailyCase` = `hash(date) % cases.length` (deterministic; ET-midnight rollover via `todayET`). "Day NNN" badge from `LAUNCH_DATE_ET`.
- `src/useGame.ts` — game-state hook. `src/GameView.tsx` / `src/App.tsx` — UI (header has How to Play / Stats).
- `src/storage.ts` — localStorage daily progress + aggregate `Stats` (**per-device only**; no server data).
- `src/share.ts` — Wordle-style share grid (🟩 correct / ⬛ wrong / ⬜ skipped). `src/types.ts` — core types.
- Images: in-cell sheet images can't come via CSV; `scripts/sync-images.mjs` extracts them at build time. Pure-JS parser in `scripts/syncImagesLib.mjs` (browser-reusable).

## Gotchas
- Sheet must be "Anyone with link → Viewer" for the in-browser CSV fetch to work.
- Do **not** use `drive.files.export` for the XLSX — it 10 MB-caps and the sheet is ~24 MB. Download via the `docs.google.com/.../export?format=xlsx` endpoint instead.
- Stats/progress are localStorage-only today — cross-user comparison would need a backend.

## Roadmap
Planned work lives in the **"Plan for Torontordle"** Google Doc:
<https://docs.google.com/document/d/1lyxqfa2xXlfUwqiZsCou2rqz6HVxGuqFQTR53-XYco4/edit>
Covers: Year 1 / Year 2 sheets, progressive weekly unlock, no-repeat scheduling, summer mode, cross-user comparative stats, About section, contact email, and share rebrand.
