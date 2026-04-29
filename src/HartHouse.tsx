import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { Guess, Stats } from './types'
import { dayNumber as computeDayNumber, formatHeaderDate } from './dailyCase'
import { buildShareText, copyShare } from './share'
import type { UseGame } from './useGame'

const SERIF = "'Source Serif Pro', Georgia, serif"

export function HartHouse({ g }: { g: UseGame }) {
  const [showHowTo, setShowHowTo] = useState(false)
  const [showStats, setShowStats] = useState(false)

  const visibleClues = g.tCase.clues.slice(0, g.cluesRevealed)
  const lockedCount = Math.max(0, g.tCase.clues.length - visibleClues.length)
  const day = computeDayNumber(g.dateStr)
  const headerDate = formatHeaderDate(g.dateStr)
  const caseLabel = `Case No. ${String(day).padStart(3, '0')} · ${g.tCase.category}`

  return (
    <div className="tt-frame" style={styles.frame}>
      <Header
        day={day}
        headerDate={headerDate}
        onHowTo={() => setShowHowTo(true)}
        onStats={() => setShowStats(true)}
      />

      <div className="tt-grid" style={styles.grid}>
        <section className="tt-card" style={styles.casePanel}>
          <div style={styles.caseHeader}>
            <div className="tt-section-title" style={{ color: 'var(--uoft-navy)' }}>{caseLabel}</div>
          </div>
          <hr className="tt-rule" />

          <ol style={styles.clueList} aria-live="polite">
            {visibleClues.map((c, i) => (
              <li key={i} style={styles.clueItem}>
                <span style={styles.clueNum}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ flex: 1 }}>
                  {c.type && (
                    <div className="tt-monocaps" style={{ color: 'var(--uoft-navy)', marginBottom: 4 }}>{c.type}</div>
                  )}
                  <p style={{ ...styles.clueText, marginTop: c.type ? 0 : 2 }}>{c.text}</p>
                </div>
              </li>
            ))}
            {Array.from({ length: lockedCount }).map((_, i) => (
              <li key={`l-${i}`} style={{ ...styles.clueItem, opacity: 0.35 }}>
                <span style={styles.clueNum}>{String(visibleClues.length + i + 1).padStart(2, '0')}</span>
                <div style={{ flex: 1 }}>
                  <div className="tt-monocaps" style={{ color: 'var(--ink-soft)', marginBottom: 4 }}>Locked</div>
                  <div style={styles.skeletonBar} />
                  <div style={{ ...styles.skeletonBar, width: '70%' }} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="tt-card" style={styles.guessPanel}>
          <div style={styles.guessHeaderRow}>
            <div className="tt-section-title" style={{ color: 'var(--uoft-navy)' }}>Your diagnoses</div>
            <div style={styles.dotRow} aria-label="Guesses used">
              {Array.from({ length: g.MAX_GUESSES }).map((_, i) => {
                const used = g.guesses[i]
                const variant: 'open' | 'ok' | 'no' = !used ? 'open' : used.correct ? 'ok' : 'no'
                return <span key={i} style={dotStyle[variant]} />
              })}
            </div>
          </div>
          {g.status === 'playing' && (
            <div className="tt-monocaps" style={{ color: 'var(--ink-soft)', marginTop: 6 }}>
              {g.cluesLeft} guesses remaining
            </div>
          )}
          <hr className="tt-rule" style={{ margin: '14px 0' }} />

          <div style={styles.guessList}>
            {g.guesses.map((gx, i) => (
              <GuessRow key={i} index={i} guess={gx} />
            ))}
            {g.status === 'playing' &&
              Array.from({ length: g.MAX_GUESSES - g.guesses.length }).map((_, i) => (
                <EmptyRow key={`e-${i}`} index={g.guesses.length + i} prompt={i === 0} />
              ))}
          </div>

          {g.status === 'playing' ? (
            <div style={{ marginTop: 16 }}>
              <div style={styles.inputWrap}>
                <input
                  style={styles.input}
                  placeholder="Enter a diagnosis"
                  value={g.input}
                  onChange={(e) => g.setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      g.submitGuess()
                    }
                  }}
                  aria-label="Diagnosis guess"
                  autoFocus
                />
                <button className="tt-submit" style={styles.submitBtn} onClick={g.submitGuess}>
                  Submit →
                </button>
              </div>
              <div className="tt-monocaps" style={{ marginTop: 10, color: 'var(--ink-soft)' }}>
                Each incorrect guess reveals one new clue.
              </div>
            </div>
          ) : (
            <ResultBlock
              g={g}
              day={day}
              onOpenStats={() => setShowStats(true)}
            />
          )}
        </section>
      </div>

      {showHowTo && <HowToModal onClose={() => setShowHowTo(false)} />}
      {showStats && (
        <StatsModal
          stats={g.stats}
          winRate={g.winRate}
          onReset={() => {
            g.resetToday()
            setShowStats(false)
          }}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  )
}

function Header({
  day,
  headerDate,
  onHowTo,
  onStats,
}: {
  day: number
  headerDate: string
  onHowTo: () => void
  onStats: () => void
}) {
  return (
    <header style={styles.header}>
      <div style={styles.wordmark}>Torontordle</div>
      <nav className="tt-header-nav" style={styles.nav}>
        <button className="tt-monocaps" style={styles.navBtn} onClick={onHowTo}>How to play</button>
        <button className="tt-monocaps" style={styles.navBtn} onClick={onStats}>Stats</button>
        <span className="tt-date-badge" style={styles.dateBadge}>
          <span className="tt-monocaps" style={{ display: 'block', color: 'rgba(245,241,232,0.7)' }}>{headerDate}</span>
          <span style={{ fontFamily: SERIF, fontSize: 18, color: '#fff' }}>Day {String(day).padStart(3, '0')}</span>
        </span>
      </nav>
    </header>
  )
}

function GuessRow({ index, guess }: { index: number; guess: Guess }) {
  const base = { ...styles.guessRow, ...(guess.correct ? styles.guessRowOk : styles.guessRowNo) }
  return (
    <div style={base}>
      <span className="tt-monocaps" style={{ minWidth: 28 }}>{String(index + 1).padStart(2, '0')}</span>
      <span style={{ flex: 1, fontFamily: SERIF, fontSize: 16 }}>{guess.text}</span>
      <span className="tt-monocaps">{guess.correct ? 'Correct' : 'Incorrect'}</span>
    </div>
  )
}

function EmptyRow({ index, prompt }: { index: number; prompt: boolean }) {
  return (
    <div style={{ ...styles.guessRow, ...styles.guessRowEmpty }}>
      <span className="tt-monocaps" style={{ minWidth: 28, color: 'var(--ink-soft)' }}>{String(index + 1).padStart(2, '0')}</span>
      <span style={{ flex: 1, color: 'var(--ink-soft)' }}>{prompt ? 'Your turn…' : ''}</span>
    </div>
  )
}

function ResultBlock({
  g,
  day,
  onOpenStats,
}: {
  g: UseGame
  day: number
  onOpenStats: () => void
}) {
  const won = g.status === 'won'
  const [shareLabel, setShareLabel] = useState('Share results')

  const onShare = async () => {
    const text = buildShareText({
      dayNumber: day,
      guesses: g.guesses,
      won,
      maxGuesses: g.MAX_GUESSES,
      url: typeof window !== 'undefined' ? window.location.href : 'colintoft.com/torontordle',
    })
    const ok = await copyShare(text)
    setShareLabel(ok ? 'Copied!' : 'Copy failed')
    setTimeout(() => setShareLabel('Share results'), 1800)
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 18,
        background: won ? 'rgba(45,106,79,0.08)' : 'rgba(139,58,58,0.08)',
        border: `1px solid ${won ? 'rgba(45,106,79,0.3)' : 'rgba(139,58,58,0.3)'}`,
        borderRadius: 4,
      }}
    >
      <div className="tt-monocaps" style={{ color: won ? 'var(--correct)' : 'var(--wrong)' }}>
        {won ? 'Correct diagnosis' : 'Case closed'}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--uoft-navy)' }}>
        {g.tCase.diagnosis}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6, lineHeight: 1.5 }}>
        {won
          ? `Solved in ${g.guesses.length} ${g.guesses.length === 1 ? 'guess' : 'guesses'}. Streak: ${g.stats.streak} day${g.stats.streak === 1 ? '' : 's'}.`
          : 'Better luck tomorrow. New case at midnight ET.'}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="tt-submit" style={styles.primaryBtn} onClick={onShare}>{shareLabel}</button>
        <button className="tt-secondary" style={styles.secondaryBtn} onClick={onOpenStats}>View stats</button>
      </div>
      {g.tCase.description && (
        <>
          <hr className="tt-rule" style={{ margin: '16px 0 12px' }} />
          <div className="tt-monocaps" style={{ color: 'var(--uoft-navy)' }}>Study note</div>
          <p style={{ fontSize: 14, color: 'var(--ink)', marginTop: 6, lineHeight: 1.55 }}>
            {g.tCase.description}
          </p>
        </>
      )}
    </div>
  )
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const stop = (e: MouseEvent) => e.stopPropagation()
  return (
    <div style={modal.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={modal.panel} onClick={stop}>
        {children}
      </div>
    </div>
  )
}

function HowToModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div style={modal.headerRow}>
        <h2 style={modal.title}>How to play</h2>
        <button style={modal.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <hr className="tt-rule" style={{ margin: '12px 0 16px' }} />
      <ol style={{ paddingLeft: 18, lineHeight: 1.7, color: 'var(--ink)', margin: 0 }}>
        <li>A new case unfolds each day. You're given <strong>one symptom</strong> to start.</li>
        <li>Type a working diagnosis and submit. You have <strong>six guesses</strong>.</li>
        <li>Each incorrect guess reveals a new clinical clue — vitals, history, exam, labs, imaging.</li>
        <li>Solve the case with the fewest guesses to climb the leaderboard.</li>
      </ol>
      <div style={{ marginTop: 14, padding: 12, background: 'var(--uoft-bone)', border: '1px solid var(--line)' }}>
        <div className="tt-monocaps" style={{ color: 'var(--uoft-navy)' }}>For learning, not for clinical use</div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>
          Cases are simplified teaching vignettes written for U of T med students. Always defer to clinical judgment in
          practice.
        </p>
      </div>
    </Modal>
  )
}

function StatsModal({
  stats,
  winRate,
  onReset,
  onClose,
}: {
  stats: Stats
  winRate: number
  onReset: () => void
  onClose: () => void
}) {
  const distribution = stats.distribution
  const maxBar = Math.max(1, ...distribution)
  return (
    <Modal onClose={onClose}>
      <div style={modal.headerRow}>
        <h2 style={modal.title}>Your statistics</h2>
        <button style={modal.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <hr className="tt-rule" style={{ margin: '12px 0 16px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {([
          ['Played', stats.played],
          ['Win %', winRate],
          ['Streak', stats.streak],
          ['Best', stats.best ?? '—'],
        ] as const).map(([label, value]) => (
          <div key={label} style={{ textAlign: 'center', padding: '12px 0', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: 'var(--uoft-navy)' }}>{value}</div>
            <div className="tt-monocaps" style={{ color: 'var(--ink-soft)', fontSize: 10 }}>{label}</div>
          </div>
        ))}
      </div>
      <div className="tt-monocaps" style={{ marginTop: 18, color: 'var(--uoft-navy)' }}>Guess distribution</div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {distribution.map((n, i) => {
          const pct = (n / maxBar) * 100
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tt-monocaps" style={{ width: 16 }}>{i + 1}</span>
              <div style={{ flex: 1, height: 22, background: 'var(--uoft-bone)', position: 'relative' }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'var(--uoft-navy)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 8,
                    color: '#fff',
                    fontSize: 12,
                    minWidth: n > 0 ? 22 : 0,
                  }}
                >
                  {n > 0 ? n : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <hr className="tt-rule" style={{ margin: '20px 0 14px' }} />
      <div style={styles.resetRow}>
        <div>
          <div className="tt-monocaps" style={{ color: 'var(--ink-soft)' }}>Testing</div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            Replay today's case from scratch. Aggregate stats stay as they are.
          </p>
        </div>
        <button className="tt-secondary" style={styles.resetBtn} onClick={onReset}>
          Reset today
        </button>
      </div>
    </Modal>
  )
}

const styles: Record<string, CSSProperties> = {
  frame: {
    background: 'var(--uoft-paper)',
    minHeight: '100vh',
    fontFamily: SERIF,
    color: 'var(--ink)',
    padding: 28,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottom: '2px solid var(--uoft-navy)',
    gap: 16,
    flexWrap: 'wrap',
  },
  wordmark: {
    fontFamily: SERIF,
    fontSize: 26,
    fontWeight: 700,
    color: 'var(--uoft-navy)',
    letterSpacing: '-0.3px',
  },
  nav: { display: 'flex', gap: 20, alignItems: 'center' },
  navBtn: { color: 'var(--ink-soft)', padding: 0 },
  dateBadge: {
    background: 'var(--uoft-navy)',
    padding: '6px 14px',
    borderRadius: 2,
    textAlign: 'right',
    lineHeight: 1.1,
    display: 'inline-block',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.15fr 1fr',
    gap: 28,
    marginTop: 28,
  },
  casePanel: {
    background: '#fff',
    border: '1px solid var(--line)',
    padding: 24,
  },
  caseHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
    gap: 12,
  },
  clueList: {
    listStyle: 'none',
    padding: 0,
    margin: '16px 0 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  clueItem: { display: 'flex', gap: 14, paddingTop: 4 },
  clueNum: { fontFamily: SERIF, color: 'var(--uoft-navy)', fontSize: 13, fontWeight: 700, paddingTop: 2 },
  clueText: { margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--ink)' },
  skeletonBar: { height: 14, background: 'rgba(30,58,95,0.08)', borderRadius: 2, marginBottom: 6 },
  guessPanel: {
    background: '#fff',
    border: '1px solid var(--line)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
  },
  guessHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dotRow: { display: 'flex', gap: 6 },
  guessList: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 },
  guessRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    border: '1px solid var(--line)',
  },
  guessRowOk: {
    background: 'rgba(45,106,79,0.08)',
    borderColor: 'var(--correct)',
    color: 'var(--correct)',
  },
  guessRowNo: {
    background: 'rgba(139,58,58,0.05)',
    borderColor: 'rgba(139,58,58,0.3)',
  },
  guessRowEmpty: {
    background: 'var(--uoft-paper)',
    borderStyle: 'dashed',
  },
  inputWrap: {
    display: 'flex',
    border: '1px solid var(--uoft-navy)',
    background: '#fff',
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    border: 0,
    outline: 'none',
    fontFamily: SERIF,
    fontSize: 16,
    background: 'transparent',
    color: 'var(--ink)',
  },
  submitBtn: {
    padding: '0 18px',
    background: 'var(--uoft-navy)',
    color: '#fff',
    fontFamily: SERIF,
    fontSize: 12,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  primaryBtn: {
    padding: '8px 14px',
    background: 'var(--uoft-navy)',
    color: '#fff',
    borderRadius: 2,
    fontSize: 12,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: 'transparent',
    color: 'var(--uoft-navy)',
    border: '1px solid var(--uoft-navy)',
    borderRadius: 2,
    fontSize: 12,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  resetRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  resetBtn: {
    padding: '8px 14px',
    background: 'transparent',
    color: 'var(--uoft-navy)',
    border: '1px solid var(--uoft-navy)',
    borderRadius: 2,
    fontSize: 12,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
    flexShrink: 0,
  },
}

const dotStyle: Record<'open' | 'ok' | 'no', CSSProperties> = {
  open: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: '1px solid var(--uoft-navy)',
    display: 'inline-block',
  },
  ok: { width: 10, height: 10, borderRadius: '50%', background: 'var(--correct)', display: 'inline-block' },
  no: { width: 10, height: 10, borderRadius: '50%', background: 'var(--uoft-navy)', display: 'inline-block' },
}

const modal: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20,37,60,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: 20,
  },
  panel: {
    background: '#fff',
    maxWidth: 520,
    width: '100%',
    padding: 28,
    border: '1px solid var(--line)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    fontFamily: SERIF,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: { margin: 0, fontSize: 24, color: 'var(--uoft-navy)', fontFamily: SERIF, fontWeight: 700 },
  close: { fontSize: 22, color: 'var(--ink-soft)', lineHeight: 1, padding: '0 4px' },
}
