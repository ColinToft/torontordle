// Pulls the sheet's in-cell images (imaging/pathology clues) into the app.
//
// In-cell images aren't reachable via the gviz CSV or the Sheets API, but the
// Drive XLSX export embeds them as anchored drawings. This script exports the
// sheet, reads each image's anchor cell, maps row→diagnosis and col→clue number
// (via the Sheets API values), then writes public/case-images/* and the
// src/caseImages.json manifest the app merges at parse time.
//
// Run locally (needs Google OAuth creds): npm run sync-images
//   GOOGLE_OAUTH_TOKEN=/path/to/token.json overrides the default creds path.
//   GOOGLE_OAUTH_TOKEN_JSON=<creds JSON string> supplies creds inline (used in CI).

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

const SPREADSHEET_ID = '117TT_NYZmtaaMrRUIcQXlFxVqZ0Dl2zFIYqcctUFKGI'
const GID = 0
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN || '/Users/colin/Code/google-docs-mcp/token.json'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_IMAGES = join(ROOT, 'public', 'case-images')
const OUT_MANIFEST = join(ROOT, 'src', 'caseImages.json')

function authClient() {
  // In CI, creds are supplied inline via GOOGLE_OAUTH_TOKEN_JSON (the JSON string
  // itself). Locally, we read them from a file (GOOGLE_OAUTH_TOKEN path or default).
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

// Downscale + recompress a clue image for the web. Sheet images can be large
// (multi-MB PNGs); cap the width and re-encode to JPEG so assets stay light.
// Falls back to the original bytes for anything sharp can't handle (e.g. GIF).
const MAX_IMAGE_WIDTH = 1200
async function compressImage(buf, origExt) {
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
  const auth = authClient()
  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

  // 1. Resolve the gid=0 sheet's title.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' })
  const sheet = meta.data.sheets.find((s) => s.properties.sheetId === GID)
  if (!sheet) throw new Error(`No sheet with gid ${GID}`)
  const sheetTitle = sheet.properties.title
  console.log(`Sheet: "${sheetTitle}"`)

  // 2. Grab the grid values for header + per-row diagnosis.
  const valsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetTitle}'`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  })
  const values = valsRes.data.values || []
  const header = (values[0] || []).map((c) => String(c ?? ''))
  const diagCol = header.findIndex((h) => /^diagnosis\??$/i.test(h.trim()))
  if (diagCol < 0) throw new Error('No Diagnosis column found in header')

  // 3. Export XLSX and unzip.
  const tmp = mkdtempSync(join(tmpdir(), 'tt-sync-'))
  const xlsxPath = join(tmp, 'sheet.xlsx')
  const exportRes = await drive.files.export(
    { fileId: SPREADSHEET_ID, mimeType: XLSX_MIME },
    { responseType: 'arraybuffer' },
  )
  writeFileSync(xlsxPath, Buffer.from(exportRes.data))
  const unzipDir = join(tmp, 'x')
  execSync(`unzip -o "${xlsxPath}" -d "${unzipDir}"`, { stdio: 'ignore' })
  const read = (p) => readFileSync(join(unzipDir, p), 'utf8')

  // 4. Map the sheet → its worksheet xml → drawing xml → anchors.
  const wbSheets = parseWorkbookSheets(read('xl/workbook.xml'))
  const wbRels = parseRels(read('xl/_rels/workbook.xml.rels'))
  const target = wbSheets.find((s) => s.name === sheetTitle)
  if (!target) throw new Error(`"${sheetTitle}" not found in workbook.xml`)
  const sheetFile = basename(wbRels[target.rid]) // e.g. sheet1.xml
  const wsRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`
  if (!existsSync(join(unzipDir, wsRelsPath))) {
    console.log('No drawings on this sheet — nothing to sync.')
    rmSync(tmp, { recursive: true, force: true })
    return
  }
  const wsRels = parseRels(read(wsRelsPath))
  const drawingTarget = Object.values(wsRels).find((t) => /drawings\/drawing/.test(t))
  const drawingFile = basename(drawingTarget)
  const anchors = parseDrawingAnchors(read(`xl/drawings/${drawingFile}`))
  const drawingRels = parseRels(read(`xl/drawings/_rels/${drawingFile}.rels`))

  // 5. For each anchored image, resolve diagnosis + clue number, compress, and write the asset.
  mkdirSync(OUT_IMAGES, { recursive: true })
  const entries = []
  const written = new Set()
  let skipped = 0
  for (const a of anchors) {
    const diagnosis = String((values[a.row] || [])[diagCol] ?? '').trim()
    const clueNumber = parseClueNumber(header[a.col])
    if (!diagnosis || !clueNumber) {
      skipped++
      console.warn(`  skip image at (row ${a.row}, col ${a.col}): diagnosis=${diagnosis || '∅'} clue=${clueNumber ?? '∅'}`)
      continue
    }
    const mediaFile = basename(drawingRels[a.embed]) // e.g. image2.jpg
    const srcBuf = readFileSync(join(unzipDir, 'xl', 'media', mediaFile))
    const { buffer, ext } = await compressImage(srcBuf, mediaFile.split('.').pop())
    const fileName = imageFileName(diagnosis, clueNumber, ext)
    writeFileSync(join(OUT_IMAGES, fileName), buffer)
    written.add(fileName)
    entries.push({ diagnosis, clueNumber, path: `case-images/${fileName}` })
    const kb = (n) => `${Math.round(n / 1024)}KB`
    console.log(`  ✓ ${diagnosis} · clue ${clueNumber} → ${fileName} (${kb(srcBuf.length)} → ${kb(buffer.length)})`)
  }

  // Drop any previously-synced assets no longer present in the sheet (e.g. a
  // PNG now re-encoded as JPEG, or an image removed upstream).
  for (const f of readdirSync(OUT_IMAGES)) {
    if (!written.has(f)) {
      unlinkSync(join(OUT_IMAGES, f))
      console.log(`  – removed stale ${f}`)
    }
  }

  // 6. Write the manifest.
  const manifest = buildManifest(entries)
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  rmSync(tmp, { recursive: true, force: true })
  console.log(`\nWrote ${entries.length} image(s) to public/case-images/ and src/caseImages.json (${skipped} skipped).`)
}

main().catch((e) => {
  console.error('sync-images failed:', e.message)
  process.exit(1)
})
