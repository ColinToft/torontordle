# Torontordle community-stats backend

A tiny Cloudflare Worker + D1 database that powers the cross-user "you were in
the top N% today" stat. Free-tier sized (Workers + D1; no Durable Objects, no KV).

- `src/index.ts` — the Worker (`/submit`, `/stats`).
- `schema.sql` — the D1 table.
- `wrangler.toml` — config. Serves at `api.torontordle.com`.

The client talks to it from `src/statsApi.ts`; failures are swallowed, so the
game works fine whether or not this is deployed.

## Deploy (one-time)

From this `workers/` directory:

```bash
# 1. Log in (interactive — opens a browser; choose the account that owns
#    torontordle.com so the api.torontordle.com custom domain can bind).
npx wrangler login

# 2. Create the D1 database, then paste the printed database_id into wrangler.toml.
npx wrangler d1 create torontordle-stats

# 3. Apply the schema (remote).
npx wrangler d1 execute torontordle-stats --remote --file=./schema.sql

# 4. Deploy.
npx wrangler deploy
```

`api.torontordle.com` is created automatically (proxied DNS + cert) since the
zone lives in this Cloudflare account. After deploy, the site's stats banner
lights up on the next visit.

## Local dev

```bash
npx wrangler dev          # serves on http://localhost:8787
npx wrangler d1 execute torontordle-stats --local --file=./schema.sql
```

Point the client at it with `VITE_STATS_API=http://localhost:8787 npm run dev`.
