# Torontordle community-stats backend

A tiny Cloudflare Worker + D1 database that powers the cross-user "you were in
the top N% today" stat. Free-tier sized (Workers + D1; no Durable Objects, no KV).

- `src/index.ts` — the Worker (`/submit`, `/stats`).
- `schema.sql` — the D1 table.
- `wrangler.toml` — config.

**Deployed** (cwt1078 account) at <https://torontordle-stats.torontordle.workers.dev>.
The client talks to it from `src/statsApi.ts`; failures are swallowed, so the
game works fine whether or not this is reachable.

> Why `workers.dev` and not `api.torontordle.com`? A Worker custom domain must
> live in the same account as the `torontordle.com` zone (the *Hatolkarved*
> account), but this Worker + its D1 are in the *cwt1078* account. The
> `workers.dev` URL is fine — it's an API, never seen by users (CORS allows the
> torontordle.com origin).

## Redeploy / maintenance

**Run these from this `workers/` directory** (running `wrangler deploy` from the
repo root will try to deploy the React app as a Worker — don't):

```bash
npx wrangler deploy                                              # ship code changes
npx wrangler d1 execute torontordle-stats --remote --file=./schema.sql   # (re)apply schema
npx wrangler d1 execute torontordle-stats --remote --command "SELECT COUNT(*) FROM results"
```

## Local dev

```bash
npx wrangler dev          # serves on http://localhost:8787
npx wrangler d1 execute torontordle-stats --local --file=./schema.sql
```

Point the client at it with `VITE_STATS_API=http://localhost:8787 npm run dev`.
