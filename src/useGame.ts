import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DailyProgress, Guess, Stats, Status, TCase } from './types'
import { pickDailyCase, todayET } from './dailyCase'
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

export function useGame(cases: TCase[]) {
  const dateStr = useMemo(() => todayET(), [])
  const tCase = useMemo(() => pickDailyCase(cases, dateStr), [cases, dateStr])

  const [guesses, setGuesses] = useState<Guess[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('playing')
  const [stats, setStats] = useState<Stats>(() => loadStats())

  // Restore (or reset) today's progress synchronously when the active case
  // changes. Done during render per React's "adjust state when a prop changes"
  // guidance — an effect that only mirrors a key into state causes a wasted
  // commit and is flagged by react-hooks/set-state-in-effect.
  const caseKey = `${dateStr}:${tCase.id}`
  const [syncedKey, setSyncedKey] = useState<string | null>(null)
  if (syncedKey !== caseKey) {
    const stored = loadDailyProgress(dateStr)
    if (stored && stored.caseId === tCase.id) {
      setGuesses(stored.guesses)
      setStatus(stored.status)
    } else {
      // New day, or sheet refreshed and assigned a different case for today.
      setGuesses([])
      setStatus('playing')
      setInput('')
    }
    setSyncedKey(caseKey)
  }

  // Persist progress whenever it changes for the active case — but only once
  // it has been synced, so we never clobber stored progress before restoring.
  useEffect(() => {
    if (syncedKey !== caseKey) return
    const progress: DailyProgress = { caseId: tCase.id, guesses, status }
    saveDailyProgress(dateStr, progress)
  }, [caseKey, syncedKey, dateStr, tCase.id, guesses, status])

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

    let outcome: 'won' | 'lost' | null = null
    if (correct) {
      setStatus('won')
      outcome = 'won'
    } else if (next.length >= MAX_GUESSES) {
      setStatus('lost')
      outcome = 'lost'
    }

    if (outcome) {
      const updated = recordResult(stats, dateStr, outcome, next.length)
      setStats(updated)
      saveStats(updated)
    }
  }, [dateStr, guesses, input, stats, status, tCase])

  // Wipes every shred of saved state — today's gameplay and the aggregate
  // stats — and starts the player over from a clean slate.
  const resetEverything = useCallback(() => {
    clearAll()
    setGuesses([])
    setStatus('playing')
    setInput('')
    setStats(emptyStats())
  }, [])

  const cluesRevealed =
    status === 'playing' ? Math.min(guesses.length + 1, tCase.clues.length) : tCase.clues.length
  const cluesLeft = MAX_GUESSES - guesses.length
  const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0

  return {
    dateStr,
    cases,
    tCase,
    guesses,
    input,
    setInput,
    status,
    cluesRevealed,
    cluesLeft,
    submitGuess,
    resetEverything,
    stats,
    winRate,
    MAX_GUESSES,
  }
}
