import type { TCase } from './types'

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

// The deterministic daily schedule, replayed from launch → `today`. Same for
// every visitor (depends only on the cases, their unlock dates, and the date).
//
// Per day: the pool is the unlocked cases (unlockDate ≤ that day, or null =
// always) minus those already used; when every unlocked case has been used the
// used-set resets so repeats resume (the "summer/bank" behavior). Cases in the
// most-recently-unlocked week are weighted ×1.5. With no unlock dates set this
// degrades to a plain no-repeat cycle through the whole pool.
//
// `salt` (the year) keeps the two years' schedules independent.
export function buildSchedule(
  cases: TCase[],
  salt: string,
  today: string,
  launch: string = LAUNCH_DATE_ET,
): ScheduledDay[] {
  const out: ScheduledDay[] = []
  if (cases.length === 0) return out
  const used = new Set<string>()
  const key = (c: TCase) => c.diagnosis // stable across row reordering

  for (let date = launch; date <= today; date = addDays(date, 1)) {
    const unlocked = cases.filter((c) => !c.unlockDate || c.unlockDate <= date)
    if (unlocked.length === 0) continue // nothing has unlocked yet

    let pool = unlocked.filter((c) => !used.has(key(c)))
    if (pool.length === 0) {
      used.clear() // exhausted the unlocked pool → allow repeats
      pool = unlocked
    }

    // "Current week" = the block(s) with the latest unlock date that's ≤ today.
    const dated = unlocked.filter((c) => c.unlockDate)
    const maxDate = dated.reduce((m, c) => (c.unlockDate! > m ? c.unlockDate! : m), '')
    const currentWeeks = new Set(
      maxDate ? dated.filter((c) => c.unlockDate === maxDate).map((c) => c.category) : [],
    )
    const weights = pool.map((c) => (currentWeeks.has(c.category) ? CURRENT_WEEK_WEIGHT : 1))

    const tCase = weightedPick(pool, weights, hash32(`${salt}:${date}`))
    used.add(key(tCase))
    out.push({ date, tCase })
  }
  return out
}

// Today's (or any past day's) case for a year. Returns null if nothing is
// unlocked yet on/before that date.
export function caseForDate(
  cases: TCase[],
  salt: string,
  dateStr: string,
  launch: string = LAUNCH_DATE_ET,
): TCase | null {
  const schedule = buildSchedule(cases, salt, dateStr, launch)
  const last = schedule[schedule.length - 1]
  return last && last.date === dateStr ? last.tCase : null
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
