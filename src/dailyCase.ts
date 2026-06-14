import type { FrozenDay, TCase } from './types'

// Launch date — used to derive the "Day NNN" badge in the header.
export const LAUNCH_DATE_ET = '2026-04-29'

// Returns YYYY-MM-DD for "today" in America/Toronto. The puzzle rolls at
// midnight ET, regardless of the visitor's local timezone.
export function todayET(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(now) // en-CA → YYYY-MM-DD
}

// Stable string hash → 32-bit unsigned int. Used to pick a daily case.
function hash32(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

// Add `days` to a YYYY-MM-DD date (UTC math), returning YYYY-MM-DD.
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  const dt = new Date(t)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

// Deterministic weighted choice: maps the seed into [0, totalWeight) and walks
// the cumulative weights. Same seed + same list → same pick, for everyone.
function weightedPick<T>(items: T[], weights: number[], seed: number): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = ((seed >>> 0) / 4294967296) * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r < 0) return items[i]
  }
  return items[items.length - 1]
}

const CURRENT_WEEK_WEIGHT = 1.5 // current block's cases come up 1.5× as often

export type ScheduledDay = { date: string; tCase: TCase }

// ---------------------------------------------------------------------------
// Frozen history model
//
// The schedule is split in two: days that have already happened are FROZEN in
// src/history.json (written by the sync) and never recomputed, and the current
// day (plus any not-yet-frozen tail) is computed LIVE here. Because a frozen day
// is read back verbatim, re-baking the bank — adding/removing/reordering/editing
// cases in the sheet — can never change a past puzzle. The live tail is a pure
// function of (bank, history, date), so everyone computes the same thing, and a
// late or failed sync just means the most recent day is computed instead of read
// (same value) until the next successful sync pins it.
// ---------------------------------------------------------------------------

// Normalize a diagnosis for fuzzy comparison: lowercase, trimmed, collapsed
// whitespace.
function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Levenshtein edit distance (iterative, two-row). Small strings only.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[b.length]
}

// How alike are two diagnoses, in [0, 1]? Combines edit-distance ratio (catches
// spelling fixes), prefix match (catches an appended clarifier), and word
// containment (catches "Diabetes" → "Diabetes Mellitus"). Used to decide whether
// the case now sitting at a frozen row id is plausibly the SAME case with its
// name edited, vs. a different case that shifted into that row.
export function nameSimilarity(a: string, b: string): number {
  const na = normName(a)
  const nb = normName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ratio = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length)
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  const prefix = long.startsWith(short) ? short.length / long.length : 0
  const wordsLong = new Set(long.split(' '))
  const wordsShort = short.split(' ')
  const contained = wordsShort.every((w) => wordsLong.has(w)) ? 0.9 : 0
  return Math.max(ratio, prefix, contained)
}

// Minimum similarity to accept the row-id fallback as a renamed-in-place case.
const RENAME_SIMILARITY = 0.6

// Resolve a frozen entry back to a case in the current bank.
//  1. Exact diagnosis match — stable across row reordering; the common path.
//  2. Row-id fallback for a renamed answer, but ONLY when it's safe: the case now
//     at that row must not already belong to another archived day (`claimed`),
//     and its name must be similar enough to be a plausible spelling fix. This
//     keeps a typo-fix self-healing while refusing to render a *different* case
//     that merely shifted into the row (rename + reorder in one sync).
// Returns null when it can't resolve safely — the day shows an honest gap rather
// than a wrong answer, and the used-set is still advanced so the rest of the
// schedule stays put.
function resolveFrozen(
  entry: FrozenDay,
  byDiagnosis: Map<string, TCase>,
  byId: Map<number, TCase>,
  claimed: Set<string>,
): TCase | null {
  const direct = byDiagnosis.get(entry.diagnosis)
  if (direct) return direct
  const candidate = byId.get(entry.id)
  if (!candidate) return null
  if (claimed.has(candidate.diagnosis)) return null // belongs to a different archived day
  if (nameSimilarity(entry.diagnosis, candidate.diagnosis) < RENAME_SIMILARITY) return null
  return candidate
}

// One live pick for `date`, given the running used-set (keyed by current
// diagnosis). Mutates `used`. Returns the chosen case and whether a
// pool-exhaustion reset fired first, or null if nothing is unlocked yet.
function pickForDate(
  cases: TCase[],
  salt: string,
  date: string,
  used: Set<string>,
): { tCase: TCase; reset: boolean } | null {
  const unlocked = cases.filter((c) => !c.unlockDate || c.unlockDate <= date)
  if (unlocked.length === 0) return null

  let reset = false
  let pool = unlocked.filter((c) => !used.has(c.diagnosis))
  if (pool.length === 0) {
    used.clear() // exhausted the unlocked pool → allow repeats
    reset = true
    pool = unlocked
  }

  // "Current week" = the block(s) with the latest unlock date that's ≤ this day.
  const dated = unlocked.filter((c) => c.unlockDate)
  const maxDate = dated.reduce((m, c) => (c.unlockDate! > m ? c.unlockDate! : m), '')
  const currentWeeks = new Set(
    maxDate ? dated.filter((c) => c.unlockDate === maxDate).map((c) => c.category) : [],
  )
  const weights = pool.map((c) => (currentWeeks.has(c.category) ? CURRENT_WEEK_WEIGHT : 1))

  const tCase = weightedPick(pool, weights, hash32(`${salt}:${date}`))
  used.add(tCase.diagnosis)
  return { tCase, reset }
}

// Replay the frozen prefix of `history` up to and including `upTo`, returning the
// reconstructed used-set and the first date NOT yet frozen (where live
// computation should resume). History is assumed contiguous and ascending —
// freezeThrough always builds it that way.
function replayHistory(
  history: FrozenDay[],
  upTo: string,
  launch: string,
): { used: Set<string>; next: string; frozen: FrozenDay[] } {
  const used = new Set<string>()
  const frozen: FrozenDay[] = []
  let next = launch
  for (const entry of history) {
    if (entry.date > upTo) break
    if (entry.reset) used.clear()
    used.add(entry.diagnosis)
    frozen.push(entry)
    next = addDays(entry.date, 1)
  }
  return { used, next, frozen }
}

// The deterministic daily schedule, launch → `today`: frozen days read verbatim
// from `history`, the remaining tail computed live. Same for every visitor.
//
// `salt` (the year) keeps the two years' schedules independent.
export function buildSchedule(
  cases: TCase[],
  salt: string,
  today: string,
  history: FrozenDay[] = [],
  launch: string = LAUNCH_DATE_ET,
): ScheduledDay[] {
  const out: ScheduledDay[] = []
  if (cases.length === 0) return out

  const byDiagnosis = new Map(cases.map((c) => [c.diagnosis, c]))
  const byId = new Map(cases.map((c) => [c.id, c]))

  const { used, next, frozen } = replayHistory(history, today, launch)
  // Diagnoses that some archived day still matches exactly — the row-id fallback
  // must never steal one of these from its rightful day.
  const claimed = new Set(frozen.map((e) => e.diagnosis).filter((d) => byDiagnosis.has(d)))
  for (const entry of frozen) {
    const tCase = resolveFrozen(entry, byDiagnosis, byId, claimed)
    if (tCase) out.push({ date: entry.date, tCase }) // skip days whose case can't be resolved
  }

  for (let date = next; date <= today; date = addDays(date, 1)) {
    const pick = pickForDate(cases, salt, date, used)
    if (pick) out.push({ date, tCase: pick.tCase })
  }
  return out
}

// Today's (or any past day's) case for a year. Returns null if nothing is
// unlocked yet on/before that date, or if that day's frozen case was removed.
export function caseForDate(
  cases: TCase[],
  salt: string,
  dateStr: string,
  history: FrozenDay[] = [],
  launch: string = LAUNCH_DATE_ET,
): TCase | null {
  const schedule = buildSchedule(cases, salt, dateStr, history, launch)
  const last = schedule[schedule.length - 1]
  return last && last.date === dateStr ? last.tCase : null
}

// Extend `history` with every day from its tail up to and including `lastDay`,
// computing picks live against `cases`. Existing entries are preserved verbatim
// (append-only) — this is what the sync calls, against the *currently committed*
// bank, BEFORE re-baking, so each day is frozen at the value it was actually
// shown with. Idempotent: a second run that's already current adds nothing.
export function freezeThrough(
  cases: TCase[],
  salt: string,
  history: FrozenDay[],
  lastDay: string,
  launch: string = LAUNCH_DATE_ET,
): FrozenDay[] {
  if (cases.length === 0) return history.slice()
  const { used, next } = replayHistory(history, lastDay, launch)
  const out = history.slice() // keep all existing entries untouched
  for (let date = next; date <= lastDay; date = addDays(date, 1)) {
    const pick = pickForDate(cases, salt, date, used)
    if (!pick) continue // nothing unlocked yet that day
    out.push({
      date,
      diagnosis: pick.tCase.diagnosis,
      id: pick.tCase.id,
      ...(pick.reset ? { reset: true } : {}),
    })
  }
  return out
}

// Guard the core invariant — "a past day can never change". Throws unless `next`
// is an append-only, contiguous-by-date extension of `prev`: every existing
// entry must be byte-for-byte the same, and dates must stay strictly ascending.
// The sync runs this before writing, so a bad bake fails the build instead of
// silently rewriting the archives.
export function assertAppendOnly(prev: FrozenDay[], next: FrozenDay[]): void {
  if (next.length < prev.length) {
    throw new Error(`history shrank (${prev.length} → ${next.length}); refusing to drop frozen days`)
  }
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i]
    const b = next[i]
    if (a.date !== b.date || a.diagnosis !== b.diagnosis || a.id !== b.id || !!a.reset !== !!b.reset) {
      throw new Error(
        `frozen day ${i} changed: ${JSON.stringify(a)} → ${JSON.stringify(b)}; a past puzzle must never move`,
      )
    }
  }
  for (let i = 1; i < next.length; i++) {
    if (next[i].date <= next[i - 1].date) {
      throw new Error(`history out of order at ${i}: ${next[i - 1].date} then ${next[i].date}`)
    }
  }
}

export function dayNumber(dateStr: string, launch: string = LAUNCH_DATE_ET): number {
  const ms = Date.parse(dateStr + 'T00:00:00Z') - Date.parse(launch + 'T00:00:00Z')
  return Math.max(1, Math.floor(ms / 86_400_000) + 1)
}

export function formatHeaderDate(dateStr: string): string {
  // dateStr: "YYYY-MM-DD" (already in Toronto local). Format as "Mon Apr 28".
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dt)
}
