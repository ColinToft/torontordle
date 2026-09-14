import { parseCSV } from './csv'
import { splitReference } from './references'
import type { CaseImageManifest, TCase } from './types'

/**
 * Sheet schema (case-insensitive, header row located automatically — any
 * preamble/scratch tables above it are ignored). Column titles are matched by
 * prefix, so trailing annotations like "Clue 1 (chief complaint; broad)" are
 * fine. Required columns:
 *   - "Diagnosis?" or "Diagnosis"   → full diagnosis (the parenthetical and the
 *                                     stem are both added as aliases — dropdown
 *                                     search terms, NOT accepted answers; only
 *                                     the full string is, see src/guess.ts)
 *   - "Clue 1" … "Clue 6"            → clue body text (1–8 supported)
 * Optional columns:
 *   - "Week" or "Category"           → grouping label; carried down to blank
 *                                     rows beneath the first row of each block
 *   - "Aliases"                      → pipe- or semicolon-separated search terms
 *   - "Date to Be Opened" / "Unlock…" → the date a week's cases enter the pool;
 *                                     first row of each block, carried down.
 *                                     YYYY-MM-DD, M/D/YYYY, or "Month D, YYYY";
 *                                     anything else throws (fail loud, never
 *                                     silently open a week)
 *   - "Description"                  → study note shown after the case ends
 *   - "Management?" or "Management"  → model answer for the post-case
 *                                     free-text management compare step
 *   - "Clue 1 type" … "Clue 6 type"  → optional small-caps label per clue
 *   - a "drop down" description column → expandable detail + citation for the
 *                                     clue immediately to its left (associated
 *                                     by position; "Retrieved from <ref>" split
 *                                     into detail + reference)
 */
export function parseSheetCsv(text: string, images: CaseImageManifest = {}): TCase[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []

  // Locate the actual header row — sheets often have a "For reference:" or
  // similar preamble row above the column titles.
  const headerRowIdx = findHeaderRow(rows)
  if (headerRowIdx < 0) return []
  const header = rows[headerRowIdx].map((h) => h.trim().toLowerCase())

  // Exact-match column lookup.
  const findCol = (names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n.toLowerCase())
      if (i >= 0) return i
    }
    return -1
  }
  // Prefix-match column lookup — headers in the live sheet carry trailing
  // annotations, e.g. "Description (includes pathophysiology…)" or
  // "Management? (free text, user will just compare to provided answer)".
  const findColPrefix = (prefixes: string[]): number => {
    for (const p of prefixes) {
      const i = header.findIndex((h) => h.startsWith(p.toLowerCase()))
      if (i >= 0) return i
    }
    return -1
  }

  const idxDiagnosis = findCol(['diagnosis?', 'diagnosis'])
  const idxAliases = findCol(['aliases', 'alias'])
  const idxCategory = findCol(['week', 'category', 'topic'])
  const idxDescription = findColPrefix(['description', 'study note', 'notes'])
  const idxManagement = findColPrefix(['management'])
  // Optional: the date a week's cases become available. Like Week, it's filled
  // on the first row of each block and carried down. Absent column / blank →
  // null (always available). The live sheet titles it "Date to Be Opened".
  const idxUnlock = findColPrefix(['date to be opened', 'unlock'])
  if (idxDiagnosis < 0) return []

  // Up to 8 clue columns. The clue body header embeds its type in a trailing
  // parenthetical in the live sheet, e.g. "Clue 1 (most typical chief
  // complaint; broad)". An optional separate "Clue N type" column (older
  // sheets) supplies the small-caps label when present.
  const clueCols: { n: number; typeIdx: number; textIdx: number; detailIdx: number }[] = []
  for (let n = 1; n <= 8; n++) {
    const typeIdx = header.findIndex((h) => new RegExp(`^clue ?${n} type`).test(h))
    const textIdx = header.findIndex(
      (h, i) => i !== typeIdx && new RegExp(`^clue ?${n}\\b`).test(h),
    )
    if (textIdx < 0) continue
    clueCols.push({ n, typeIdx, textIdx, detailIdx: -1 })
  }

  // A "drop-down" description column elaborates the clue immediately to its left
  // (imaging after Clue 5, pathology after Clue 6). Associate by position — the
  // header wording varies and contains typos ("Clue 5 (lmaging)"), so we match
  // only the "drop down"/"drop-down"/"dropdown" marker and bind each to the
  // first such column between its clue and the next clue (or the diagnosis).
  const isDropdown = (h: string) => /drop\s*-?\s*down/.test(h)
  const dropdownIdxs = header.map((h, i) => (isDropdown(h) ? i : -1)).filter((i) => i >= 0)
  for (let k = 0; k < clueCols.length; k++) {
    const start = clueCols[k].textIdx
    const end =
      k + 1 < clueCols.length
        ? clueCols[k + 1].textIdx
        : idxDiagnosis > start
          ? idxDiagnosis
          : Infinity
    const d = dropdownIdxs.find((i) => i > start && i < end)
    if (d !== undefined) clueCols[k].detailIdx = d
  }

  const cases: TCase[] = []
  // The Week and Unlock-date columns are filled only on the first row of each
  // week's block; carry the last non-empty value down to the rows beneath it.
  let lastCategory = 'General'
  let lastUnlock: string | null = null
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]

    const categoryCell = (idxCategory >= 0 ? row[idxCategory] : '')?.trim()
    if (categoryCell) lastCategory = categoryCell

    const unlockCell = (idxUnlock >= 0 ? row[idxUnlock] : '')?.trim()
    if (unlockCell) lastUnlock = parseUnlockDate(unlockCell, ` (row ${r + 1})`)

    const rawDiagnosis = (row[idxDiagnosis] ?? '').trim()
    if (!rawDiagnosis) continue

    const { diagnosis, derivedAliases } = splitDiagnosis(rawDiagnosis)
    const sheetAliases = parseAliases(idxAliases >= 0 ? row[idxAliases] : '')
    const aliases = dedupe([...derivedAliases, ...sheetAliases])

    const category = lastCategory
    const description = (idxDescription >= 0 ? row[idxDescription] : '')?.trim() || undefined
    const management = (idxManagement >= 0 ? row[idxManagement] : '')?.trim() || undefined

    const caseImages = images[diagnosis] ?? {}
    const clues = clueCols
      .map(({ n, typeIdx, textIdx, detailIdx }) => {
        const rawDetail = detailIdx >= 0 ? (row[detailIdx] ?? '').trim() : ''
        const { detail, reference } = splitReference(rawDetail)
        return {
          type: typeIdx >= 0 ? (row[typeIdx] ?? '').trim() : '',
          text: (row[textIdx] ?? '').trim(),
          image: caseImages[String(n)] || undefined,
          detail: detail || undefined,
          reference: reference || undefined,
        }
      })
      // Keep a clue if it carries anything — an image- or caption-only clue has
      // no text in the CSV (the cell holds an in-cell image) but is still real.
      .filter((c) => c.text || c.image || c.detail || c.reference)

    if (clues.length === 0) continue

    cases.push({ id: r, diagnosis, aliases, category, unlockDate: lastUnlock, clues, description, management })
  }
  return cases
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// Parse a non-empty unlock-date cell to YYYY-MM-DD. Accepts ISO (2026-09-28),
// M/D/YYYY (how gviz renders date-typed cells), and the long form the authors
// actually type ("September 28, 2026", "Sept 28 2026", "Sep. 28, 2026").
// Anything else — or an impossible calendar date — throws: a silent null would
// quietly make that week always available, which is the one thing this column
// exists to prevent. `where` is appended to the error for locating the cell.
export function parseUnlockDate(raw: string, where = ''): string {
  const s = raw.trim()
  const fail = (): never => {
    throw new Error(
      `Unparseable unlock date ${JSON.stringify(raw)}${where}; expected YYYY-MM-DD, M/D/YYYY, or "Month D, YYYY"`,
    )
  }
  let y: number, m: number, d: number
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const long = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (mdy) [y, m, d] = [Number(mdy[3]), Number(mdy[1]), Number(mdy[2])]
  else if (long) {
    const name = long[1].toLowerCase()
    const mi = MONTHS.findIndex((full) => full.startsWith(name))
    if (mi < 0) return fail()
    ;[y, m, d] = [Number(long[3]), mi + 1, Number(long[2])]
  } else return fail()
  // Reject impossible dates (month 13, Feb 30, …) by round-tripping through UTC.
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return fail()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Find the real column-title row. The live sheet stacks several preamble
// tables (instructions, author assignments, a week list, scratch examples)
// above it, so we scan the whole sheet rather than just the first few rows.
// Requiring BOTH a diagnosis cell and a "Clue 1…" cell disambiguates the real
// header from the scratch tables, which lack a literal "Clue 1" column title.
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim().toLowerCase())
    const hasDiagnosis = cells.some((c) => c === 'diagnosis?' || c === 'diagnosis')
    const hasClue = cells.some((c) => /^clue ?1\b/.test(c))
    if (hasDiagnosis && hasClue) return i
  }
  return -1
}

// The full string is the canonical (and only accepted) answer; the stem and
// the parenthetical become aliases so typing either finds it in the dropdown.
// "Trisomy 21 (Down Syndrome)"
//   → { diagnosis: "Trisomy 21 (Down Syndrome)",
//       derivedAliases: ["Down Syndrome", "Trisomy 21"] }
// "Anaphylaxis"
//   → { diagnosis: "Anaphylaxis", derivedAliases: [] }
function splitDiagnosis(raw: string): { diagnosis: string; derivedAliases: string[] } {
  const trimmed = raw.trim()
  const m = trimmed.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (!m) return { diagnosis: trimmed, derivedAliases: [] }
  const main = m[1].trim()
  const inside = m[2].trim()
  const insideAliases = inside.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
  return {
    diagnosis: trimmed,
    derivedAliases: [...insideAliases, main],
  }
}

function parseAliases(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}
