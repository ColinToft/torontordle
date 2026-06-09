import type { Year } from './types'

// Community-stats API (Cloudflare Worker). Override for local dev with
// VITE_STATS_API=http://localhost:8787. All calls fail soft — if the backend
// is down or not yet deployed, the game is unaffected and no banner shows.
const API_BASE = (import.meta.env.VITE_STATS_API as string | undefined) ?? 'https://torontordle-stats.torontordle.workers.dev'

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
// there isn't enough data or they didn't place in the top half. Lower guesses
// are better; any win beats any loss. Players who *did better* than you are the
// only ones ahead, so your band = (#better / total).
export function percentileBand(stats: CaseStats, mine: { won: boolean; guesses: number }): number | null {
  if (stats.total < 5) return null // too few players to be meaningful
  const better = mine.won
    ? stats.byGuess.slice(0, Math.max(0, mine.guesses - 1)).reduce((a, b) => a + b, 0)
    : stats.byGuess.reduce((a, b) => a + b, 0) // a loss: every solver did better
  const pct = (better / stats.total) * 100
  if (pct <= 10) return 10
  if (pct <= 25) return 25
  if (pct <= 50) return 50
  return null
}
