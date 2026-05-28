// Pure helpers for the image sync script — no I/O, so they're unit-testable.
// The script (sync-images.mjs) wires these to Drive export + filesystem.

// Filesystem-safe slug for a diagnosis: "Trisomy 21 (Down Syndrome)" → "trisomy-21-down-syndrome".
export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Asset filename for a case image: e.g. ("Trisomy 21 (Down Syndrome)", 6, "jpg") → "trisomy-21-down-syndrome-clue6.jpg".
export function imageFileName(diagnosis, clueNumber, ext) {
  return `${slugify(diagnosis)}-clue${clueNumber}.${ext}`
}

// Which "Clue N" a header cell denotes (the clue column the image sits in). Returns the number or null.
export function parseClueNumber(headerCell) {
  const m = String(headerCell ?? '').trim().toLowerCase().match(/^clue ?(\d+)\b/)
  return m ? Number(m[1]) : null
}

// Parse an OOXML .rels file into { relationshipId: target }.
export function parseRels(xml) {
  const map = {}
  for (const tag of xml.match(/<Relationship\b[^>]*\/?>/g) || []) {
    const id = (tag.match(/Id="([^"]+)"/) || [])[1]
    const target = (tag.match(/Target="([^"]+)"/) || [])[1]
    if (id && target) map[id] = target
  }
  return map
}

// Parse workbook.xml into [{ name, rid }] — sheet display name → relationship id.
export function parseWorkbookSheets(xml) {
  const out = []
  for (const tag of xml.match(/<sheet\b[^>]*\/?>/g) || []) {
    const name = (tag.match(/name="([^"]+)"/) || [])[1]
    const rid = (tag.match(/r:id="([^"]+)"/) || [])[1]
    if (name && rid) out.push({ name, rid })
  }
  return out
}

// Parse a drawing XML into anchors: [{ col, row, embed }] (0-based cell coords + blip relationship id).
export function parseDrawingAnchors(xml) {
  const anchors = []
  // Each image is one <xdr:oneCellAnchor>/<xdr:twoCellAnchor> with a <xdr:from> cell and a <a:blip r:embed>.
  const chunks = xml.split(/<xdr:(?:one|two)CellAnchor[ >]/).slice(1)
  for (const ch of chunks) {
    const from = ch.match(/<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
    const embed = ch.match(/<a:blip[^>]*r:embed="([^"]+)"/)
    if (from && embed) anchors.push({ col: Number(from[1]), row: Number(from[2]), embed: embed[1] })
  }
  return anchors
}

// Assemble the manifest from [{ diagnosis, clueNumber, path }] → { [diagnosis]: { [clueNumber]: path } }.
// Keys are sorted so the committed JSON has stable, review-friendly diffs.
export function buildManifest(entries) {
  const m = {}
  for (const { diagnosis, clueNumber, path } of entries) {
    ;(m[diagnosis] ||= {})[String(clueNumber)] = path
  }
  const sorted = {}
  for (const diag of Object.keys(m).sort()) {
    sorted[diag] = {}
    for (const n of Object.keys(m[diag]).sort()) sorted[diag][n] = m[diag][n]
  }
  return sorted
}
