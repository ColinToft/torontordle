import { describe, it, expect } from 'vitest'
import { buildShareText } from './share'
import type { Guess } from './types'

const g = (correct: boolean): Guess => ({ text: 'x', correct })

describe('buildShareText', () => {
  it('renders a win: score out of max and ⬛ misses ending in a 🟩 solve', () => {
    const text = buildShareText({
      dayNumber: 5,
      guesses: [g(false), g(false), g(true)],
      won: true,
      maxGuesses: 6,
      url: 'colintoft.com/torontordle',
    })
    expect(text).toBe('Torontordle Day 5 — 3/6\n⬛⬛🟩\ncolintoft.com/torontordle')
  })

  it('renders a loss: X/max and an all-black grid (no green, no brown)', () => {
    const text = buildShareText({
      dayNumber: 12,
      guesses: Array.from({ length: 6 }, () => g(false)),
      won: false,
      maxGuesses: 6,
      url: 'u',
    })
    expect(text).toContain('Torontordle Day 12 — X/6')
    expect(text).toContain('⬛⬛⬛⬛⬛⬛')
    expect(text).not.toContain('🟫') // the old brown square is gone
    expect(text).not.toContain('🟩') // no solve square on a loss
  })
})
