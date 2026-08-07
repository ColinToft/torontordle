import { beforeEach, describe, expect, it } from 'vitest'
import { loadDayOutcome, saveDailyProgress } from './storage'
import type { DailyProgress, Status, Year } from './types'

// The default vitest environment is node, which has no localStorage. A tiny
// in-memory stub keeps this test dependency-free (no jsdom).
class MemoryStorage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
})

const DATE = '2026-08-06'

function progress(status: Status): DailyProgress {
  return { caseId: 7, guesses: [], status }
}

// Writes the day into one slot: 'daily' = played live, 'archive' = practice replay.
function play(year: Year, dateStr: string, slot: 'daily' | 'archive', status: Status) {
  saveDailyProgress(year, dateStr, progress(status), slot === 'archive')
}

describe('loadDayOutcome', () => {
  it('returns null for a day that was never opened', () => {
    expect(loadDayOutcome('1', DATE)).toBeNull()
  })

  it.each(['won', 'lost'] as const)('reports a live %s day from the daily slot', (status) => {
    play('1', DATE, 'daily', status)
    expect(loadDayOutcome('1', DATE)).toEqual({ status, source: 'daily' })
  })

  it.each(['won', 'lost'] as const)('reports a practice %s replay when the day was never played live', (status) => {
    play('1', DATE, 'archive', status)
    expect(loadDayOutcome('1', DATE)).toEqual({ status, source: 'archive' })
  })

  it('lets the live result win over a later practice replay', () => {
    play('1', DATE, 'daily', 'won')
    play('1', DATE, 'archive', 'lost')
    expect(loadDayOutcome('1', DATE)).toEqual({ status: 'won', source: 'daily' })
  })

  it('lets a live loss stand even when the practice replay was solved', () => {
    play('1', DATE, 'daily', 'lost')
    play('1', DATE, 'archive', 'won')
    expect(loadDayOutcome('1', DATE)).toEqual({ status: 'lost', source: 'daily' })
  })

  it('ignores an unfinished day in either slot', () => {
    play('1', DATE, 'daily', 'playing')
    expect(loadDayOutcome('1', DATE)).toBeNull()
    play('1', DATE, 'archive', 'playing')
    expect(loadDayOutcome('1', DATE)).toBeNull()
  })

  it('falls through an abandoned live attempt to a finished practice replay', () => {
    play('1', DATE, 'daily', 'playing')
    play('1', DATE, 'archive', 'won')
    expect(loadDayOutcome('1', DATE)).toEqual({ status: 'won', source: 'archive' })
  })

  it('keeps years independent', () => {
    play('1', DATE, 'daily', 'won')
    expect(loadDayOutcome('2', DATE)).toBeNull()
    play('2', DATE, 'daily', 'lost')
    expect(loadDayOutcome('1', DATE)).toEqual({ status: 'won', source: 'daily' })
    expect(loadDayOutcome('2', DATE)).toEqual({ status: 'lost', source: 'daily' })
  })

  it('keeps days independent', () => {
    play('1', DATE, 'daily', 'won')
    expect(loadDayOutcome('1', '2026-08-05')).toBeNull()
  })

  it('reports null rather than throwing on corrupted stored JSON', () => {
    localStorage.setItem(`torontordle:y1:progress:${DATE}`, '{not json')
    expect(loadDayOutcome('1', DATE)).toBeNull()
  })

  it('falls through corrupted daily JSON to a valid practice replay', () => {
    localStorage.setItem(`torontordle:y1:progress:${DATE}`, '{not json')
    play('1', DATE, 'archive', 'won')
    expect(loadDayOutcome('1', DATE)).toEqual({ status: 'won', source: 'archive' })
  })
})
