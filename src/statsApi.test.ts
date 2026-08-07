import { describe, expect, it } from 'vitest'
import { PROD_STATS_API, percentileBand, resolveApiBase, type CaseStats } from './statsApi'

describe('resolveApiBase', () => {
  it('uses the production Worker for a production build', () => {
    expect(resolveApiBase({ DEV: false })).toBe(PROD_STATS_API)
  })

  it('calls nothing from a dev server with no endpoint named', () => {
    expect(resolveApiBase({ DEV: true })).toBeNull()
  })

  it('never falls through to production from dev', () => {
    // The regression this guards: playing a case on localhost used to write a
    // real row into the live stats.
    expect(resolveApiBase({ DEV: true })).not.toBe(PROD_STATS_API)
    expect(resolveApiBase({ DEV: true, VITE_STATS_API: '' })).not.toBe(PROD_STATS_API)
    expect(resolveApiBase({ DEV: true, VITE_STATS_API: '   ' })).not.toBe(PROD_STATS_API)
  })

  it('honours an explicit endpoint in dev', () => {
    expect(resolveApiBase({ DEV: true, VITE_STATS_API: 'http://localhost:8787' })).toBe('http://localhost:8787')
  })

  it('honours an explicit endpoint in production too, for staging builds', () => {
    expect(resolveApiBase({ DEV: false, VITE_STATS_API: 'https://staging.example' })).toBe('https://staging.example')
  })

  it('trims surrounding whitespace from an endpoint', () => {
    expect(resolveApiBase({ DEV: true, VITE_STATS_API: '  http://localhost:8787  ' })).toBe('http://localhost:8787')
  })

  it('strips trailing slashes so paths concatenate cleanly', () => {
    expect(resolveApiBase({ DEV: true, VITE_STATS_API: 'http://localhost:8787/' })).toBe('http://localhost:8787')
    expect(resolveApiBase({ DEV: true, VITE_STATS_API: 'http://localhost:8787///' })).toBe('http://localhost:8787')
  })

  it('treats a blank or whitespace-only override as unset', () => {
    expect(resolveApiBase({ DEV: false, VITE_STATS_API: '' })).toBe(PROD_STATS_API)
    expect(resolveApiBase({ DEV: true, VITE_STATS_API: '  ' })).toBeNull()
  })

  it('defaults to production when DEV is absent entirely', () => {
    expect(resolveApiBase({})).toBe(PROD_STATS_API)
  })
})

function stats(byGuess: number[], lost = 0): CaseStats {
  return { total: byGuess.reduce((a, b) => a + b, 0) + lost, byGuess, lost }
}

describe('percentileBand', () => {
  it('returns null when nobody has recorded a result', () => {
    expect(percentileBand(stats([0, 0, 0, 0, 0, 0]), { won: true, guesses: 1 })).toBeNull()
  })

  it('puts a first-guess solver in the top band', () => {
    expect(percentileBand(stats([1, 9, 0, 0, 0, 0]), { won: true, guesses: 1 })).toBe(10)
  })

  it('ranks by how many players did strictly better', () => {
    // 10 solved in 1, 10 in 2; solving in 3 means 20 of 20 did better → no band.
    expect(percentileBand(stats([10, 10, 1, 0, 0, 0]), { won: true, guesses: 3 })).toBeNull()
  })

  it('ranks a loss behind every solver', () => {
    // 8 of 10 solved → 80% did better → no band.
    expect(percentileBand(stats([8, 0, 0, 0, 0, 0], 2), { won: false, guesses: 6 })).toBeNull()
  })

  it('still bands a loss when most players also failed', () => {
    // Current behaviour, and the reason the copy reads oddly after a loss:
    // half the field solved it, so a loss is "top 50%".
    expect(percentileBand(stats([5, 0, 0, 0, 0, 0], 5), { won: false, guesses: 6 })).toBe(50)
  })

  it('tightens the band as fewer players beat you', () => {
    const pool = stats([10, 15, 25, 25, 15, 10])
    expect(percentileBand(pool, { won: true, guesses: 2 })).toBe(10)
    expect(percentileBand(pool, { won: true, guesses: 3 })).toBe(25)
    expect(percentileBand(pool, { won: true, guesses: 4 })).toBe(50)
    expect(percentileBand(pool, { won: true, guesses: 5 })).toBeNull()
  })
})
