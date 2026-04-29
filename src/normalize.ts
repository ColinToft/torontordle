// Shared normalization for diagnosis / alias / guess matching.
// Lowercases, trims, drops non-alphanumeric, collapses whitespace so
// "Pulmonary embolism (PE)" → "pulmonary embolism pe".
export const normalizeAnswer = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ')
