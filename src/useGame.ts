import { useCallback, useEffect, useState } from 'react'
import type { DailyProgress, Guess, Stats, Status, TCase, Year } from './types'
import { normalizeAnswer } from './normalize'
import {
  clearAll,
  emptyStats,
  loadDailyProgress,
  loadStats,
  recordResult,
  saveDailyProgress,
  saveStats,
} from './storage'

export const MAX_GUESSES = 6

export type UseGame = ReturnType<typeof useGame>

// `cases` is the active year's full pool (for the guess autocomplete); `tCase`
// is the resolved case for `dateStr` (App resolves it and guards the empty case).
// In `archive` mode the play is practice-only: progress is saved under a
// separate slot and stats are never touched.
export function useGame(
  cases: TCase[],
  tCase: TCase,
  year: Year,
  opts: { dateStr: string; archive?: boolean },
) {
  const { dateStr, archive = false } = opts

  const [guesses, setGuesses] = useState<Guess[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('playing')
  const [stats, setStats] = useState<Stats>(() => loadStats(year))

  const recordIfDaily = useCallback(
    (outcome: 'won' | 'lost', guessCount: number) => {
      if (archive) return // practice replay — never affects stats
      const updated = recordResult(stats, dateStr, outcome, guessCount)
      setStats(updated)
      saveStats(year, updated)
    },
    [archive, stats, dateStr, year],
  )

  // Restore (or reset) progress synchronously when the active case/year/mode
  // changes — adjusting state during render per React's "derive from props"
  // guidance (an effect that only mirrors a key causes a wasted commit).
  const caseKey = `${year}:${archive ? 'a' : 'd'}:${dateStr}:${tCase.id}`
  const [syncedKey, setSyncedKey] = useState<string | null>(null)
  if (syncedKey !== caseKey) {
    const stored = loadDailyProgress(year, dateStr, archive)
    if (stored && stored.caseId === tCase.id) {
      setGuesses(stored.guesses)
      setStatus(stored.status)
    } else {
      setGuesses([])
      setStatus('playing')
      setInput('')
    }
    setStats(loadStats(year))
    setSyncedKey(caseKey)
  }

  // Persist progress whenever it changes — but only once synced, so we never
  // clobber stored progress before restoring it.
  useEffect(() => {
    if (syncedKey !== caseKey) return
    const progress: DailyProgress = { caseId: tCase.id, guesses, status }
    saveDailyProgress(year, dateStr, progress, archive)
  }, [caseKey, syncedKey, year, dateStr, archive, tCase.id, guesses, status])

  const submitGuess = useCallback(() => {
    if (status !== 'playing') return
    const trimmed = input.trim()
    if (!trimmed) return

    const norm = normalizeAnswer(trimmed)
    const target = normalizeAnswer(tCase.diagnosis)
    const correct = norm === target || tCase.aliases.some((a) => normalizeAnswer(a) === norm)

    const next = [...guesses, { text: trimmed, correct }]
    setGuesses(next)
    setInput('')

    if (correct) {
      setStatus('won')
      recordIfDaily('won', next.length)
    } else if (next.length >= MAX_GUESSES) {
      setStatus('lost')
      recordIfDaily('lost', next.length)
    }
  }, [guesses, input, status, tCase, recordIfDaily])

  // Skip the current turn without diagnosing: spend an attempt to reveal the
  // next clue. Flagged `passed` so the UI/share grid can tell it from a wrong
  // guess (though both count as a miss).
  const passGuess = useCallback(() => {
    if (status !== 'playing') return
    const next: Guess[] = [...guesses, { text: '', correct: false, passed: true }]
    setGuesses(next)
    setInput('')
    if (next.length >= MAX_GUESSES) {
      setStatus('lost')
      recordIfDaily('lost', next.length)
    }
  }, [guesses, status, recordIfDaily])

  // Wipes this year's saved state (daily + archive progress and stats).
  const resetEverything = useCallback(() => {
    clearAll(year)
    setGuesses([])
    setStatus('playing')
    setInput('')
    setStats(emptyStats())
    setSyncedKey(null)
  }, [year])

  const cluesRevealed =
    status === 'playing' ? Math.min(guesses.length + 1, tCase.clues.length) : tCase.clues.length
  const cluesLeft = MAX_GUESSES - guesses.length
  const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0

  return {
    dateStr,
    archive,
    cases,
    tCase,
    guesses,
    input,
    setInput,
    status,
    cluesRevealed,
    cluesLeft,
    submitGuess,
    passGuess,
    resetEverything,
    stats,
    winRate,
    MAX_GUESSES,
  }
}
