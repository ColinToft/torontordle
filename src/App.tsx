import { useEffect, useState } from 'react'
import { fetchCasesFromSheet } from './sheet'
import type { TCase } from './types'
import { HartHouse } from './HartHouse'
import { useGame } from './useGame'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; cases: TCase[] }
  | { kind: 'error'; message: string }

export default function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchCasesFromSheet()
      .then((cases) => {
        if (cancelled) return
        if (cases.length === 0) {
          setState({ kind: 'error', message: 'The diagnosis sheet has no cases yet. Add a row and try again.' })
        } else {
          setState({ kind: 'ready', cases })
        }
      })
      .catch((err) => {
        if (cancelled) return
        const message =
          err instanceof Error
            ? `Couldn't load the diagnosis sheet (${err.message}). Make sure the sheet is shared "Anyone with the link → Viewer".`
            : "Couldn't load the diagnosis sheet."
        setState({ kind: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'loading') return <Splash>Loading today's case…</Splash>
  if (state.kind === 'error') return <Splash error>{state.message}</Splash>

  return <Game cases={state.cases} />
}

function Game({ cases }: { cases: TCase[] }) {
  const g = useGame(cases)
  return <HartHouse g={g} />
}

function Splash({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        fontFamily: "'Source Serif Pro', Georgia, serif",
        color: error ? 'var(--wrong)' : 'var(--uoft-navy)',
        fontSize: 16,
        lineHeight: 1.5,
        letterSpacing: '0.02em',
        maxWidth: 560,
        margin: '0 auto',
      }}
    >
      {children}
    </div>
  )
}
