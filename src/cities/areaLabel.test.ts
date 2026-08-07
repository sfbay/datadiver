import { describe, it, expect } from 'vitest'
import { composeAreaLabel } from './areaLabel'
import { sfCity } from './sf'
import { oaklandCity } from './oakland'

describe('composeAreaLabel', () => {
  it('SF (no displayName): identity — a neighborhood name IS its label', () => {
    expect(composeAreaLabel(sfCity.areas, 'Mission')).toBe('Mission')
  })

  it('Oakland: name · code', () => {
    expect(composeAreaLabel(oaklandCity.areas, '12Y')).toBe('Rockridge & Shafter · 12Y')
    expect(composeAreaLabel(oaklandCity.areas, 'LKM1')).toBe('Lake Merritt · LKM1')
  })

  it('unmapped codes (77X/99X are real data) read as the bucket they are', () => {
    expect(composeAreaLabel(oaklandCity.areas, '77X')).toBe('Unmapped beat · 77X')
    expect(composeAreaLabel(oaklandCity.areas, '99X')).toBe('Unmapped beat · 99X')
  })
})

describe('oakland areas config', () => {
  it('searchExcluded carries exactly the two dispatch carve-outs', () => {
    expect([...(oaklandCity.areas.searchExcluded ?? [])].sort()).toEqual(['LKM1', 'PDT2'])
  })

  it('displayName resolves every REAL beat to an authored name, never the fallback', () => {
    // (Truthiness alone would be a tautology — the fallback is truthy for
    // any input. The invariant: no real beat ever reads 'Unmapped beat'.)
    for (const code of oaklandCity.areas.names) {
      expect(oaklandCity.areas.displayName?.(code), code).not.toBe('Unmapped beat')
    }
  })
})
