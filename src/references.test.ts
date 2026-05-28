import { describe, it, expect } from 'vitest'
import { splitReference, referenceHref } from './references'

describe('splitReference', () => {
  it('splits explanation from a bare-DOI citation', () => {
    expect(
      splitReference('Karyotype analysis demonstrates trisomy of chromosome 21. Retrieved from 10.1007/s13167-011-0080-3'),
    ).toEqual({
      detail: 'Karyotype analysis demonstrates trisomy of chromosome 21',
      reference: '10.1007/s13167-011-0080-3',
    })
  })

  it('splits explanation from a full-URL citation, keeping embedded quotes', () => {
    expect(
      splitReference('CXR shows the "Figure of 3" sign. Retrieved from https://doi.org/10.53347/rID-6274'),
    ).toEqual({
      detail: 'CXR shows the "Figure of 3" sign',
      reference: 'https://doi.org/10.53347/rID-6274',
    })
  })

  it('is case-insensitive on the marker', () => {
    expect(splitReference('Some finding. retrieved from 10.1/x')).toEqual({
      detail: 'Some finding',
      reference: '10.1/x',
    })
  })

  it('treats the whole string as detail when there is no citation marker', () => {
    expect(splitReference('Just an explanation with no source')).toEqual({
      detail: 'Just an explanation with no source',
      reference: '',
    })
  })

  it('returns empty fields for empty/whitespace input', () => {
    expect(splitReference('')).toEqual({ detail: '', reference: '' })
    expect(splitReference('   ')).toEqual({ detail: '', reference: '' })
  })
})

describe('referenceHref', () => {
  it('resolves a bare DOI through doi.org', () => {
    expect(referenceHref('10.1007/s13167-011-0080-3')).toBe('https://doi.org/10.1007/s13167-011-0080-3')
  })

  it('passes through http(s) URLs unchanged', () => {
    expect(referenceHref('https://doi.org/10.53347/rID-6274')).toBe('https://doi.org/10.53347/rID-6274')
    expect(referenceHref('http://example.com/x')).toBe('http://example.com/x')
  })

  it('returns null for non-linkable references', () => {
    expect(referenceHref('see lecture slides')).toBeNull()
    expect(referenceHref('10.1234')).toBeNull() // DOI prefix without a path
    expect(referenceHref('')).toBeNull()
  })
})
