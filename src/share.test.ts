import { describe, it, expect } from 'vitest'
import { buildShareText } from './share'
import type { Guess } from './types'

const g = (correct: boolean): Guess => ({ text: 'x', correct })
const skip = (): Guess => ({ text: '', correct: false, passed: true })

const TAGLINE = 'Daily diagnosis for Preclerkship students in Toronto'

describe('buildShareText', () => {
  it('renders a win: 🟥 misses, a 🟩 solve, then ⬛ for the unused guesses', () => {
    const text = buildShareText({
      dayNumber: 5,
      guesses: [g(false), g(false), g(true)],
      won: true,
      maxGuesses: 6,
      url: 'torontordle.com',
    })
    expect(text).toBe(`Torontordle Day 5 — 3/6\n🟥🟥🟩⬛⬛⬛\n${TAGLINE}\ntorontordle.com`)
  })

  it('renders a loss: X/max, an all-red grid, no unused (all six used) and no solve', () => {
    const text = buildShareText({
      dayNumber: 12,
      guesses: Array.from({ length: 6 }, () => g(false)),
      won: false,
      maxGuesses: 6,
      url: 'u',
    })
    expect(text).toContain('Torontordle Day 12 — X/6')
    expect(text).toContain('🟥🟥🟥🟥🟥🟥')
    expect(text).not.toContain('🟩') // no solve square on a loss
    expect(text).not.toContain('⬛') // all six guesses used → no unused squares
    expect(text).toContain(TAGLINE)
  })

  it('renders skipped turns as ⬜, distinct from wrong (🟥), correct (🟩), and unused (⬛)', () => {
    const text = buildShareText({
      dayNumber: 7,
      guesses: [skip(), g(false), skip(), g(true)],
      won: true,
      maxGuesses: 6,
      url: 'u',
    })
    expect(text).toBe(`Torontordle Day 7 — 4/6\n⬜🟥⬜🟩⬛⬛\n${TAGLINE}\nu`)
  })
})
