import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DailyProgress, Guess, Stats, Status, TCase } from './types'
import { pickDailyCase, todayET } from './dailyCase'
import { normalizeAnswer } from './normalize'
import {
  clearDailyProgress,
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
  const restoredCaseIdRef = useRef<number | null>(null)

  // Restore today's progress when the active case becomes known.
  useEffect(() => {
    const stored = loadDailyProgress(dateStr)
    if (stored && stored.caseId === tCase.id) {
      setGuesses(stored.guesses)
      setStatus(stored.status)
      restoredCaseIdRef.current = tCase.id
    } else {
      // New day, or sheet refreshed and assigned a different case for today.
      setGuesses([])
      setStatus('playing')
      setInput('')
      restoredCaseIdRef.current = tCase.id
    }
  }, [dateStr, tCase.id])

  // Persist progress whenever it changes for the active case.
  useEffect(() => {
    if (restoredCaseIdRef.current !== tCase.id) return
    const progress: DailyProgress = { caseId: tCase.id, guesses, status }
    saveDailyProgress(dateStr, progress)
  }, [dateStr, tCase.id, guesses, status])

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

  // Clears today's gameplay so the same case can be replayed. Aggregate stats
  // are left intact — recordResult is a no-op once today's outcome is logged,
  // so replays after reset don't double-count.
  const resetToday = useCallback(() => {
    clearDailyProgress(dateStr)
    setGuesses([])
    setStatus('playing')
    setInput('')
  }, [dateStr])

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
    resetToday,
    stats,
    winRate,
    MAX_GUESSES,
  }
}
