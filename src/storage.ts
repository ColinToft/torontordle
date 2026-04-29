import type { DailyProgress, Stats } from './types'

const PROGRESS_PREFIX = 'torontordle:progress:'
const STATS_KEY = 'torontordle:stats'

const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  streak: 0,
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

export function loadDailyProgress(dateStr: string): DailyProgress | null {
  return safeRead<DailyProgress>(PROGRESS_PREFIX + dateStr)
}

export function saveDailyProgress(dateStr: string, progress: DailyProgress): void {
  safeWrite(PROGRESS_PREFIX + dateStr, progress)
}

export function clearDailyProgress(dateStr: string): void {
  try {
    localStorage.removeItem(PROGRESS_PREFIX + dateStr)
  } catch {
    /* ignore */
  }
}

export function loadStats(): Stats {
  const stored = safeRead<Stats>(STATS_KEY)
  if (!stored) return { ...EMPTY_STATS, distribution: [...EMPTY_STATS.distribution] }
  // Defensive fill for older or partial entries.
  return {
    played: stored.played ?? 0,
    wins: stored.wins ?? 0,
    streak: stored.streak ?? 0,
    best: stored.best ?? null,
    lastPlayedDate: stored.lastPlayedDate ?? null,
    distribution: stored.distribution && stored.distribution.length === 6 ? stored.distribution : [0, 0, 0, 0, 0, 0],
  }
}

export function saveStats(stats: Stats): void {
  safeWrite(STATS_KEY, stats)
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
  const next: Stats = {
    played: prev.played + 1,
    wins: prev.wins + (outcome === 'won' ? 1 : 0),
    streak:
      outcome === 'won'
        ? continued
          ? prev.streak + 1
          : 1
        : 0,
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
