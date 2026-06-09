import type { DailyProgress, Stats, Year } from './types'

// All keys are namespaced by year so Year 1 and Year 2 keep independent
// progress + stats. `archive:` progress is for replayed past days (practice).
const ns = (year: Year) => `torontordle:y${year}:`
const progressKey = (year: Year, dateStr: string) => `${ns(year)}progress:${dateStr}`
const archiveKey = (year: Year, dateStr: string) => `${ns(year)}archive:${dateStr}`
const statsKey = (year: Year) => `${ns(year)}stats`

const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  best: null,
  lastPlayedDate: null,
  distribution: [0, 0, 0, 0, 0, 0],
}

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / privacy mode — silently drop */
  }
}

// `archive` selects the practice-replay slot for a past day vs the live daily.
export function loadDailyProgress(year: Year, dateStr: string, archive = false): DailyProgress | null {
  return safeRead<DailyProgress>((archive ? archiveKey : progressKey)(year, dateStr))
}

export function saveDailyProgress(year: Year, dateStr: string, progress: DailyProgress, archive = false): void {
  safeWrite((archive ? archiveKey : progressKey)(year, dateStr), progress)
}

export function clearDailyProgress(year: Year, dateStr: string, archive = false): void {
  try {
    localStorage.removeItem((archive ? archiveKey : progressKey)(year, dateStr))
  } catch {
    /* ignore */
  }
}

// Wipes one year's stored progress (daily + archive) and aggregate stats.
export function clearAll(year: Year): void {
  try {
    const prefix = ns(year)
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

export function emptyStats(): Stats {
  return { ...EMPTY_STATS, distribution: [...EMPTY_STATS.distribution] }
}

export function loadStats(year: Year): Stats {
  const stored = safeRead<Stats>(statsKey(year))
  if (!stored) return { ...EMPTY_STATS, distribution: [...EMPTY_STATS.distribution] }
  // Defensive fill for older or partial entries.
  return {
    played: stored.played ?? 0,
    wins: stored.wins ?? 0,
    streak: stored.streak ?? 0,
    // Backfill for entries saved before maxStreak existed: the best we can infer
    // is the current streak (older history is unrecoverable).
    maxStreak: stored.maxStreak ?? stored.streak ?? 0,
    best: stored.best ?? null,
    lastPlayedDate: stored.lastPlayedDate ?? null,
    distribution: stored.distribution && stored.distribution.length === 6 ? stored.distribution : [0, 0, 0, 0, 0, 0],
  }
}

export function saveStats(year: Year, stats: Stats): void {
  safeWrite(statsKey(year), stats)
}

export function recordResult(
  prev: Stats,
  dateStr: string,
  outcome: 'won' | 'lost',
  guessCount: number,
): Stats {
  // Only record once per date. If the player already finished today, no-op.
  if (prev.lastPlayedDate === dateStr) return prev

  const yesterday = shiftDate(dateStr, -1)
  const continued = prev.lastPlayedDate === yesterday
  const streak =
    outcome === 'won' ? (continued ? prev.streak + 1 : 1) : 0
  const next: Stats = {
    played: prev.played + 1,
    wins: prev.wins + (outcome === 'won' ? 1 : 0),
    streak,
    maxStreak: Math.max(prev.maxStreak ?? 0, streak),
    best: prev.best,
    lastPlayedDate: dateStr,
    distribution: [...prev.distribution],
  }
  if (outcome === 'won') {
    const slot = Math.max(0, Math.min(5, guessCount - 1))
    next.distribution[slot] = (next.distribution[slot] ?? 0) + 1
    next.best = next.best == null ? guessCount : Math.min(next.best, guessCount)
  }
  return next
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  const dt = new Date(t)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
