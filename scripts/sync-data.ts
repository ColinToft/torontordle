// Bakes the whole diagnosis bank — clue text AND in-cell images — into
// src/cases.json at build time, plus the image assets in public/case-images/.
// The client imports cases.json directly and never touches the Google Sheet, so
// the sheet ID lives only here. Run nightly + on demand via the GH workflow, or
// locally with `npm run sync-data` (needs Google OAuth creds).
//
//   GOOGLE_OAUTH_TOKEN=/path/to/token.json   override the local creds path
//   GOOGLE_OAUTH_TOKEN_JSON=<creds JSON>      supply creds inline (used in CI)
//
// Text and images come from the same sheet snapshot in one run, so an image is
// always attached to its clue (no live-vs-manifest name drift). If any extracted
// image can't be matched to a parsed case, the run fails rather than ship a
// silently-missing image.

import { google } from 'googleapis'
import sharp from 'sharp'
import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildManifest,
  imageFileName,
  parseClueNumber,
  parseDrawingAnchors,
  parseRels,
  parseWorkbookSheets,
} from './syncImagesLib.mjs'
import { parseSheetCsv } from '../src/sheet.ts'
import { assertAppendOnly, freezeThrough, todayET } from '../src/dailyCase.ts'
import type { CasesByYear, FrozenDay, HistoryByYear, TCase, Year } from '../src/types.ts'

const SPREADSHEET_ID = '117TT_NYZmtaaMrRUIcQXlFxVqZ0Dl2zFIYqcctUFKGI'
// One tab per year. Year 1 images keep their bare filenames; Year 2 images are
// prefixed (filePrefix) so a diagnosis shared between years can't collide.
const YEARS: { year: Year; gid: number; filePrefix: string }[] = [
  { year: '1', gid: 0, filePrefix: '' },
  { year: '2', gid: 1808332748, filePrefix: 'y2-' },
]
const csvUrl = (gid: number) =>
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`
const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN || '/Users/colin/Code/google-docs-mcp/token.json'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_IMAGES = join(ROOT, 'public', 'case-images')
const OUT_CASES = join(ROOT, 'src', 'cases.json')
const OUT_HISTORY = join(ROOT, 'src', 'history.json')

// Freeze every day that has already been live (launch → today) into history.json
// BEFORE the freshly-baked bank is written, computing picks against the bank
// that was actually committed while those days ran. This pins the past (and
// today): the new bank only ever affects future days, so an archive can never
// change. Append-only — existing entries are asserted unchanged, then we write.
function freezeHistory(prevBank: CasesByYear, today: string): HistoryByYear {
  const prev: HistoryByYear = existsSync(OUT_HISTORY)
    ? (JSON.parse(readFileSync(OUT_HISTORY, 'utf8')) as HistoryByYear)
    : ({} as HistoryByYear)
  const next = {} as HistoryByYear
  for (const { year } of YEARS) {
    const before: FrozenDay[] = prev[year] ?? []
    const after = freezeThrough(prevBank[year] ?? [], year, before, today)
    assertAppendOnly(before, after) // a past puzzle must never move — fail loudly if it would
    next[year] = after
    const added = after.length - before.length
    console.log(`  history year ${year}: ${before.length} → ${after.length} day(s) (+${added})`)
  }
  return next
}

function authClient() {
  const inlineCreds = process.env.GOOGLE_OAUTH_TOKEN_JSON
  let cred
  if (inlineCreds) {
    cred = JSON.parse(inlineCreds)
  } else {
    if (!existsSync(TOKEN_PATH)) {
      throw new Error(
        `No OAuth creds at ${TOKEN_PATH}. Set GOOGLE_OAUTH_TOKEN to your token.json path, or GOOGLE_OAUTH_TOKEN_JSON to the creds JSON.`,
      )
    }
    cred = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'))
  }
  const oauth2 = new google.auth.OAuth2(cred.client_id, cred.client_secret)
  oauth2.setCredentials({ refresh_token: cred.refresh_token })
  return oauth2
}

// Downscale + recompress a clue image for the web. Sheet images can be multi-MB;
// cap the width and re-encode to JPEG. Falls back to the original bytes for
// anything sharp can't handle (e.g. GIF).
const MAX_IMAGE_WIDTH = 1200
async function compressImage(buf: Buffer, origExt: string) {
  try {
    const out = await sharp(buf)
      .rotate() // honor EXIF orientation before stripping metadata
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    return { buffer: out, ext: 'jpg' }
  } catch {
    return { buffer: buf, ext: origExt }
  }
}

async function main() {
  // Capture the currently-committed bank + today BEFORE re-baking, so we can
  // freeze the past against the bank that was actually live during those days.
  const prevBank: CasesByYear = existsSync(OUT_CASES)
    ? (JSON.parse(readFileSync(OUT_CASES, 'utf8')) as CasesByYear)
    : ({} as CasesByYear)
  const today = todayET()

  const auth = authClient()
  const sheets = google.sheets({ version: 'v4', auth })

  // Export the whole workbook once (all tabs) and unzip — the Drive API export
  // method 10MB-caps, so use the docs.google.com endpoint.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' })
  const tmp = mkdtempSync(join(tmpdir(), 'tt-sync-'))
  const xlsxPath = join(tmp, 'sheet.xlsx')
  const { token } = await auth.getAccessToken()
  const exportUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=xlsx`
  const exportRes = await fetch(exportUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!exportRes.ok) {
    const body = await exportRes.text().catch(() => '')
    throw new Error(`XLSX export failed: ${exportRes.status} ${exportRes.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`)
  }
  writeFileSync(xlsxPath, Buffer.from(await exportRes.arrayBuffer()))
  const unzipDir = join(tmp, 'x')
  execSync(`unzip -o "${xlsxPath}" -d "${unzipDir}"`, { stdio: 'ignore' })
  const read = (p: string) => readFileSync(join(unzipDir, p), 'utf8')

  mkdirSync(OUT_IMAGES, { recursive: true })
  const wbSheets = parseWorkbookSheets(read('xl/workbook.xml')) as { name: string; rid: string }[]
  const wbRels = parseRels(read('xl/_rels/workbook.xml.rels')) as Record<string, string>
  const written = new Set<string>() // every image filename we keep (across both years)
  const byYear = {} as CasesByYear
  let totalImages = 0
  let skipped = 0

  for (const { year, gid, filePrefix } of YEARS) {
    const sheetMeta = meta.data.sheets!.find((s) => s.properties!.sheetId === gid)
    if (!sheetMeta) throw new Error(`No sheet with gid ${gid} (year ${year})`)
    const title = sheetMeta.properties!.title!
    console.log(`\n=== Year ${year}: "${title}" ===`)

    // Grid values: map each in-cell image's anchor row → diagnosis, col → clue #.
    const valsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${title}'`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    const values: unknown[][] = valsRes.data.values ?? []
    const header = (values[0] ?? []).map((c) => String(c ?? ''))
    const diagCol = header.findIndex((h) => /^diagnosis\??$/i.test(h.trim()))
    if (diagCol < 0) throw new Error(`Year ${year}: no Diagnosis column in header`)

    // Extract this tab's in-cell images.
    const entries: { diagnosis: string; clueNumber: number; path: string }[] = []
    const wsTarget = wbSheets.find((s) => s.name === title)
    if (!wsTarget) throw new Error(`"${title}" not found in workbook.xml`)
    const sheetFile = basename(wbRels[wsTarget.rid])
    const wsRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`
    if (existsSync(join(unzipDir, wsRelsPath))) {
      const wsRels = parseRels(read(wsRelsPath)) as Record<string, string>
      const drawingTarget = Object.values(wsRels).find((t) => /drawings\/drawing/.test(t))
      if (drawingTarget) {
        const drawingFile = basename(drawingTarget)
        const anchors = parseDrawingAnchors(read(`xl/drawings/${drawingFile}`)) as { row: number; col: number; embed: string }[]
        // A drawing made only of shapes/textboxes (no embedded images) has no
        // relationships file — its anchors carry no <a:blip>, so parseDrawingAnchors
        // returns none and the loop below is a no-op. Default to {} rather than
        // crashing on the missing file.
        const drawingRelsPath = `xl/drawings/_rels/${drawingFile}.rels`
        const drawingRels = (
          existsSync(join(unzipDir, drawingRelsPath)) ? parseRels(read(drawingRelsPath)) : {}
        ) as Record<string, string>
        for (const a of anchors) {
          const diagnosis = String((values[a.row] ?? [])[diagCol] ?? '').trim()
          const clueNumber = parseClueNumber(header[a.col])
          if (!diagnosis || !clueNumber) {
            skipped++
            console.warn(`  skip image at (row ${a.row}, col ${a.col}): diagnosis=${diagnosis || '∅'} clue=${clueNumber ?? '∅'}`)
            continue
          }
          const target = drawingRels[a.embed]
          if (!target) {
            // An image anchor whose media relationship is missing — don't silently
            // drop a real clue image; surface it.
            throw new Error(
              `Year ${year}: image at (row ${a.row}, col ${a.col}) references relationship ${a.embed}, which has no target in ${drawingRelsPath}`,
            )
          }
          const mediaFile = basename(target)
          const srcBuf = readFileSync(join(unzipDir, 'xl', 'media', mediaFile))
          const { buffer, ext } = await compressImage(srcBuf, mediaFile.split('.').pop()!)
          const fileName = filePrefix + imageFileName(diagnosis, clueNumber, ext)
          writeFileSync(join(OUT_IMAGES, fileName), buffer)
          written.add(fileName)
          entries.push({ diagnosis, clueNumber, path: `case-images/${fileName}` })
          const kb = (n: number) => `${Math.round(n / 1024)}KB`
          console.log(`  ✓ ${diagnosis} · clue ${clueNumber} → ${fileName} (${kb(srcBuf.length)} → ${kb(buffer.length)})`)
        }
      }
    }

    // Parse this tab's clue text from its CSV and merge in the images.
    const manifest = buildManifest(entries) as Record<string, Record<string, string>>
    const csvRes = await fetch(csvUrl(gid), { cache: 'no-store' })
    if (!csvRes.ok) throw new Error(`Year ${year} CSV fetch failed: ${csvRes.status} ${csvRes.statusText}`)
    const cases: TCase[] = parseSheetCsv(await csvRes.text(), manifest)

    // Fail fast if any extracted image didn't land on a case (name mismatch).
    const attached = new Set<string>()
    for (const c of cases) for (const clue of c.clues) if (clue.image) attached.add(clue.image)
    const orphans = entries.filter((e) => !attached.has(e.path))
    if (orphans.length) {
      throw new Error(
        `Year ${year}: ${orphans.length} image(s) couldn't be attached to a case (diagnosis-name mismatch):\n` +
          orphans.map((o) => `  • ${o.diagnosis} · clue ${o.clueNumber}`).join('\n'),
      )
    }

    byYear[year] = cases
    totalImages += entries.length
    console.log(`  → ${cases.length} case(s), ${entries.length} image(s)`)
  }

  // Drop previously-synced assets no longer present in either tab.
  for (const f of readdirSync(OUT_IMAGES)) {
    if (!written.has(f)) {
      unlinkSync(join(OUT_IMAGES, f))
      console.log(`  – removed stale ${f}`)
    }
  }

  if ((byYear['1']?.length ?? 0) === 0) {
    throw new Error('Parsed 0 Year 1 cases — refusing to write an empty bank.')
  }

  // Freeze the past ONLY when the bank actually changes — that's the only moment
  // a past puzzle is at risk. While the bank is unchanged, the not-yet-frozen
  // tail is computed live and stays stable, so there's nothing to pin (and we
  // avoid a needless daily commit + redeploy). When it does change, we freeze the
  // whole backlog (launch → today) against the OLD bank — the values that were
  // actually shown — and write that in the same commit as the new bank, so you
  // can never get a re-baked bank without its matching freeze.
  const bankChanged = JSON.stringify(prevBank) !== JSON.stringify(byYear)
  if (bankChanged) {
    console.log('\n=== Bank changed — freezing schedule history ===')
    const history = freezeHistory(prevBank, today)
    writeFileSync(OUT_HISTORY, JSON.stringify(history, null, 2) + '\n')
  } else {
    console.log('\nBank unchanged — leaving history.json as-is (live tail stays stable).')
  }

  writeFileSync(OUT_CASES, JSON.stringify(byYear, null, 2) + '\n')
  rmSync(tmp, { recursive: true, force: true })
  console.log(
    `\nWrote Year 1: ${byYear['1'].length} / Year 2: ${byYear['2']?.length ?? 0} case(s) to src/cases.json, ${totalImages} image(s) in public/case-images/ (${skipped} skipped).`,
  )
}

main().catch((e) => {
  console.error('sync-data failed:', e.message)
  process.exit(1)
})
