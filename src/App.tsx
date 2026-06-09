import casesData from './cases.json'
import type { TCase } from './types'
import { GameView } from './GameView'
import { useGame } from './useGame'

// Cases are baked at build time by scripts/sync-data.ts, so there's no network
// fetch or loading state — the bank is available synchronously.
const cases = casesData as unknown as TCase[]

export default function App() {
  if (cases.length === 0) return <Splash error>No cases available yet.</Splash>
  return <Game />
}

function Game() {
  const g = useGame(cases)
  return <GameView g={g} />
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
