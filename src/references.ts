// Helpers for the per-clue "drop-down" descriptions sourced from the sheet.
// Cells look like: "<explanation>. Retrieved from <ref>", where <ref> is a bare
// DOI (10.1007/s13167-011-0080-3) or a full URL (https://doi.org/…).

// Split a drop-down cell into its explanation and its citation. The split point
// is a case-insensitive "Retrieved from", tolerating trailing punctuation around
// it. When there's no citation marker, the whole string is the detail.
export function splitReference(raw: string): { detail: string; reference: string } {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { detail: '', reference: '' }
  const m = trimmed.match(/^([\s\S]*?)[.,;:\s]*retrieved from[:\s]*([\s\S]+)$/i)
  if (!m) return { detail: trimmed, reference: '' }
  return { detail: m[1].trim(), reference: m[2].trim() }
}

// Resolve a citation to a clickable URL, or null if it isn't linkable (render
// it as plain text in that case). Bare DOIs resolve through doi.org.
export function referenceHref(ref: string): string | null {
  const r = (ref ?? '').trim()
  if (/^https?:\/\//i.test(r)) return r
  if (/^10\.\d{4,}\/\S+$/.test(r)) return `https://doi.org/${r}`
  return null
}
