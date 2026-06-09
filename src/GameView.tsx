import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import type { Guess, Stats, TCase, Year } from './types'
import { dayNumber as computeDayNumber, formatHeaderDate } from './dailyCase'
import { normalizeAnswer } from './normalize'
import { referenceHref } from './references'
import { buildShareText, copyShare } from './share'
import type { UseGame } from './useGame'
import type { ArchiveDay, Nav } from './App'
import { loadDailyProgress } from './storage'

const SERIF = "'Source Serif Pro', Georgia, serif"

export function GameView({ g, nav }: { g: UseGame; nav: Nav }) {
  const [showAbout, setShowAbout] = useState(false)
  const [showHowTo, setShowHowTo] = useState(false)
  const [showStats, setShowStats] = useState(false)
  // Highlight today's bar in the distribution only when the player won today.
  const todayGuess = !g.archive && g.status === 'won' ? g.guesses.length : null

  const visibleClues = g.tCase.clues.slice(0, g.cluesRevealed)
  const lockedCount = Math.max(0, g.tCase.clues.length - visibleClues.length)
  const day = computeDayNumber(g.dateStr)
  const headerDate = formatHeaderDate(g.dateStr)
  // The week/category is a strong hint toward the diagnosis, so keep it hidden
  // while playing and reveal it only once the case is over.
  const caseLabel =
    `Case No. ${String(day).padStart(3, '0')}` +
    (g.status === 'playing' ? '' : ` · ${g.tCase.category}`)

  return (
    <div className="tt-frame" style={styles.frame}>
      <Header
        day={day}
        headerDate={headerDate}
        nav={nav}
        onAbout={() => setShowAbout(true)}
        onHowTo={() => setShowHowTo(true)}
        onStats={() => setShowStats(true)}
      />

      {g.archive && (
        <div style={styles.archiveBanner}>
          <span className="tt-monocaps" style={{ color: 'var(--uoft-navy)' }}>
            Archive · practice — results don't affect your stats
          </span>
          <button className="tt-monocaps" style={styles.archiveBack} onClick={nav.exitArchive}>
            ← Back to today
          </button>
        </div>
      )}

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
                  {c.text && <p style={styles.clueText}>{c.text}</p>}
                  {c.image && (
                    <img
                      src={import.meta.env.BASE_URL + c.image}
                      alt="Clinical image for this case"
                      style={styles.clueImage}
                      loading="lazy"
                    />
                  )}
                  {c.detail && (
                    <details style={styles.clueDetails}>
                      <summary className="tt-monocaps" style={styles.clueSummary}>Show detail</summary>
                      <p style={styles.clueDetailText}>{c.detail}</p>
                    </details>
                  )}
                  {c.reference && <ClueReference reference={c.reference} />}
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
              <GuessCombobox g={g} />
              <div className="tt-monocaps" style={{ marginTop: 10, color: 'var(--ink-soft)' }}>
                Each incorrect guess reveals one new clue. No idea? Submit blank to skip.
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

      <footer style={styles.disclaimer}>
        *Torontordle is for entertainment only and does not constitute medical advice. Consult a healthcare
        professional for health concerns.
        <div style={{ marginTop: 8 }}>
          Questions, corrections, or feedback?{' '}
          <a href="mailto:contact@torontordle.com" style={styles.contactLink}>contact@torontordle.com</a>
        </div>
      </footer>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showHowTo && <HowToModal onClose={() => setShowHowTo(false)} />}
      {nav.showArchives && (
        <ArchivesModal
          year={nav.year}
          days={nav.archiveDays}
          activeDate={nav.archiveDate}
          onPick={nav.onPickArchive}
          onClose={nav.closeArchives}
        />
      )}
      {showStats && (
        <StatsModal
          stats={g.stats}
          winRate={g.winRate}
          todayGuess={todayGuess}
          onReset={() => {
            g.resetEverything()
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
  nav,
  onAbout,
  onHowTo,
  onStats,
}: {
  day: number
  headerDate: string
  nav: Nav
  onAbout: () => void
  onHowTo: () => void
  onStats: () => void
}) {
  return (
    <header style={styles.header}>
      <div style={styles.wordmark}>Torontordle</div>
      <nav className="tt-header-nav" style={styles.nav}>
        <button className="tt-monocaps" style={styles.navBtn} onClick={onAbout}>About</button>
        <button className="tt-monocaps" style={styles.navBtn} onClick={onHowTo}>How to play</button>
        <button className="tt-monocaps" style={styles.navBtn} onClick={onStats}>Stats</button>
        <span style={styles.yearToggle} role="tablist" aria-label="Choose year">
          {(['1', '2'] as Year[]).map((y) => (
            <button
              key={y}
              className="tt-monocaps"
              role="tab"
              aria-selected={nav.year === y}
              style={nav.year === y ? styles.yearOn : styles.yearOff}
              onClick={() => nav.setYear(y)}
              title={`Year ${y} Daily Diagnosis`}
            >
              Year {y}
            </button>
          ))}
        </span>
        <button className="tt-monocaps" style={styles.navBtn} onClick={nav.openArchives}>Archives</button>
        <span className="tt-date-badge" style={styles.dateBadge}>
          <span className="tt-monocaps" style={{ display: 'block', color: 'rgba(245,241,232,0.7)' }}>{headerDate}</span>
          <span style={{ fontFamily: SERIF, fontSize: 18, color: '#fff' }}>Day {String(day).padStart(3, '0')}</span>
        </span>
      </nav>
    </header>
  )
}

function GuessCombobox({ g }: { g: UseGame }) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const usedSet = useMemo(
    () => new Set(g.guesses.map((gx) => normalizeAnswer(gx.text))),
    [g.guesses],
  )

  const matches: TCase[] = useMemo(() => {
    const q = g.input.trim().toLowerCase()
    return g.cases
      .filter((c) => !usedSet.has(normalizeAnswer(c.diagnosis)))
      .filter((c) => {
        if (!q) return true
        if (c.diagnosis.toLowerCase().includes(q)) return true
        return c.aliases.some((a) => a.toLowerCase().includes(q))
      })
  }, [g.cases, g.input, usedSet])

  const isValid = useMemo(() => {
    const norm = normalizeAnswer(g.input)
    if (!norm) return false
    return g.cases.some(
      (c) =>
        !usedSet.has(normalizeAnswer(c.diagnosis)) &&
        (normalizeAnswer(c.diagnosis) === norm ||
          c.aliases.some((a) => normalizeAnswer(a) === norm)),
    )
  }, [g.cases, g.input, usedSet])

  // With nothing typed, Submit becomes a "skip" that reveals the next clue at
  // the cost of one guess — a way out when you have no idea.
  const canPass = g.input.trim().length === 0

  // Keep the highlighted index in range as the filtered matches change.
  // Done during render (not in an effect) to avoid a wasted commit; the
  // guard makes this idempotent, so it can't loop — even when matches is
  // empty (maxIndex 0, highlighted clamps to 0 and then stops).
  const maxIndex = Math.max(0, matches.length - 1)
  if (highlighted > maxIndex) setHighlighted(maxIndex)

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Scroll the highlighted option into view as it changes.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlighted] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  const select = (diagnosis: string) => {
    g.setInput(diagnosis)
    setOpen(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setHighlighted((h) => Math.min(matches.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return
      setHighlighted((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && matches.length > 0 && !isValid) {
        select(matches[highlighted].diagnosis)
      } else if (isValid) {
        setOpen(false)
        g.submitGuess()
      } else if (canPass) {
        setOpen(false)
        g.passGuess()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={styles.inputWrap}>
        <input
          ref={inputRef}
          style={styles.input}
          placeholder="Enter a diagnosis"
          value={g.input}
          onChange={(e) => {
            g.setInput(e.target.value)
            setOpen(e.target.value.length > 0)
          }}
          onKeyDown={onKeyDown}
          aria-label="Diagnosis guess"
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
          autoFocus
        />
        <button
          className="tt-submit"
          style={{
            ...styles.submitBtn,
            opacity: isValid || canPass ? 1 : 0.5,
            cursor: isValid || canPass ? 'pointer' : 'not-allowed',
          }}
          onClick={() => {
            setOpen(false)
            if (isValid) g.submitGuess()
            else if (canPass) g.passGuess()
          }}
          disabled={!isValid && !canPass}
        >
          {isValid || !canPass ? 'Submit →' : 'Skip clue →'}
        </button>
      </div>
      {open && matches.length > 0 && (
        <ul ref={listRef} style={styles.suggestList} role="listbox">
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === highlighted}
              style={{
                ...styles.suggestItem,
                ...(i === highlighted ? styles.suggestItemHighlighted : {}),
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                select(c.diagnosis)
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              {c.diagnosis}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function GuessRow({ index, guess }: { index: number; guess: Guess }) {
  if (guess.passed) {
    return (
      <div style={{ ...styles.guessRow, ...styles.guessRowPass }}>
        <span className="tt-monocaps" style={{ minWidth: 28, color: 'var(--ink-soft)' }}>{String(index + 1).padStart(2, '0')}</span>
        <span style={{ flex: 1, fontFamily: SERIF, fontSize: 16, fontStyle: 'italic', color: 'var(--ink-soft)' }}>
          Skipped — clue revealed
        </span>
        <span className="tt-monocaps" style={{ color: 'var(--ink-soft)' }}>Skipped</span>
      </div>
    )
  }
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

// Citation for an image/drop-down clue. Shown inline under the clue (a bare
// DOI/URL isn't itself a spoiler — the interpretive caption stays collapsed
// in the <details> above). DOIs resolve through doi.org; non-linkable refs
// render as plain text.
function ClueReference({ reference }: { reference: string }) {
  const href = referenceHref(reference)
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={styles.refLink}>
      Reference ↗
    </a>
  ) : (
    <span style={styles.refPlain}>Reference: {reference}</span>
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
  // The study note describes management/pathophysiology, so it would spoil the
  // management step. Hold it back until the player reveals the model answer
  // (or show it immediately when the case has no management step).
  const [mgmtRevealed, setMgmtRevealed] = useState(false)
  const showStudyNote = Boolean(g.tCase.description) && (!g.tCase.management || mgmtRevealed)

  const onShare = async () => {
    const text = buildShareText({
      dayNumber: day,
      guesses: g.guesses,
      won,
      maxGuesses: g.MAX_GUESSES,
      url: typeof window !== 'undefined' ? window.location.href : 'torontordle.com',
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
          ? `Solved in ${g.guesses.length} ${g.guesses.length === 1 ? 'guess' : 'guesses'}.` +
            (g.archive ? '' : ` Streak: ${g.stats.streak} day${g.stats.streak === 1 ? '' : 's'}.`)
          : g.archive
            ? 'Practice case — no stats affected.'
            : 'Better luck tomorrow. New case at midnight ET.'}
      </p>
      {g.tCase.management && (
        <ManagementPanel answer={g.tCase.management} onReveal={() => setMgmtRevealed(true)} />
      )}
      {showStudyNote && (
        <>
          <hr className="tt-rule" style={{ margin: '16px 0 12px' }} />
          <div className="tt-monocaps" style={{ color: 'var(--uoft-navy)' }}>Study note</div>
          <p style={{ fontSize: 14, color: 'var(--ink)', marginTop: 6, lineHeight: 1.55 }}>
            {g.tCase.description}
          </p>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="tt-submit" style={styles.primaryBtn} onClick={onShare}>{shareLabel}</button>
        <button className="tt-secondary" style={styles.secondaryBtn} onClick={onOpenStats}>View stats</button>
      </div>
    </div>
  )
}

// Post-case learning step: ask how the student would manage the patient, then
// reveal the model answer to self-compare. Reveal-and-compare only — the draft
// is ephemeral (intentionally not persisted) and never scored.
function ManagementPanel({ answer, onReveal }: { answer: string; onReveal: () => void }) {
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState(false)

  return (
    <div style={{ marginTop: 16 }}>
      <hr className="tt-rule" style={{ margin: '4px 0 12px' }} />
      <div className="tt-monocaps" style={{ color: 'var(--uoft-navy)' }}>Management</div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '6px 0 8px', lineHeight: 1.5 }}>
        How would you manage this patient?
      </p>
      <textarea
        style={styles.managementInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type your management plan…"
        aria-label="Your management plan"
        readOnly={revealed}
        rows={3}
      />
      {!revealed ? (
        <button
          className="tt-secondary"
          style={{ ...styles.secondaryBtn, marginTop: 10 }}
          onClick={() => {
            setRevealed(true)
            onReveal()
          }}
        >
          Reveal model answer
        </button>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: 'var(--uoft-bone)',
            border: '1px solid var(--line)',
            borderRadius: 4,
          }}
        >
          <div className="tt-monocaps" style={{ color: 'var(--uoft-navy)' }}>Model answer</div>
          <p style={{ fontSize: 14, color: 'var(--ink)', marginTop: 6, lineHeight: 1.55 }}>
            {answer}
          </p>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, lineHeight: 1.5 }}>
            Compare against your own answer — use your judgment.
          </p>
        </div>
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

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div style={modal.headerRow}>
        <h2 style={modal.title}>About</h2>
        <button style={modal.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <hr className="tt-rule" style={{ margin: '12px 0 16px' }} />
      <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--ink)' }}>
        Torontordle is a student-led educational initiative created to provide high-quality, peer-developed
        learning resources aligned with pre-clerkship expectations. Designed by medical students, for medical
        students, daily puzzles are developed with mentor oversight to ensure accuracy, relevance, and
        educational value.
      </p>
      <p style={{ margin: '14px 0 0', lineHeight: 1.7, color: 'var(--ink)' }}>
        The goal of Torontordle is not only to reinforce previously learned material, but also to promote
        long-term retention and strengthen clinical reasoning skills over time. As students progress through
        different curriculum blocks, the cases are designed to build on foundational knowledge, encourage
        integration across disciplines, and support the development of diagnostic and management-based thinking
        in an engaging, low-stakes format in preparation for shadowing opportunities and clerkship.
      </p>
    </Modal>
  )
}

function ArchivesModal({
  year,
  days,
  activeDate,
  onPick,
  onClose,
}: {
  year: Year
  days: ArchiveDay[]
  activeDate: string | null
  onPick: (date: string) => void
  onClose: () => void
}) {
  return (
    <Modal onClose={onClose}>
      <div style={modal.headerRow}>
        <h2 style={modal.title}>Archives · Year {year}</h2>
        <button style={modal.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>
        Replay any past day. Practice only — these don't affect your stats.
      </p>
      <hr className="tt-rule" style={{ margin: '12px 0 8px' }} />
      {days.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>No past days yet.</p>
      ) : (
        <div style={{ maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {days.map((d) => {
            const prog = loadDailyProgress(year, d.date, true)
            const mark = prog?.status === 'won' ? '🟩' : prog?.status === 'lost' ? '🟥' : '▢'
            return (
              <button
                key={d.date}
                onClick={() => onPick(d.date)}
                style={{ ...archiveRow, ...(activeDate === d.date ? archiveRowActive : null) }}
              >
                <span style={{ fontFamily: SERIF, color: 'var(--uoft-navy)', fontWeight: 700, width: 70 }}>
                  Day {String(d.day).padStart(3, '0')}
                </span>
                <span style={{ flex: 1, color: 'var(--ink-soft)', fontSize: 13 }}>{formatHeaderDate(d.date)}</span>
                <span aria-hidden style={{ fontSize: 13 }}>{mark}</span>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

const archiveRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 8px',
  borderBottom: '1px solid var(--line)',
  textAlign: 'left',
  width: '100%',
}
const archiveRowActive: CSSProperties = { background: 'rgba(30,58,95,0.06)' }

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
        <li>When the case closes, jot down how you'd manage the patient and compare against a model answer.</li>
      </ol>
      <div style={{ marginTop: 14, padding: 12, background: 'var(--uoft-bone)', border: '1px solid var(--line)' }}>
        <div className="tt-monocaps" style={{ color: 'var(--uoft-navy)' }}>For learning, not for clinical use</div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>
          Cases are simplified teaching vignettes written for pre-clerkship medical students. Always defer to clinical
          judgment in practice.
        </p>
      </div>
    </Modal>
  )
}

function StatsModal({
  stats,
  winRate,
  todayGuess,
  percentile,
  onReset,
  onClose,
}: {
  stats: Stats
  winRate: number
  todayGuess?: number | null // 1-based guess count of today's win, to highlight its bar
  percentile?: number | null // "top N% of players today" — needs the (not-yet-built) backend
  onReset: () => void
  onClose: () => void
}) {
  const distribution = stats.distribution
  const maxBar = Math.max(1, ...distribution)
  const cards: [string, string | number][] = [
    ['Games played', stats.played],
    ['Win rate', `${winRate}%`],
    ['Current streak', stats.streak],
    ['Longest streak', stats.maxStreak],
  ]
  return (
    <Modal onClose={onClose}>
      <div style={modal.headerRow}>
        <h2 style={modal.title}>Your statistics</h2>
        <button style={modal.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <hr className="tt-rule" style={{ margin: '12px 0 16px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {cards.map(([label, value]) => (
          <div key={label} style={statBox.card}>
            <div style={statBox.value}>{value}</div>
            <div className="tt-monocaps" style={statBox.label}>{label}</div>
          </div>
        ))}
      </div>

      <div style={statBox.distPanel}>
        <div className="tt-section-title" style={{ textAlign: 'center', color: 'var(--uoft-navy)', fontSize: 13 }}>
          Guess distribution
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {distribution.map((n, i) => {
            const pct = (n / maxBar) * 100
            const isToday = todayGuess === i + 1
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={isToday ? statBox.rowNumToday : statBox.rowNum}>{i + 1}</span>
                <div style={statBox.track}>
                  {n > 0 && (
                    <div style={{ ...statBox.fill, width: `${Math.max(pct, 12)}%` }}>{n}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {percentile != null && (
        <div style={statBox.percentile}>
          🐙 You were in the <strong>top {percentile}%</strong> of players today!
        </div>
      )}

      <hr className="tt-rule" style={{ margin: '20px 0 14px' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="tt-secondary" style={styles.resetBtn} onClick={onReset}>
          Reset everything
        </button>
      </div>
    </Modal>
  )
}

const TEAL = '#0f766e'
const statBox: Record<string, CSSProperties> = {
  card: {
    textAlign: 'center',
    padding: '14px 4px',
    border: '1px solid var(--line)',
    borderRadius: 10,
    background: 'var(--uoft-paper)',
  },
  value: { fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: TEAL, lineHeight: 1.1 },
  label: { color: 'var(--ink-soft)', fontSize: 9, marginTop: 6, display: 'block' },
  distPanel: {
    marginTop: 16,
    padding: 16,
    border: '1px solid var(--line)',
    borderRadius: 10,
    background: 'var(--uoft-paper)',
  },
  rowNum: { width: 18, textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' },
  rowNumToday: {
    width: 18,
    textAlign: 'center',
    fontSize: 13,
    color: TEAL,
    fontWeight: 700,
    border: `1.5px solid ${TEAL}`,
    borderRadius: 5,
  },
  track: { flex: 1, height: 24, background: 'var(--uoft-bone)', borderRadius: 5, overflow: 'hidden' },
  fill: {
    height: '100%',
    background: `linear-gradient(90deg, #14b8a6, ${TEAL})`,
    borderRadius: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
  },
  percentile: {
    marginTop: 16,
    padding: '14px 16px',
    border: '1px solid rgba(15,118,110,0.35)',
    borderRadius: 10,
    background: 'rgba(20,184,166,0.10)',
    textAlign: 'center',
    fontFamily: SERIF,
    fontSize: 15,
    color: 'var(--ink)',
  },
}

const styles: Record<string, CSSProperties> = {
  frame: {
    background: 'var(--uoft-paper)',
    minHeight: '100vh',
    fontFamily: SERIF,
    color: 'var(--ink)',
    padding: 28,
  },
  disclaimer: {
    maxWidth: 720,
    margin: '32px auto 0',
    paddingTop: 16,
    borderTop: '1px solid var(--line)',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 1.5,
    letterSpacing: '0.02em',
    color: 'var(--ink-soft)',
  },
  contactLink: {
    color: 'var(--uoft-navy)',
    textDecoration: 'none',
    borderBottom: '1px solid var(--line)',
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
  nav: { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  navBtn: { color: 'var(--ink-soft)', padding: 0 },
  yearToggle: { display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden' },
  yearOn: { background: 'var(--uoft-navy)', color: '#fff', padding: '4px 10px' },
  yearOff: { background: 'transparent', color: 'var(--ink-soft)', padding: '4px 10px' },
  archiveBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    margin: '0 0 16px',
    padding: '10px 14px',
    background: 'rgba(30,58,95,0.06)',
    border: '1px solid var(--line)',
    borderRadius: 4,
  },
  archiveBack: { color: 'var(--uoft-navy)', borderBottom: '1px solid var(--uoft-navy)', paddingBottom: 1 },
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
  clueNum: { fontFamily: SERIF, color: 'var(--uoft-navy)', fontSize: 13, fontWeight: 700, lineHeight: 1.55 },
  clueText: { margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--ink)' },
  clueImage: {
    display: 'block',
    marginTop: 8,
    maxWidth: '100%',
    maxHeight: 280,
    width: 'auto',
    height: 'auto',
    border: '1px solid var(--line)',
    borderRadius: 4,
    background: 'var(--uoft-bone)',
  },
  clueDetails: {
    marginTop: 8,
    paddingLeft: 12,
    borderLeft: '2px solid var(--line)',
  },
  clueSummary: {
    color: 'var(--uoft-navy)',
    cursor: 'pointer',
    fontSize: 10,
    width: 'fit-content',
  },
  clueDetailText: {
    margin: '8px 0 0',
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--ink-soft)',
  },
  refLink: {
    display: 'inline-block',
    marginTop: 8,
    fontSize: 12,
    color: 'var(--uoft-navy)',
    textDecoration: 'underline',
  },
  refPlain: {
    display: 'inline-block',
    marginTop: 8,
    fontSize: 12,
    color: 'var(--ink-soft)',
  },
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
  guessRowPass: {
    background: 'var(--uoft-bone)',
    borderColor: 'var(--line)',
    borderStyle: 'dashed',
  },
  inputWrap: {
    display: 'flex',
    border: '1px solid var(--uoft-navy)',
    background: '#fff',
  },
  suggestList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: -1,
    listStyle: 'none',
    padding: 0,
    background: '#fff',
    border: '1px solid var(--uoft-navy)',
    maxHeight: 220,
    overflowY: 'auto',
    zIndex: 30,
    boxShadow: '0 6px 18px rgba(20, 37, 60, 0.08)',
  },
  suggestItem: {
    padding: '10px 14px',
    fontFamily: SERIF,
    fontSize: 15,
    color: 'var(--ink)',
    cursor: 'pointer',
    borderTop: '1px solid var(--line)',
  },
  suggestItemHighlighted: {
    background: 'rgba(30, 58, 95, 0.08)',
    color: 'var(--uoft-navy)',
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
  managementInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    border: '1px solid var(--uoft-navy)',
    outline: 'none',
    fontFamily: SERIF,
    fontSize: 15,
    lineHeight: 1.5,
    background: '#fff',
    color: 'var(--ink)',
    resize: 'vertical',
    minHeight: 72,
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
