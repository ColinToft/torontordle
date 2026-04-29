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

export function pickDailyCase(cases: TCase[], dateStr: string): TCase {
  if (cases.length === 0) throw new Error('No cases available')
  const idx = hash32(dateStr) % cases.length
  return cases[idx]
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
