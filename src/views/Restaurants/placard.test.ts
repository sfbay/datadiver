// src/views/Restaurants/placard.test.ts

import { describe, it, expect } from 'vitest'
import {
  normalizePlacard,
  worsePlacard,
  parsePlacardFilter,
  PLACARD_ORDER,
  PLACARD_RANK,
  PLACARD_COLOR,
  PLACARD_WORD,
  PLACARD_LABEL,
  PLACARD_TVY3_VALUE,
} from './placard'

describe('placard', () => {
  it('normalizes every 2020–23 facility_status spelling (probed live 2026-09-24)', () => {
    // 5tti-66ds GROUP BY facility_status: the four CONDI* spellings are one placard.
    expect(normalizePlacard('CONDITIONAL PASS')).toBe('conditional')
    expect(normalizePlacard('CONDITIIONAL PASS')).toBe('conditional')
    expect(normalizePlacard('CONDITIONA PASS')).toBe('conditional')
    expect(normalizePlacard('CONDITONAL PASS')).toBe('conditional')
    expect(normalizePlacard('PASS')).toBe('pass')
    expect(normalizePlacard('CLOSURE')).toBe('closure')
  })

  it('normalizes the 2024+ literals; NULL is no placard, never a pass', () => {
    expect(normalizePlacard('Pass')).toBe('pass')
    expect(normalizePlacard('Conditional Pass')).toBe('conditional')
    expect(normalizePlacard('Closure')).toBe('closure')
    expect(normalizePlacard('  conditional   pass ')).toBe('conditional')
    expect(normalizePlacard(null)).toBeNull()
    expect(normalizePlacard(undefined)).toBeNull()
    expect(normalizePlacard('')).toBeNull()
    expect(normalizePlacard('Pending')).toBeNull()
    expect(normalizePlacard('PASSED')).toBeNull()
  })

  it('ranks worst first: closure > conditional > pass', () => {
    expect(PLACARD_ORDER).toEqual(['closure', 'conditional', 'pass'])
    expect(PLACARD_RANK.closure).toBeGreaterThan(PLACARD_RANK.conditional)
    expect(PLACARD_RANK.conditional).toBeGreaterThan(PLACARD_RANK.pass)
    expect(worsePlacard('pass', 'closure')).toBe('closure')
    expect(worsePlacard('conditional', 'pass')).toBe('conditional')
    expect(worsePlacard(null, 'pass')).toBe('pass')
    expect(worsePlacard(null, null)).toBeNull()
  })

  it('maps to moss-500 / ochre-500 / brick-600 (spec D7; tokens.css)', () => {
    expect(PLACARD_COLOR).toEqual({ pass: '#7a9954', conditional: '#d4a435', closure: '#963e30' })
  })

  it('reader words never say "score" (placards are not scores) and round-trip the tvy3 literals', () => {
    for (const p of PLACARD_ORDER) {
      expect(PLACARD_WORD[p].toLowerCase()).not.toContain('score')
      expect(PLACARD_LABEL[p].toLowerCase()).not.toContain('score')
      expect(normalizePlacard(PLACARD_TVY3_VALUE[p])).toBe(p)
    }
  })

  it('parses ?placard= to the two filterable readings only', () => {
    expect(parsePlacardFilter('closure')).toBe('closure')
    expect(parsePlacardFilter('conditional')).toBe('conditional')
    expect(parsePlacardFilter('pass')).toBeNull()
    expect(parsePlacardFilter(null)).toBeNull()
  })
})
