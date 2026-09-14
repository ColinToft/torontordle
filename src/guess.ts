import { normalizeAnswer } from './normalize'
import type { TCase } from './types'

// A guess names a case only when it is that case's canonical diagnosis (modulo
// case, punctuation and whitespace — see normalizeAnswer). Aliases are
// deliberately NOT accepted as answers: they're derived from parentheticals,
// and "Myocardial Infarction (atypical)" derives "Myocardial Infarction", which
// is a *different* case in the bank. The dropdown fills in the canonical string,
// so nobody has to type it exactly. This is the single rule behind both "can
// this input be submitted?" (GameView) and "is it correct?" (useGame), so the
// two can't drift apart.
export function namesCase(guess: string, c: TCase): boolean {
  const g = normalizeAnswer(guess)
  return g !== '' && g === normalizeAnswer(c.diagnosis)
}

// Dropdown search: substring match over the diagnosis AND its aliases, so a
// synonym or abbreviation ("PE", "Down Syndrome", a sheet-authored alias) still
// finds its case even though only the canonical name is accepted. Raw substring
// on purpose — it's a filter for a list the player is looking at, not a match.
// An empty query matches everything.
export function searchMatches(query: string, c: TCase): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return c.diagnosis.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
}
