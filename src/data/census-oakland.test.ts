// src/data/census-oakland.test.ts
// Reconciliation + shape pins for the committed Oakland ACS region data.

import { describe, it, expect } from 'vitest'
import regions from './census-oakland-neighborhoods.json'
import tracts from './census-oakland-tracts.json'
import { OAKLAND_REGION_NAMES } from '../cities/oakland/regionNames'

const CODES = ['C', 'CE', 'E', 'F', 'L', 'N', 'NW', 'S', 'SE', 'W']

describe('Oakland census region data', () => {
  it('has exactly 10 region rows keyed by the region codes', () => {
    expect(regions).toHaveLength(10)
    const names = (regions as any[]).map((r) => r.name).sort()
    expect(names).toEqual([...CODES].sort())
    // every code has an authored display label
    for (const r of regions as any[]) expect(OAKLAND_REGION_NAMES[r.name]).toBeTruthy()
  })

  it('region populations reconcile to Oakland (~423k, band 380–470k)', () => {
    const total = (regions as any[]).reduce((s, r) => s + (r.population || 0), 0)
    expect(total).toBeGreaterThan(380_000)
    expect(total).toBeLessThan(470_000)
  })

  it('every region carries core ACS variables (population + median income)', () => {
    for (const r of regions as any[]) {
      expect(r.population).toBeGreaterThan(0)
      expect(r.medianIncome).toBeGreaterThan(0)
    }
  })

  it('the tract file is Oakland-only (110 crosswalk tracts, 06001 geoids)', () => {
    expect(tracts).toHaveLength(110)
    for (const t of tracts as any[]) expect(t.geoId).toMatch(/^06001/)
  })
})
