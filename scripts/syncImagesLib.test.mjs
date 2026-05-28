import { describe, it, expect } from 'vitest'
import {
  slugify,
  imageFileName,
  parseClueNumber,
  parseRels,
  parseWorkbookSheets,
  parseDrawingAnchors,
  buildManifest,
} from './syncImagesLib.mjs'

describe('slugify', () => {
  it('lowercases and dashes a diagnosis, trimming edges', () => {
    expect(slugify('Trisomy 21 (Down Syndrome)')).toBe('trisomy-21-down-syndrome')
    expect(slugify("Monosomy X (Turner's Syndrome)")).toBe('monosomy-x-turner-s-syndrome')
  })
})

describe('imageFileName', () => {
  it('composes slug + clue number + extension', () => {
    expect(imageFileName('Trisomy 21 (Down Syndrome)', 6, 'jpg')).toBe('trisomy-21-down-syndrome-clue6.jpg')
  })
})

describe('parseClueNumber', () => {
  it('reads the clue number from an annotated header', () => {
    expect(parseClueNumber('Clue 5 (lmaging)')).toBe(5)
    expect(parseClueNumber('clue6')).toBe(6)
  })
  it('returns null for non-clue headers', () => {
    expect(parseClueNumber('Diagnosis')).toBeNull()
    expect(parseClueNumber('')).toBeNull()
  })
})

describe('parseRels', () => {
  it('maps relationship ids to targets', () => {
    const xml =
      '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Target="../drawings/drawing1.xml"/></Relationships>'
    expect(parseRels(xml)).toEqual({ rId1: 'worksheets/sheet1.xml', rId2: '../drawings/drawing1.xml' })
  })
})

describe('parseWorkbookSheets', () => {
  it('extracts sheet name → relationship id regardless of attribute order', () => {
    const xml =
      '<sheets><sheet name="General Info" sheetId="1" r:id="rId1"/>' +
      '<sheet r:id="rId2" sheetId="2" name="Diagnosis List Year 1"/></sheets>'
    expect(parseWorkbookSheets(xml)).toEqual([
      { name: 'General Info', rid: 'rId1' },
      { name: 'Diagnosis List Year 1', rid: 'rId2' },
    ])
  })
})

describe('parseDrawingAnchors', () => {
  it('reads cell coords + blip embed id from each anchor', () => {
    const xml =
      '<xdr:wsDr>' +
      '<xdr:oneCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff>' +
      '<xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></xdr:oneCellAnchor>' +
      '<xdr:twoCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff>' +
      '<xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:pic><xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill></xdr:pic></xdr:twoCellAnchor>' +
      '</xdr:wsDr>'
    expect(parseDrawingAnchors(xml)).toEqual([
      { col: 5, row: 2, embed: 'rId1' },
      { col: 7, row: 2, embed: 'rId2' },
    ])
  })
})

describe('buildManifest', () => {
  it('nests entries by diagnosis then clue number, with sorted keys', () => {
    const m = buildManifest([
      { diagnosis: 'Monosomy X', clueNumber: 6, path: 'case-images/m-clue6.jpg' },
      { diagnosis: 'Monosomy X', clueNumber: 5, path: 'case-images/m-clue5.jpg' },
      { diagnosis: 'Down', clueNumber: 6, path: 'case-images/d-clue6.jpg' },
    ])
    expect(Object.keys(m)).toEqual(['Down', 'Monosomy X'])
    expect(Object.keys(m['Monosomy X'])).toEqual(['5', '6'])
    expect(m['Monosomy X']['5']).toBe('case-images/m-clue5.jpg')
  })
})
