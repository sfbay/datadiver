import { describe, it, expect } from 'vitest'
import { fold, funderKey, parseFunderParam, formatFunderParam, displayName } from './funderKey'

describe('fold', () => {
  it('upper-cases, trims, collapses whitespace, strips trailing periods', () => {
    expect(fold('  Michael   moritz. ')).toBe('MICHAEL MORITZ')
    expect(fold(undefined)).toBe('')
  })
  it('does NOT strip suffixes or punctuation inside the name (a Jr. is a different person)', () => {
    expect(fold('John Smith Jr.')).toBe('JOHN SMITH JR')
    expect(fold("O'Brien")).toBe("O'BRIEN")
  })
})
describe('funderKey', () => {
  it('person = FIRST|LAST', () => {
    expect(funderKey({ transaction_first_name: 'Michael', transaction_last_name: 'MORITZ', entity_code: 'IND' })).toBe('MICHAEL|MORITZ')
  })
  it('org = |NAME (first part empty) even if a first name is present', () => {
    expect(funderKey({ transaction_first_name: 'x', transaction_last_name: 'Neighbors For A Better San Francisco', entity_code: 'COM' })).toBe('|NEIGHBORS FOR A BETTER SAN FRANCISCO')
  })
  it('missing entity_code is treated as a person', () => {
    expect(funderKey({ transaction_first_name: 'A', transaction_last_name: 'B' })).toBe('A|B')
  })
})
describe('URL param round-trip', () => {
  it('formats lower-case and parses back to the folded key', () => {
    expect(formatFunderParam('MICHAEL|MORITZ')).toBe('michael|moritz')
    expect(parseFunderParam('michael|moritz')).toEqual({ first: 'MICHAEL', last: 'MORITZ', key: 'MICHAEL|MORITZ' })
    expect(parseFunderParam('|neighbors for a better san francisco')?.key).toBe('|NEIGHBORS FOR A BETTER SAN FRANCISCO')
  })
  it('rejects empty, missing bar, empty last', () => {
    expect(parseFunderParam(null)).toBeNull()
    expect(parseFunderParam('')).toBeNull()
    expect(parseFunderParam('moritz')).toBeNull()
    expect(parseFunderParam('michael|')).toBeNull()
  })
})
describe('displayName', () => {
  it('sentence-cases a person and an org', () => {
    expect(displayName('MICHAEL|MORITZ')).toBe('Michael Moritz')
    expect(displayName('|NEIGHBORS FOR A BETTER SAN FRANCISCO')).toBe('Neighbors For A Better San Francisco')
  })
})
