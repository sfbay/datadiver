// src/data/census-oakland.test.ts
// Reconciliation + shape pins for the committed Oakland ACS region data.

import { describe, it, expect } from 'vitest'
import regions from './census-oakland-neighborhoods.json'
import tracts from './census-oakland-tracts.json'
import { OAKLAND_REGION_NAMES } from '../cities/oakland/regionNames'
import { OAKLAND_TRACT_REGIONS } from '../cities/oakland/tractRegions'

const CODES = ['C', 'CE', 'E', 'F', 'L', 'N', 'NW', 'S', 'SE', 'W']

// ---------------------------------------------------------------------------
// PUBLISHED FIGURES — these exact numbers are printed as prose in
// `src/views/About/About.tsx` (the #oakland-regions Finding) and in
// `docs/data-insights.md` (the Oakland regions section, including its ten-row
// per-region table).
//
// REGENERATING THE CENSUS JSONs MEANS UPDATING ALL THREE IN THE SAME COMMIT.
// The band check below is only a smoke test — 90,000 wide, so a crosswalk that
// silently lost eight tracts (~30,000 people) would pass it while About kept
// publishing stale figures. These exact pins are what turn that drift into a
// failing test. Current figures include tract 06001404200 (the gap-centroid
// north-hills tract), added to NW by explicit MANUAL override Aug 11 2026
// after measurement: pop 3,584, median income $246,193 — see
// scripts/build-oakland-tract-regions.py and data-insights.
// ---------------------------------------------------------------------------
const PUBLISHED_TOTAL_POPULATION = 426_920
const PUBLISHED_TRACT_COUNT = 111
const PUBLISHED_REGION_TRACTS: Record<string, number> = {
  C: 16, CE: 10, E: 16, F: 9, L: 10, N: 14, NW: 8, S: 14, SE: 4, W: 10,
}

describe('Oakland census region data', () => {
  it('has exactly 10 region rows keyed by the region codes', () => {
    expect(regions).toHaveLength(10)
    const names = (regions as any[]).map((r) => r.name).sort()
    expect(names).toEqual([...CODES].sort())
    // every code has an authored display label
    for (const r of regions as any[]) expect(OAKLAND_REGION_NAMES[r.name]).toBeTruthy()
  })

  it('the crosswalk and the committed tract file describe the SAME tract set', () => {
    // The drift this catches: editing tractRegions.ts without regenerating the
    // JSONs (or vice versa) passes every other test while code and payload
    // disagree about which tracts exist.
    expect(OAKLAND_TRACT_REGIONS).toHaveLength((tracts as any[]).length)
    const inCrosswalk = new Set(OAKLAND_TRACT_REGIONS.map((m) => m.tractId))
    for (const t of tracts as any[]) {
      expect(inCrosswalk.has(t.geoId.slice(-6)), t.geoId).toBe(true)
    }
  })

  it('region populations reconcile to Oakland (~427k, band 380–470k)', () => {
    const total = (regions as any[]).reduce((s, r) => s + (r.population || 0), 0)
    expect(total).toBeGreaterThan(380_000)
    expect(total).toBeLessThan(470_000)
  })

  it('the region total is EXACTLY the figure About and data-insights publish', () => {
    const total = (regions as any[]).reduce((s, r) => s + (r.population || 0), 0)
    expect(total).toBe(PUBLISHED_TOTAL_POPULATION)
  })

  it('every region holds EXACTLY the tract count the docs publish', () => {
    const actual = Object.fromEntries(
      (regions as any[]).map((r) => [r.name, r.tractCount]),
    )
    expect(actual).toEqual(PUBLISHED_REGION_TRACTS)
  })

  it('the per-region tract counts sum to the crosswalk — no tract lost or double-counted', () => {
    const summed = (regions as any[]).reduce((s, r) => s + (r.tractCount || 0), 0)
    expect(summed).toBe(PUBLISHED_TRACT_COUNT)
    expect(summed).toBe((tracts as any[]).length)
  })

  it('every region carries core ACS variables (population + median income)', () => {
    for (const r of regions as any[]) {
      expect(r.population).toBeGreaterThan(0)
      expect(r.medianIncome).toBeGreaterThan(0)
    }
  })

  it('the tract file is Oakland-only (111 crosswalk tracts, 06001 geoids)', () => {
    expect(tracts).toHaveLength(PUBLISHED_TRACT_COUNT)
    for (const t of tracts as any[]) expect(t.geoId).toMatch(/^06001/)
  })
})
