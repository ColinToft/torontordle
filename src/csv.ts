// Minimal RFC-4180 CSV parser. Handles quoted fields with embedded commas,
// double-quote escapes, and CRLF line endings. Returns string[][] (rows of cells).
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (ch === '\n' || ch === '\r') {
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
      if (ch === '\r' && text[i + 1] === '\n') i += 2
      else i++
      continue
    }
    cell += ch
    i++
  }
  // Flush trailing cell/row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // Drop fully-empty trailing rows.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop()
  return rows
}
