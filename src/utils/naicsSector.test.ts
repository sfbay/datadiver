// src/utils/naicsSector.test.ts
//
// Guards the NAICS-code → SF sector crosswalk that replaced DataSF's dropped
// `naic_code_description` column. Two contracts:
//   1. MAPPING — real codes resolve to the right DataDiver category, the 721/722
//      split works, and noisy/blank codes fall to 'Uncategorized' (never guessed).
//   2. WHERE — sectorWhereClause emits valid SoQL that round-trips the same
//      prefixes, so the server-side sector filter stays consistent with display.

import { describe, it, expect } from 'vitest'
import { naicsSector, sectorWhereClause, SECTOR_PREFIXES, UNCATEGORIZED } from './naicsSector'

describe('naicsSector', () => {
  it('maps common full codes to their sector', () => {
    expect(naicsSector('624110')).toBe('Private Education and Health Services')
    expect(naicsSector('541511')).toBe('Professional, Scientific, and Technical Services')
    expect(naicsSector('531120')).toBe('Real Estate and Rental and Leasing Services')
    expect(naicsSector('236220')).toBe('Construction')
    expect(naicsSector('511210')).toBe('Information')
    expect(naicsSector('522110')).toBe('Financial Services')
  })

  it('splits NAICS 72 at three digits (Accommodations vs Food Services)', () => {
    expect(naicsSector('721110')).toBe('Accommodations')
    expect(naicsSector('722511')).toBe('Food Services')
    expect(naicsSector('7225')).toBe('Food Services')
    expect(naicsSector('7211')).toBe('Accommodations')
  })

  it('folds Retail (44/45) and Manufacturing (31/32/33) to one label each', () => {
    expect(naicsSector('44')).toBe('Retail Trade')
    expect(naicsSector('452319')).toBe('Retail Trade')
    expect(naicsSector('311111')).toBe('Manufacturing')
    expect(naicsSector('332')).toBe('Manufacturing')
  })

  it('accepts 2-digit codes', () => {
    expect(naicsSector('23')).toBe('Construction')
    expect(naicsSector('54')).toBe('Professional, Scientific, and Technical Services')
  })

  it('resolves noisy/blank/short codes to Uncategorized, never a guess', () => {
    expect(naicsSector(null)).toBe(UNCATEGORIZED)
    expect(naicsSector(undefined)).toBe(UNCATEGORIZED)
    expect(naicsSector('')).toBe(UNCATEGORIZED)
    expect(naicsSector('7')).toBe(UNCATEGORIZED)
    expect(naicsSector('00')).toBe(UNCATEGORIZED)   // seen in live data
    expect(naicsSector('99')).toBe(UNCATEGORIZED)
    expect(naicsSector('20')).toBe(UNCATEGORIZED)
  })

  it('tolerates surrounding whitespace / non-digits', () => {
    expect(naicsSector('  722320 ')).toBe('Food Services')
    expect(naicsSector('54-1511')).toBe('Professional, Scientific, and Technical Services')
  })
})

describe('sectorWhereClause', () => {
  it('emits a single LIKE for a one-prefix sector', () => {
    expect(sectorWhereClause(['Food Services'])).toBe(
      "(self_reported_naics_code LIKE '722%')",
    )
  })

  it('ORs every prefix of a multi-prefix sector', () => {
    expect(sectorWhereClause(['Retail Trade'])).toBe(
      "(self_reported_naics_code LIKE '44%' OR self_reported_naics_code LIKE '45%')",
    )
  })

  it('maps Uncategorized to a null-code test', () => {
    expect(sectorWhereClause([UNCATEGORIZED])).toBe(
      '(self_reported_naics_code IS NULL)',
    )
  })

  it('returns empty string when nothing constrains', () => {
    expect(sectorWhereClause([])).toBe('')
  })

  it('honors a custom column name', () => {
    expect(sectorWhereClause(['Construction'], 'code')).toBe("(code LIKE '23%')")
  })

  it('never exposes a bare 72 prefix (would double-count Accommodations)', () => {
    for (const prefixes of Object.values(SECTOR_PREFIXES)) {
      expect(prefixes).not.toContain('72')
    }
    expect(SECTOR_PREFIXES['Accommodations']).toEqual(['721'])
    expect(SECTOR_PREFIXES['Food Services']).toEqual(['722'])
  })
})
