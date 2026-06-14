import { useMemo, useState } from 'react'
import casesData from './cases.json'
import historyData from './history.json'
import type { CasesByYear, FrozenDay, HistoryByYear, TCase, Year } from './types'
import { GameView } from './GameView'
import { useGame } from './useGame'
import { buildSchedule, caseForDate, dayNumber, todayET } from './dailyCase'

// The bank is baked at build time by scripts/sync-data.ts — available
// synchronously, no network/loading state. One case pool per year.
const bank = casesData as unknown as CasesByYear
// The frozen past schedule, also baked by the sync. Past days are read from
// here verbatim so re-baking the bank can't change an archive; today is computed
// live. Empty arrays (no sync yet) degrade to a fully-live schedule.
const history = historyData as unknown as HistoryByYear
const historyFor = (y: Year): FrozenDay[] => history[y] ?? []

export type ArchiveDay = { date: string; tCase: TCase; day: number }
export type Nav = {
  year: Year
  setYear: (y: Year) => void
  archiveDate: string | null
  exitArchive: () => void
  openArchives: () => void
  closeArchives: () => void
  showArchives: boolean
  archiveDays: ArchiveDay[]
  onPickArchive: (date: string) => void
}

const YEAR_KEY = 'torontordle:year'
function loadYear(): Year {
  try {
    return localStorage.getItem(YEAR_KEY) === '2' ? '2' : '1'
  } catch {
    return '1'
  }
}

export default function App() {
  const [year, setYearState] = useState<Year>(loadYear)
  const [archiveDate, setArchiveDate] = useState<string | null>(null)
  const [showArchives, setShowArchives] = useState(false)

  const setYear = (y: Year) => {
    if (y === year) return
    setYearState(y)
    setArchiveDate(null)
    setShowArchives(false)
    try {
      localStorage.setItem(YEAR_KEY, y)
    } catch {
      /* ignore */
    }
  }

  const pool = useMemo(() => bank[year] ?? [], [year])
  const today = useMemo(() => todayET(), [])
  const dateStr = archiveDate ?? today
  const tCase = useMemo(
    () => caseForDate(pool, year, dateStr, historyFor(year)),
    [pool, year, dateStr],
  )

  // Past days for the Archives list (most recent first, excluding today).
  const archiveDays = useMemo<ArchiveDay[]>(() => {
    if (!showArchives) return []
    return buildSchedule(pool, year, today, historyFor(year))
      .filter((d) => d.date !== today)
      .reverse()
      .map((d) => ({ date: d.date, tCase: d.tCase, day: dayNumber(d.date) }))
  }, [showArchives, pool, year, today])

  const nav: Nav = {
    year,
    setYear,
    archiveDate,
    exitArchive: () => setArchiveDate(null),
    openArchives: () => setShowArchives(true),
    closeArchives: () => setShowArchives(false),
    showArchives,
    archiveDays,
    onPickArchive: (date) => {
      setArchiveDate(date)
      setShowArchives(false)
    },
  }

  if (pool.length === 0 || !tCase) {
    return (
      <Splash error nav={nav}>
        No Year {year} case is available yet.
      </Splash>
    )
  }

  return (
    <Game
      key={`${year}:${archiveDate ?? 'today'}`}
      pool={pool}
      tCase={tCase}
      year={year}
      dateStr={dateStr}
      archive={archiveDate !== null}
      nav={nav}
    />
  )
}

function Game({
  pool,
  tCase,
  year,
  dateStr,
  archive,
  nav,
}: {
  pool: TCase[]
  tCase: TCase
  year: Year
  dateStr: string
  archive: boolean
  nav: Nav
}) {
  const g = useGame(pool, tCase, year, { dateStr, archive })
  return <GameView g={g} nav={nav} />
}

function Splash({ children, error, nav }: { children: React.ReactNode; error?: boolean; nav?: Nav }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
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
      {nav && (
        <button
          className="tt-monocaps"
          style={{ color: 'var(--uoft-navy)', borderBottom: '2px solid var(--uoft-navy)', paddingBottom: 2 }}
          onClick={() => nav.setYear(nav.year === '1' ? '2' : '1')}
        >
          Switch to Year {nav.year === '1' ? '2' : '1'}
        </button>
      )}
    </div>
  )
}
