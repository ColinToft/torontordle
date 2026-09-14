import { describe, expect, it } from 'vitest'
import { namesCase, searchMatches } from './guess'
import type { TCase } from './types'

const mk = (id: number, diagnosis: string, aliases: string[] = []): TCase => ({
  id,
  diagnosis,
  aliases,
  category: 'General',
  unlockDate: null,
  clues: [{ type: '', text: 'clue' }],
})

// The reported bug: a qualifier parenthetical whose stem is its own case.
const mi = mk(1, 'Myocardial Infarction')
const atypicalMi = mk(2, 'Myocardial Infarction (atypical)', ['atypical', 'Myocardial Infarction'])
// A genuine synonym/abbreviation case with a sheet-authored alias too.
const pe = mk(3, 'Pulmonary Embolism (PE)', ['PE', 'Pulmonary Embolism', 'VTE'])
const turner = mk(4, "Monosomy X (Turner's Syndrome)", ["Turner's Syndrome", 'Monosomy X'])
const plain = mk(5, 'Anaphylaxis')

describe('namesCase — only the canonical diagnosis names a case', () => {
  it.each([
    'Myocardial Infarction (atypical)',
    'myocardial infarction (atypical)',
    'MYOCARDIAL INFARCTION (ATYPICAL)',
    '  Myocardial Infarction (atypical)  ',
    'Myocardial   Infarction \t(atypical)',
    'Myocardial Infarction atypical', // punctuation-insensitive
    'Myocardial Infarction (atypical).',
  ])('accepts %j for the atypical case', (g) => {
    expect(namesCase(g, atypicalMi)).toBe(true)
  })

  it.each([
    'Myocardial Infarction', // the derived stem alias — a different case
    'atypical', // the derived parenthetical alias
    'Myocardial', // partial
    'Infarction (atypical)', // partial
    'Acute Myocardial Infarction (atypical)', // superset
    'Myocardial Infarction (typical)',
    '',
    '   ',
    '()',
  ])('rejects %j for the atypical case', (g) => {
    expect(namesCase(g, atypicalMi)).toBe(false)
  })

  it('the stem names the plain case and only the plain case', () => {
    expect(namesCase('Myocardial Infarction', mi)).toBe(true)
    expect(namesCase('Myocardial Infarction', atypicalMi)).toBe(false)
    expect(namesCase('Myocardial Infarction (atypical)', mi)).toBe(false)
  })

  it.each(['PE', 'pe', 'Pulmonary Embolism', 'VTE', 'vte'])(
    'does not accept the alias %j for Pulmonary Embolism (PE)',
    (g) => {
      expect(namesCase(g, pe)).toBe(false)
    },
  )

  it('accepts the canonical form with an abbreviation parenthetical', () => {
    expect(namesCase('Pulmonary Embolism (PE)', pe)).toBe(true)
    expect(namesCase('pulmonary embolism pe', pe)).toBe(true)
  })

  it('treats apostrophes and other punctuation as insignificant', () => {
    expect(namesCase("Monosomy X (Turner's Syndrome)", turner)).toBe(true)
    expect(namesCase('Monosomy X (Turners Syndrome)', turner)).toBe(true)
    expect(namesCase("Turner's Syndrome", turner)).toBe(false)
  })

  it('works for a case with no parenthetical and no aliases', () => {
    expect(namesCase('Anaphylaxis', plain)).toBe(true)
    expect(namesCase('anaphylaxis ', plain)).toBe(true)
    expect(namesCase('Anaphylaxi', plain)).toBe(false)
    expect(namesCase('Anaphylaxis shock', plain)).toBe(false)
  })

  it('every canonical name in a bank names exactly one case, whatever the aliases say', () => {
    const bank = [mi, atypicalMi, pe, turner, plain]
    for (const c of bank) {
      expect(bank.filter((other) => namesCase(c.diagnosis, other))).toEqual([c])
    }
  })
})

describe('searchMatches — dropdown filter includes aliases', () => {
  const bank = [mi, atypicalMi, pe, turner, plain]
  const hits = (q: string) => bank.filter((c) => searchMatches(q, c)).map((c) => c.id)

  it('an empty or whitespace query matches everything', () => {
    expect(hits('')).toEqual([1, 2, 3, 4, 5])
    expect(hits('   ')).toEqual([1, 2, 3, 4, 5])
  })

  it('matches a substring of the diagnosis, case-insensitively', () => {
    expect(hits('infarc')).toEqual([1, 2])
    expect(hits('MYOCARDIAL')).toEqual([1, 2])
    expect(hits('(atyp')).toEqual([2])
  })

  it('matches a substring of an alias, so abbreviations and synonyms still find their case', () => {
    expect(hits('vte')).toEqual([3])
    expect(hits('turner')).toEqual([4])
    expect(hits('monosomy')).toEqual([4])
  })

  it('an alias hit is a hit for the case that owns the alias — nothing more', () => {
    // "Myocardial Infarction" is an alias of the atypical case AND the plain diagnosis;
    // both appear, and the player picks — the answer is decided by namesCase.
    expect(hits('Myocardial Infarction')).toEqual([1, 2])
  })

  it('trims the query but is otherwise a raw substring match', () => {
    expect(hits('  pe  ')).toEqual([3])
    expect(hits('pulmonaryembolism')).toEqual([])
    expect(hits("turner's")).toEqual([4])
    expect(hits('turners')).toEqual([])
  })

  it('returns nothing for a query that matches neither diagnosis nor alias', () => {
    expect(hits('stroke')).toEqual([])
  })

  it('handles a case with no aliases', () => {
    expect(searchMatches('anaph', plain)).toBe(true)
    expect(searchMatches('shock', plain)).toBe(false)
  })
})
