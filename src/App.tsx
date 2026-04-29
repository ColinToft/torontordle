import { useEffect, useState } from 'react'
import { FALLBACK_CASES } from './cases'
import { fetchCasesFromSheet } from './sheet'
import type { TCase } from './types'
import { HartHouse } from './HartHouse'
import { useGame } from './useGame'

type Loaded = { cases: TCase[]; source: 'sheet' | 'fallback' }

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCasesFromSheet()
      .then((cases) => {
        if (cancelled) return
        if (cases.length === 0) setLoaded({ cases: FALLBACK_CASES, source: 'fallback' })
        else setLoaded({ cases, source: 'sheet' })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ cases: FALLBACK_CASES, source: 'fallback' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded) return <SplashLoading />

  return <Game cases={loaded.cases} />
}

function Game({ cases }: { cases: TCase[] }) {
  const g = useGame(cases)
  return <HartHouse g={g} />
}

function SplashLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Source Serif Pro', Georgia, serif",
        color: 'var(--uoft-navy)',
        fontSize: 18,
        letterSpacing: '0.04em',
      }}
    >
      Loading today's case…
    </div>
  )
}
