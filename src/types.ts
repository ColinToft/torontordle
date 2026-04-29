export type Clue = { type: string; text: string }

export type TCase = {
  id: number
  diagnosis: string
  aliases: string[]
  category: string
  clues: Clue[]
  description?: string
}

export type Guess = { text: string; correct: boolean }

export type Status = 'playing' | 'won' | 'lost'

export type DailyProgress = {
  caseId: number
  guesses: Guess[]
  status: Status
}

export type Stats = {
  played: number
  wins: number
  streak: number
  best: number | null
  lastPlayedDate: string | null
  distribution: number[] // index 0 → solved in 1 guess, …, index 5 → solved in 6
}
