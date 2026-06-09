// Torontordle community-stats API (Cloudflare Worker + D1).
//   POST /submit  { year, date, diagnosis, won, guesses, client }  → record one result
//   GET  /stats?year&date&diagnosis                                → aggregate for that case/day
// Anonymous: `client` is a random browser id used only to dedupe resubmissions.

interface D1Result {
  results: Record<string, unknown>[]
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<unknown>
  all(): Promise<D1Result>
}
interface D1Database {
  prepare(query: string): D1PreparedStatement
}
interface Env {
  DB: D1Database
}

const ALLOWED_ORIGINS = new Set([
  'https://torontordle.com',
  'https://www.torontordle.com',
  'http://localhost:5173',
])

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://torontordle.com'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const isYear = (s: unknown): s is string => s === '1' || s === '2'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin')
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
    const url = new URL(req.url)

    if (req.method === 'POST' && url.pathname === '/submit') {
      let b: Record<string, unknown>
      try {
        b = (await req.json()) as Record<string, unknown>
      } catch {
        return json({ error: 'bad json' }, 400, origin)
      }
      const { year, date, diagnosis, won, guesses, client } = b
      if (
        !isYear(year) ||
        !isDate(date) ||
        typeof diagnosis !== 'string' ||
        !diagnosis ||
        diagnosis.length > 200 ||
        (won !== 0 && won !== 1) ||
        !Number.isInteger(guesses) ||
        (guesses as number) < 1 ||
        (guesses as number) > 6 ||
        typeof client !== 'string' ||
        client.length < 8 ||
        client.length > 64
      ) {
        return json({ error: 'invalid' }, 400, origin)
      }
      await env.DB.prepare(
        'INSERT OR IGNORE INTO results (year, date, diagnosis, won, guesses, client) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(year, date, diagnosis, won, guesses, client)
        .run()
      return json({ ok: true }, 200, origin)
    }

    if (req.method === 'GET' && url.pathname === '/stats') {
      const year = url.searchParams.get('year')
      const date = url.searchParams.get('date')
      const diagnosis = url.searchParams.get('diagnosis')
      if (!isYear(year) || !isDate(date) || !diagnosis) return json({ error: 'invalid' }, 400, origin)
      const rs = await env.DB.prepare(
        'SELECT won, guesses, COUNT(*) AS n FROM results WHERE year = ? AND date = ? AND diagnosis = ? GROUP BY won, guesses',
      )
        .bind(year, date, diagnosis)
        .all()
      const byGuess = [0, 0, 0, 0, 0, 0] // solved in 1..6
      let lost = 0
      let total = 0
      for (const row of rs.results) {
        const n = Number(row.n)
        const g = Number(row.guesses)
        total += n
        if (Number(row.won) === 1 && g >= 1 && g <= 6) byGuess[g - 1] += n
        else if (Number(row.won) === 0) lost += n
      }
      return json({ total, byGuess, lost }, 200, origin)
    }

    return json({ error: 'not found' }, 404, origin)
  },
}
