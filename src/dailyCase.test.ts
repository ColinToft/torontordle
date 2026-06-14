import { describe, expect, it } from 'vitest'
import {
  assertAppendOnly,
  buildSchedule,
  caseForDate,
  freezeThrough,
} from './dailyCase'
import type { FrozenDay, TCase } from './types'

const LAUNCH = '2026-01-01'

// Build a synthetic case. id defaults to a derived row number; override to model
// reordering/renames precisely.
function mk(id: number, diagnosis: string, extra: Partial<TCase> = {}): TCase {
  return {
    id,
    diagnosis,
    aliases: [],
    category: 'General',
    unlockDate: null,
    clues: [{ type: '', text: `clue for ${diagnosis}` }],
    ...extra,
  }
}

// A bank of N always-available cases (ids 1..N).
function bankOf(n: number): TCase[] {
  return Array.from({ length: n }, (_, i) => mk(i + 1, `Dx${i + 1}`))
}

const pick = (s: { date: string; tCase: TCase }) => ({ date: s.date, dx: s.tCase.diagnosis })

describe('freezeThrough', () => {
  it('freezes one entry per day from launch through lastDay', () => {
    const h = freezeThrough(bankOf(10), '1', [], '2026-01-08', LAUNCH)
    expect(h.map((d) => d.date)).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
    ])
    // Every entry carries the picked case's id + diagnosis.
    for (const d of h) {
      expect(typeof d.diagnosis).toBe('string')
      expect(typeof d.id).toBe('number')
    }
  })

  it('is idempotent — re-freezing through the same day changes nothing', () => {
    const bank = bankOf(10)
    const h1 = freezeThrough(bank, '1', [], '2026-01-08', LAUNCH)
    const h2 = freezeThrough(bank, '1', h1, '2026-01-08', LAUNCH)
    expect(h2).toEqual(h1)
  })

  it('extends append-only — the existing prefix is preserved verbatim', () => {
    const bank = bankOf(10)
    const h1 = freezeThrough(bank, '1', [], '2026-01-08', LAUNCH)
    const h2 = freezeThrough(bank, '1', h1, '2026-01-12', LAUNCH)
    expect(h2.length).toBeGreaterThan(h1.length)
    expect(h2.slice(0, h1.length)).toEqual(h1)
  })

  it('never picks a case before its unlock date', () => {
    const bank = [
      mk(1, 'Locked', { unlockDate: '2026-01-05' }),
      ...Array.from({ length: 5 }, (_, i) => mk(i + 2, `Open${i + 1}`)),
    ]
    const h = freezeThrough(bank, '1', [], '2026-01-20', LAUNCH)
    const lockedDays = h.filter((d) => d.diagnosis === 'Locked')
    expect(lockedDays.length).toBeGreaterThan(0) // it does unlock eventually
    for (const d of lockedDays) expect(d.date >= '2026-01-05').toBe(true)
  })

  it('records reset flags when a small pool is exhausted and repeats resume', () => {
    const h = freezeThrough(bankOf(2), '1', [], '2026-01-08', LAUNCH)
    // 2 cases → exhausted every other day → resets must be recorded.
    expect(h.some((d) => d.reset)).toBe(true)
  })
})

describe('a frozen past day never changes when the bank is re-baked', () => {
  const bank = bankOf(10)
  const today = '2026-01-08'
  const history = freezeThrough(bank, '1', [], today, LAUNCH)
  const base = buildSchedule(bank, '1', today, history, LAUNCH).map(pick)

  it('baseline: every frozen day renders', () => {
    expect(base).toHaveLength(8)
    expect(base.map((d) => d.dx)).toEqual(history.map((h) => h.diagnosis))
  })

  it('survives a new case appended to the bank', () => {
    const mutated = [...bank, mk(11, 'BrandNew')]
    expect(buildSchedule(mutated, '1', today, history, LAUNCH).map(pick)).toEqual(base)
  })

  it('survives the bank being reordered (diagnosis key is reorder-stable)', () => {
    const mutated = [...bank].reverse()
    expect(buildSchedule(mutated, '1', today, history, LAUNCH).map(pick)).toEqual(base)
  })

  it('survives a clue-text edit (same diagnosis → same day, fresh text)', () => {
    const mutated = bank.map((c) =>
      c.diagnosis === base[0].dx ? { ...c, clues: [{ type: '', text: 'EDITED' }] } : c,
    )
    const out = buildSchedule(mutated, '1', today, history, LAUNCH)
    expect(out.map(pick)).toEqual(base)
    expect(out[0].tCase.clues[0].text).toBe('EDITED') // edit shows through
  })

  it('survives renaming a case that never appeared in the frozen window', () => {
    const shown = new Set(history.map((h) => h.diagnosis))
    const unshown = bank.find((c) => !shown.has(c.diagnosis))!
    const mutated = bank.map((c) =>
      c.id === unshown.id ? { ...c, diagnosis: 'Renamed Unshown' } : c,
    )
    expect(buildSchedule(mutated, '1', today, history, LAUNCH).map(pick)).toEqual(base)
  })
})

describe('rename resilience for a case that DID appear', () => {
  const bank = bankOf(10)
  const today = '2026-01-08'
  const history = freezeThrough(bank, '1', [], today, LAUNCH)

  it('a spelling fix to an answer still resolves via the id fallback', () => {
    const frozen = history[0]
    // Rename in place: same id + position, new diagnosis text (a spelling fix).
    const mutated = bank.map((c) =>
      c.id === frozen.id ? { ...c, diagnosis: `${frozen.diagnosis} (fixed)` } : c,
    )
    const out = buildSchedule(mutated, '1', today, history, LAUNCH)
    const day0 = out.find((d) => d.date === frozen.date)!
    expect(day0.tCase.id).toBe(frozen.id)
    expect(day0.tCase.diagnosis).toBe(`${frozen.diagnosis} (fixed)`)
    // All other days are untouched.
    expect(out.filter((d) => d.date !== frozen.date).map(pick)).toEqual(
      buildSchedule(bank, '1', today, history, LAUNCH)
        .filter((d) => d.date !== frozen.date)
        .map(pick),
    )
  })

  it('degrades gracefully when a frozen case is removed entirely', () => {
    const frozen = history[0]
    const mutated = bank.filter((c) => c.id !== frozen.id && c.diagnosis !== frozen.diagnosis)
    const out = buildSchedule(mutated, '1', today, history, LAUNCH)
    // That one day can't render, but nothing crashes and the rest stay put.
    expect(out.find((d) => d.date === frozen.date)).toBeUndefined()
    expect(out).toHaveLength(history.length - 1)
  })
})

describe('frozen prefix + live tail == fully frozen', () => {
  it('matches whether days are read from history or computed live', () => {
    const bank = bankOf(10)
    const today = '2026-01-10'
    const full = freezeThrough(bank, '1', [], today, LAUNCH)
    const partial = freezeThrough(bank, '1', [], '2026-01-05', LAUNCH) // only first 5 frozen
    const live = buildSchedule(bank, '1', today, partial, LAUNCH)
    expect(live.map(pick)).toEqual(full.map((d) => ({ date: d.date, dx: d.diagnosis })))
  })

  it('an empty history degrades to a fully-live schedule', () => {
    const bank = bankOf(10)
    const today = '2026-01-10'
    const live = buildSchedule(bank, '1', today, [], LAUNCH).map(pick)
    const frozen = freezeThrough(bank, '1', [], today, LAUNCH).map((d) => ({ date: d.date, dx: d.diagnosis }))
    expect(live).toEqual(frozen)
  })

  it('reconstructs the used-set across resets in a small pool', () => {
    const bank = bankOf(2)
    const today = '2026-01-08'
    const full = freezeThrough(bank, '1', [], today, LAUNCH)
    const partial = freezeThrough(bank, '1', [], '2026-01-03', LAUNCH)
    const live = buildSchedule(bank, '1', today, partial, LAUNCH)
    expect(live.map(pick)).toEqual(full.map((d) => ({ date: d.date, dx: d.diagnosis })))
  })
})

describe('assertAppendOnly', () => {
  const bank = bankOf(10)
  const h1 = freezeThrough(bank, '1', [], '2026-01-08', LAUNCH)
  const h2 = freezeThrough(bank, '1', h1, '2026-01-12', LAUNCH)

  it('accepts a clean append', () => {
    expect(() => assertAppendOnly(h1, h2)).not.toThrow()
  })

  it('accepts no-op (identical)', () => {
    expect(() => assertAppendOnly(h1, h1)).not.toThrow()
  })

  it('throws if an existing entry changed', () => {
    const tampered = h2.map((d, i) => (i === 0 ? { ...d, diagnosis: 'Tampered' } : d))
    expect(() => assertAppendOnly(h1, tampered)).toThrow(/changed/)
  })

  it('throws if an existing entry id changed', () => {
    const tampered = h2.map((d, i) => (i === 1 ? { ...d, id: 999 } : d))
    expect(() => assertAppendOnly(h1, tampered)).toThrow(/changed/)
  })

  it('throws if history shrank', () => {
    expect(() => assertAppendOnly(h2, h1)).toThrow(/shrank/)
  })

  it('throws if dates are not strictly ascending', () => {
    const dupe: FrozenDay[] = [...h1, h1[h1.length - 1]]
    expect(() => assertAppendOnly([], dupe)).toThrow(/out of order/)
  })
})

describe('caseForDate', () => {
  const bank = bankOf(10)
  const today = '2026-01-08'
  const history = freezeThrough(bank, '1', [], today, LAUNCH)

  it('returns the frozen case for a past day', () => {
    const target = history[3]
    const c = caseForDate(bank, '1', target.date, history, LAUNCH)
    expect(c?.diagnosis).toBe(target.diagnosis)
  })

  it('returns today and matches the schedule tail', () => {
    const c = caseForDate(bank, '1', today, history, LAUNCH)
    const sched = buildSchedule(bank, '1', today, history, LAUNCH)
    expect(c?.diagnosis).toBe(sched[sched.length - 1].tCase.diagnosis)
  })

  it('returns null before launch', () => {
    expect(caseForDate(bank, '1', '2025-12-31', history, LAUNCH)).toBeNull()
  })
})

describe('determinism', () => {
  it('is identical across runs (same for everyone)', () => {
    const bank = bankOf(10)
    const a = buildSchedule(bank, '1', '2026-01-08', [], LAUNCH).map(pick)
    const b = buildSchedule(bank, '1', '2026-01-08', [], LAUNCH).map(pick)
    expect(a).toEqual(b)
  })

  it('differs between years (salt keeps the two schedules independent)', () => {
    const bank = bankOf(10)
    const y1 = buildSchedule(bank, '1', '2026-01-15', [], LAUNCH).map((d) => d.tCase.diagnosis)
    const y2 = buildSchedule(bank, '2', '2026-01-15', [], LAUNCH).map((d) => d.tCase.diagnosis)
    expect(y1).not.toEqual(y2)
  })
})
