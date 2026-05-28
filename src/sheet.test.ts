import { describe, it, expect } from 'vitest'
import { parseSheetCsv } from './sheet'

// A fixture that reproduces the live sheet's structure: several preamble
// tables (instructions, author assignments), a scratch example block that
// contains clue-like prose but NO "Clue 1" column title, then the real
// annotated header, followed by a mix of complete and stub rows across two
// week blocks (with the Week cell filled only on each block's first row).
const LIVE_SHEET = [
  // --- preamble: instructions ---
  'Aim to have it functional for the 3T0s after ITM',
  'Content includes everything discussed in lectures',
  '',
  // --- preamble: author assignment grid ---
  'Ved,Embryology,Medical Genetics,Cancer',
  'Gabe,Dermatology,Drugs I,Drugs II',
  '',
  // --- scratch example block: prose that looks clue-ish but no real header ---
  'NO_HEADER,Patient reports a stiff neck',
  'A 27 year old girl presents with fever,The patient has recurrent infections,CH50 markedly decreased',
  '',
  // --- the real header (annotations after each title; matched by prefix) ---
  '"Week","Clue 1 (most typical chief complaint; broad)","Clue 2 (PMHx/risk factors)","Clue 3 (PEx findings)","Clue 4 (Labs)","Clue 5 (Imaging)","Imaging drop-down description. Include reference.","Clue 6 (pathology)","Pathology drop-down description. Include reference.","Diagnosis","Management? (free text, user will just compare to provided answer)","Description (includes pathophysiology, epidemiology, management)"',
  // Embryology block — first row carries the Week label, and is complete.
  '"Embryology","A newborn girl has poor feeding and hypotonia","Mother was 39; elevated beta-hCG, low AFP","Flat facial profile, single palmar crease","","Echo shows an AVSD","","Karyotype shows trisomy 21","Retrieved from 10.1007/s13167-011-0080-3","Trisomy 21 (Down Syndrome)","Early developmental intervention and surveillance.","Most common survivable autosomal trisomy."',
  // Second row: Week BLANK (should inherit "Embryology"). Complete.
  '"","A 14 year old has short stature and no menses","Difficulty keeping up with peers","Webbed neck, broad chest","Elevated FSH and LH","","","Karyotype shows 45,X","Retrieved from 10.1186/x","Monosomy X (Turner Syndrome)","Growth hormone and estrogen replacement.","Loss of one X chromosome."',
  // Stub rows: diagnosis present but no clues at all → must be skipped.
  '"","","","","","","","","","Klinefelter Syndrome","",""',
  '"","","","","","","","","","Hydatidiform mole","",""',
  // New week block begins; Medical Genetics first row complete.
  '"Medical Genetics","A boy has progressive weakness","Maternal uncle similarly affected","Calf pseudohypertrophy","Markedly elevated CK","","","Dystrophin absent on biopsy","Retrieved from 10.1/x","Duchenne Muscular Dystrophy (DMD)","Glucocorticoids and supportive care.","X-linked dystrophin mutation."',
].join('\n')

describe('parseSheetCsv — live sheet structure', () => {
  const cases = parseSheetCsv(LIVE_SHEET)

  it('locates the real header past preamble and scratch tables', () => {
    // Three complete rows; the two stub rows and all preamble are excluded.
    expect(cases.map((c) => c.diagnosis)).toEqual([
      'Trisomy 21 (Down Syndrome)',
      'Monosomy X (Turner Syndrome)',
      'Duchenne Muscular Dystrophy (DMD)',
    ])
  })

  it('skips rows that have a diagnosis but no clues', () => {
    expect(cases.find((c) => c.diagnosis === 'Klinefelter Syndrome')).toBeUndefined()
    expect(cases.find((c) => c.diagnosis === 'Hydatidiform mole')).toBeUndefined()
  })

  it('keeps the full diagnosis string and adds stem + parenthetical as aliases', () => {
    const down = cases[0]
    expect(down.diagnosis).toBe('Trisomy 21 (Down Syndrome)')
    expect(down.aliases).toContain('Down Syndrome')
    expect(down.aliases).toContain('Trisomy 21')
  })

  it('forward-fills the Week label down blank rows within a block', () => {
    expect(cases[0].category).toBe('Embryology')
    expect(cases[1].category).toBe('Embryology') // Week cell was blank
    expect(cases[2].category).toBe('Medical Genetics')
  })

  it('parses clue bodies in order and does not treat dropdown columns as clues', () => {
    const down = cases[0]
    expect(down.clues[0].text).toBe('A newborn girl has poor feeding and hypotonia')
    // Clue 4 (Labs) is blank for Down → dropped; the next clue is the AVSD echo.
    expect(down.clues.some((c) => c.text === 'Echo shows an AVSD')).toBe(true)
    // The imaging/pathology drop-down reference text must NOT appear as a clue.
    expect(down.clues.some((c) => c.text.startsWith('Retrieved from'))).toBe(false)
    expect(down.clues.some((c) => c.text === 'Karyotype shows trisomy 21')).toBe(true)
  })

  it('captures the description (study note)', () => {
    expect(cases[0].description).toBe('Most common survivable autosomal trisomy.')
  })
})

describe('parseSheetCsv — older sheet with explicit "Clue N type" columns', () => {
  const OLD_SHEET = [
    'For reference only',
    'Diagnosis,Clue 1,Clue 1 type,Clue 2,Aliases,Week',
    'Pulmonary embolism (PE),Sudden pleuritic chest pain,Symptom,Tachycardia on exam,VTE,Respiratory',
  ].join('\n')

  const cases = parseSheetCsv(OLD_SHEET)

  it('still parses a single case with its type label and aliases', () => {
    expect(cases).toHaveLength(1)
    const c = cases[0]
    expect(c.diagnosis).toBe('Pulmonary embolism (PE)')
    expect(c.aliases).toEqual(expect.arrayContaining(['PE', 'Pulmonary embolism', 'VTE']))
    expect(c.category).toBe('Respiratory')
    expect(c.clues[0]).toEqual({ type: 'Symptom', text: 'Sudden pleuritic chest pain' })
    expect(c.clues[1]).toEqual({ type: '', text: 'Tachycardia on exam' })
  })
})

describe('parseSheetCsv — degenerate input', () => {
  it('returns [] when there is no detectable header', () => {
    expect(parseSheetCsv('just,some,preamble\nno,real,header')).toEqual([])
  })

  it('returns [] for empty input', () => {
    expect(parseSheetCsv('')).toEqual([])
  })
})
