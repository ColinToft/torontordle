import type { TCase } from './types'

// Fallback case bank, used until the Google Sheet feed is available.
// Source: design handoff vignettes (cases.js).
export const FALLBACK_CASES: TCase[] = [
  {
    id: 1,
    diagnosis: 'Myocardial Infarction',
    aliases: ['mi', 'heart attack', 'stemi', 'nstemi', 'acute mi'],
    category: 'Cardiology',
    difficulty: 'MS1',
    clues: [
      { type: 'Chief complaint', text: '58-year-old presents with crushing substernal chest pain radiating to the left arm.' },
      { type: 'Vitals', text: 'BP 152/94 · HR 102 · SpO₂ 95% · diaphoretic, anxious.' },
      { type: 'History', text: 'PMHx: hypertension, dyslipidemia, 30 pack-year smoker. Pain began 90 min ago at rest.' },
      { type: 'Exam', text: 'S4 gallop on auscultation, no murmurs, JVP normal, lungs clear.' },
      { type: 'Labs', text: 'Troponin I: 4.2 ng/mL (↑). CK-MB elevated. BNP normal.' },
      { type: 'Imaging', text: 'ECG: 2 mm ST elevation in leads II, III, aVF with reciprocal changes in I and aVL.' },
    ],
  },
  {
    id: 2,
    diagnosis: 'Pulmonary Embolism',
    aliases: ['pe', 'pulmonary embolus'],
    category: 'Pulmonology',
    difficulty: 'MS2',
    clues: [
      { type: 'Chief complaint', text: '34-year-old woman with sudden-onset pleuritic chest pain and dyspnea.' },
      { type: 'Vitals', text: 'HR 118 · RR 24 · SpO₂ 91% on room air.' },
      { type: 'History', text: 'Returned yesterday from a 14-hour flight. On combined oral contraceptive.' },
      { type: 'Exam', text: 'Right calf swollen, warm, tender. Lungs clear bilaterally.' },
      { type: 'Labs', text: 'D-dimer 4,200 ng/mL. ABG: respiratory alkalosis with hypoxemia.' },
      { type: 'Imaging', text: 'CT-PA: filling defect in right segmental pulmonary artery.' },
    ],
  },
  {
    id: 3,
    diagnosis: 'Multiple Sclerosis',
    aliases: ['ms'],
    category: 'Neurology',
    difficulty: 'MS3',
    clues: [
      { type: 'Chief complaint', text: '28-year-old with painful loss of vision in the right eye over 3 days.' },
      { type: 'History', text: 'Reports a transient episode of right leg weakness 8 months ago that resolved.' },
      { type: 'Exam', text: 'Right RAPD positive. Internuclear ophthalmoplegia on left gaze.' },
      { type: 'Symptom', text: "Lhermitte's sign elicited on neck flexion." },
      { type: 'Labs', text: 'CSF: oligoclonal bands present, mildly elevated IgG index.' },
      { type: 'Imaging', text: 'MRI brain: periventricular and juxtacortical T2 hyperintense lesions, some enhancing.' },
    ],
  },
]
