-- D1 schema for Torontordle community stats.
-- One row per finished daily game. Anonymous: `client` is a random id generated
-- in the browser (localStorage), used only to dedupe resubmissions. No PII.
CREATE TABLE IF NOT EXISTS results (
  year       TEXT    NOT NULL,           -- '1' | '2'
  date       TEXT    NOT NULL,           -- YYYY-MM-DD (ET)
  diagnosis  TEXT    NOT NULL,           -- the case shown that day
  won        INTEGER NOT NULL,           -- 1 = solved, 0 = lost
  guesses    INTEGER NOT NULL,           -- attempts used (1..6)
  client     TEXT    NOT NULL,           -- anonymous browser id (dedupe only)
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One submission per browser per day per year (resubmissions are ignored).
CREATE UNIQUE INDEX IF NOT EXISTS results_unique ON results (year, date, client);
-- Fast aggregate lookups for a given case/day.
CREATE INDEX IF NOT EXISTS results_case ON results (year, date, diagnosis);
