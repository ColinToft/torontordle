import type { Year } from './types'

// Community-stats API (Cloudflare Worker). All calls fail soft — if the backend
// is down or not yet deployed, the game is unaffected and no banner shows.
export const PROD_STATS_API = 'https://torontordle-stats.torontordle.workers.dev'

/**
 * Which endpoint this build talks to, or `null` for "call nothing".
 *
 * A dev server used to fall through to the production Worker, so finishing a
 * case locally wrote a real row into the live stats. Dev must now name its
 * endpoint (`VITE_STATS_API=http://localhost:8787 npm run dev` — see
 * `workers/README.md`); with none set, community stats are off locally.
 */
export function resolveApiBase(env: { DEV?: boolean; VITE_STATS_API?: string }): string | null {
  const override = env.VITE_STATS_API?.trim()
  if (override) return override.replace(/\/+$/, '')
  return env.DEV ? null : PROD_STATS_API
}

const API_BASE = resolveApiBase(import.meta.env as { DEV?: boolean; VITE_STATS_API?: string })

if (API_BASE === null) {
  // Loud rather than silent: the stats UI is missing locally by choice, not
  // because the backend is broken.
  console.info(
    '[torontordle] Community stats are disabled in dev. Set VITE_STATS_API to a local Worker ' +
      `(e.g. http://localhost:8787) to exercise them — ${PROD_STATS_API} is never written from a dev server.`,
  )
}

const CID_KEY = 'torontordle:cid'
function clientId(): string {
  try {
    let id = localStorage.getItem(CID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CID_KEY, id)
    }
    return id
  } catch {
    return 'anon-0000'
  }
}

export type CaseStats = { total: number; byGuess: number[]; lost: number }

export async function submitResult(p: {
  year: Year
  date: string
  diagnosis: string
  won: boolean
  guesses: number
}): Promise<void> {
  if (API_BASE === null) return
  try {
    await fetch(`${API_BASE}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: p.year,
        date: p.date,
        diagnosis: p.diagnosis,
        won: p.won ? 1 : 0,
        guesses: p.guesses,
        client: clientId(),
      }),
      keepalive: true, // let it complete even if the tab is closing
    })
  } catch {
    /* offline / not deployed — ignore */
  }
}

export async function fetchCaseStats(p: { year: Year; date: string; diagnosis: string }): Promise<CaseStats | null> {
  if (API_BASE === null) return null
  try {
    const u = new URL(`${API_BASE}/stats`)
    u.searchParams.set('year', p.year)
    u.searchParams.set('date', p.date)
    u.searchParams.set('diagnosis', p.diagnosis)
    const r = await fetch(u.toString())
    if (!r.ok) return null
    return (await r.json()) as CaseStats
  } catch {
    return null
  }
}

// The tightest "Top N%" band the player qualifies for (10/25/50), or null when
// they didn't place in the top half. Lower guesses are better; any win beats any
// loss. Players who *did better* than you are the only ones ahead, so your band
// = (#better / total).
export function percentileBand(stats: CaseStats, mine: { won: boolean; guesses: number }): number | null {
  if (stats.total < 1) return null // nobody recorded yet
  const better = mine.won
    ? stats.byGuess.slice(0, Math.max(0, mine.guesses - 1)).reduce((a, b) => a + b, 0)
    : stats.byGuess.reduce((a, b) => a + b, 0) // a loss: every solver did better
  const pct = (better / stats.total) * 100
  if (pct <= 10) return 10
  if (pct <= 25) return 25
  if (pct <= 50) return 50
  return null
}
