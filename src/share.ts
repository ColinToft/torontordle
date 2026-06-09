import type { Guess } from './types'

// Wordle-style grid:
//   🟩 = correct · 🟥 = miss (a wrong guess *or* a skipped turn — both spend an
//   attempt) · ⬛ = unused hint (a guess slot never reached because the case was
//   solved early).
export function buildShareText(opts: {
  dayNumber: number
  guesses: Guess[]
  won: boolean
  maxGuesses: number
  url: string
}): string {
  const { dayNumber, guesses, won, maxGuesses, url } = opts
  const score = won ? `${guesses.length}/${maxGuesses}` : `X/${maxGuesses}`
  const used = guesses.map((g) => (g.correct ? '🟩' : '🟥')).join('')
  const unused = '⬛'.repeat(Math.max(0, maxGuesses - guesses.length))
  return `Torontordle Day ${dayNumber} — ${score}\n${used}${unused}\n${url}`
}

export async function copyShare(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  // Legacy fallback.
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
