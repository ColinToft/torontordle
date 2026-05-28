import { parseCSV } from './csv'
import type { TCase } from './types'

// Google Sheet ID for the diagnosis bank.
// Sheet URL: https://docs.google.com/spreadsheets/d/117TT_NYZmtaaMrRUIcQXlFxVqZ0Dl2zFIYqcctUFKGI/
// The sheet must be shared "Anyone with the link → Viewer" (or Published to web)
// for the gviz/CSV endpoint to be reachable from the browser.
export const SHEET_ID = '117TT_NYZmtaaMrRUIcQXlFxVqZ0Dl2zFIYqcctUFKGI'
export const SHEET_GID = '0'

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`

/**
 * Sheet schema (case-insensitive, header row located automatically — any
 * preamble/scratch tables above it are ignored). Column titles are matched by
 * prefix, so trailing annotations like "Clue 1 (chief complaint; broad)" are
 * fine. Required columns:
 *   - "Diagnosis?" or "Diagnosis"   → full diagnosis (the parenthetical and the
 *                                     stem are both added as accepted aliases)
 *   - "Clue 1" … "Clue 6"            → clue body text (1–8 supported)
 * Optional columns:
 *   - "Week" or "Category"           → grouping label; carried down to blank
 *                                     rows beneath the first row of each block
 *   - "Aliases"                      → pipe- or semicolon-separated alternates
 *   - "Description"                  → study note shown after the case ends
 *   - "Clue 1 type" … "Clue 6 type"  → optional small-caps label per clue
 */
export async function fetchCasesFromSheet(): Promise<TCase[]> {
  const res = await fetch(SHEET_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
  const text = await res.text()
  return parseSheetCsv(text)
}

export function parseSheetCsv(text: string): TCase[] {
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
  if (idxDiagnosis < 0) return []

  // Up to 8 clue columns. The clue body header embeds its type in a trailing
  // parenthetical in the live sheet, e.g. "Clue 1 (most typical chief
  // complaint; broad)". An optional separate "Clue N type" column (older
  // sheets) supplies the small-caps label when present.
  const clueCols: { typeIdx: number; textIdx: number }[] = []
  for (let n = 1; n <= 8; n++) {
    const typeIdx = header.findIndex((h) => new RegExp(`^clue ?${n} type`).test(h))
    const textIdx = header.findIndex(
      (h, i) => i !== typeIdx && new RegExp(`^clue ?${n}\\b`).test(h),
    )
    if (textIdx < 0) continue
    clueCols.push({ typeIdx, textIdx })
  }

  const cases: TCase[] = []
  // The Week column is filled only on the first row of each week's block;
  // carry the last non-empty value down to the rows beneath it.
  let lastCategory = 'General'
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]

    const categoryCell = (idxCategory >= 0 ? row[idxCategory] : '')?.trim()
    if (categoryCell) lastCategory = categoryCell

    const rawDiagnosis = (row[idxDiagnosis] ?? '').trim()
    if (!rawDiagnosis) continue

    const { diagnosis, derivedAliases } = splitDiagnosis(rawDiagnosis)
    const sheetAliases = parseAliases(idxAliases >= 0 ? row[idxAliases] : '')
    const aliases = dedupe([...derivedAliases, ...sheetAliases])

    const category = lastCategory
    const description = (idxDescription >= 0 ? row[idxDescription] : '')?.trim() || undefined

    const clues = clueCols
      .map(({ typeIdx, textIdx }) => ({
        type: typeIdx >= 0 ? (row[typeIdx] ?? '').trim() : '',
        text: (row[textIdx] ?? '').trim(),
      }))
      .filter((c) => c.text.length > 0)

    if (clues.length === 0) continue

    cases.push({ id: r, diagnosis, aliases, category, clues, description })
  }
  return cases
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

// The full string stays the canonical answer (shown to the player); the
// stem and the parenthetical are added as aliases so either is accepted.
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
