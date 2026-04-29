import { parseCSV } from './csv'
import type { TCase } from './types'

// Google Sheet ID for the diagnosis bank.
// Sheet URL: https://docs.google.com/spreadsheets/d/1Zv5xSR3xmizLnblHl8pnTgwDZ2Coilp4dRd3GMuyD9o/
// The sheet must be shared "Anyone with the link → Viewer" (or Published to web)
// for the gviz/CSV endpoint to be reachable from the browser.
export const SHEET_ID = '1Zv5xSR3xmizLnblHl8pnTgwDZ2Coilp4dRd3GMuyD9o'
export const SHEET_GID = '0'

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`

/**
 * Sheet schema (case-insensitive, header row located automatically — preamble
 * rows above it are ignored). Required columns:
 *   - "Diagnosis?" or "Diagnosis"   → diagnosis name (parenthetical aliases auto-extracted)
 *   - "Clue 1" … "Clue 6"            → clue body text (1–8 supported)
 * Optional columns:
 *   - "Week" or "Category"           → grouping label (shown in case header)
 *   - "Aliases"                      → pipe- or semicolon-separated alternates
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

  const findCol = (names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n.toLowerCase())
      if (i >= 0) return i
    }
    return -1
  }

  const idxDiagnosis = findCol(['diagnosis?', 'diagnosis'])
  const idxAliases = findCol(['aliases', 'alias'])
  const idxCategory = findCol(['week', 'category', 'topic'])
  if (idxDiagnosis < 0) return []

  // Up to 8 clue columns. Each clue may also have an optional type column.
  const clueCols: { typeIdx: number; textIdx: number }[] = []
  for (let n = 1; n <= 8; n++) {
    const text = findCol([`clue ${n}`, `clue${n}`])
    if (text < 0) continue
    const type = findCol([`clue ${n} type`, `clue${n}_type`, `clue${n} type`])
    clueCols.push({ typeIdx: type, textIdx: text })
  }

  const cases: TCase[] = []
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const rawDiagnosis = (row[idxDiagnosis] ?? '').trim()
    if (!rawDiagnosis) continue

    const { diagnosis, derivedAliases } = splitDiagnosis(rawDiagnosis)
    const sheetAliases = parseAliases(idxAliases >= 0 ? row[idxAliases] : '')
    const aliases = dedupe([...derivedAliases, ...sheetAliases])

    const category = (idxCategory >= 0 ? row[idxCategory] : '')?.trim() || 'General'

    const clues = clueCols
      .map(({ typeIdx, textIdx }) => ({
        type: typeIdx >= 0 ? (row[typeIdx] ?? '').trim() : '',
        text: (row[textIdx] ?? '').trim(),
      }))
      .filter((c) => c.text.length > 0)

    if (clues.length === 0) continue

    cases.push({ id: r, diagnosis, aliases, category, clues })
  }
  return cases
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map((c) => c.trim().toLowerCase())
    const hasDiagnosis = cells.some((c) => c === 'diagnosis?' || c === 'diagnosis')
    const hasClue = cells.some((c) => /^clue ?1$/.test(c))
    if (hasDiagnosis && hasClue) return i
  }
  return -1
}

// "Pulmonary embolism (PE)" → { diagnosis: "Pulmonary embolism", derivedAliases: ["PE"] }
// "Anaphylaxis"             → { diagnosis: "Anaphylaxis", derivedAliases: [] }
function splitDiagnosis(raw: string): { diagnosis: string; derivedAliases: string[] } {
  const trimmed = raw.trim()
  const m = trimmed.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (!m) return { diagnosis: trimmed, derivedAliases: [] }
  const main = m[1].trim()
  const inside = m[2].trim()
  const insideAliases = inside.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
  return {
    diagnosis: main,
    derivedAliases: [...insideAliases, trimmed],
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
