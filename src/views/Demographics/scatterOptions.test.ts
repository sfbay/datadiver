// src/views/Demographics/scatterOptions.test.ts
// Pins what the scatter Y-axis offers and what each city can actually plot.
//
// Written to settle a review question — "is renterHouseholds an unexplained
// empty option on Oakland?" — with evidence. It is not: `format: 'number'`
// keeps it out of the option list entirely. And the coverage gaps that DO
// exist are not Oakland-specific: since the SF tract rollup (six rate
// variables recovered from the tract file, `patch-sf-neighborhood-rates.py`),
// the two cities' dead sets are IDENTICAL — the same eight variables. SF's set
// was 14 before that fix; the six it lost are the six the rollup filled.

import { describe, it, expect } from 'vitest'
import {
  SCATTER_CENSUS_OPTIONS,
  coverageCount,
  isPlottable,
  MIN_SCATTER_POINTS,
} from './scatterOptions'
import type { NeighborhoodCensusData } from '../../types/census'
import sfRows from '../../data/census-neighborhoods.json'
import oaklandRows from '../../data/census-oakland-neighborhoods.json'

const SF = sfRows as unknown as NeighborhoodCensusData[]
const OAK = oaklandRows as unknown as NeighborhoodCensusData[]

const deadOn = (rows: NeighborhoodCensusData[]) =>
  SCATTER_CENSUS_OPTIONS.filter(v => !isPlottable(rows, v.key)).map(v => v.key)

describe('coverageCount / isPlottable', () => {
  it('counts only finite numbers — nulls and undefined do not', () => {
    const rows = [
      { name: 'a', medianIncome: 100 },
      { name: 'b', medianIncome: null },
      { name: 'c' },
      { name: 'd', medianIncome: Number.NaN },
      { name: 'e', medianIncome: 200 },
    ] as unknown as NeighborhoodCensusData[]
    expect(coverageCount(rows, 'medianIncome')).toBe(2)
    expect(coverageCount(rows, 'nothingHere')).toBe(0)
  })

  it('needs two points before a variable counts as plottable', () => {
    const one = [{ name: 'a', medianIncome: 100 }] as unknown as NeighborhoodCensusData[]
    expect(MIN_SCATTER_POINTS).toBe(2)
    expect(isPlottable(one, 'medianIncome')).toBe(false)
    expect(isPlottable([...one, { name: 'b', medianIncome: 2 } as never], 'medianIncome')).toBe(true)
  })
})

describe('the offered option list', () => {
  it("never offers the count-shaped variables — they are 'number' format", () => {
    const offered = SCATTER_CENSUS_OPTIONS.map(v => v.key)
    // Both are SF-only keys. Neither reaches the dropdown, so neither can be
    // the "empty option on Oakland" a reviewer might reasonably suspect.
    expect(offered).not.toContain('renterHouseholds')
    expect(offered).not.toContain('blockGroupCount')
  })

  it('offers the same list to every city — the list is config, not data', () => {
    expect(SCATTER_CENSUS_OPTIONS.length).toBeGreaterThan(20)
  })
})

describe('per-city coverage of the offered options', () => {
  it("the no-civic default Y ('rentBurden') is plottable in BOTH cities", () => {
    // Load-bearing: Oakland opens on this axis because the civic metrics are
    // withheld there. If it were ever dead, Oakland would open on a blank
    // scatter with no explanation.
    expect(isPlottable(SF, 'rentBurden')).toBe(true)
    expect(isPlottable(OAK, 'rentBurden')).toBe(true)
  })

  it('the default X variable is plottable in both cities', () => {
    expect(isPlottable(SF, 'medianIncome')).toBe(true)
    expect(isPlottable(OAK, 'medianIncome')).toBe(true)
  })

  it('NO option is alive on SF but dead on Oakland — the gap is not city-specific', () => {
    const oaklandOnly = deadOn(OAK).filter(key => !deadOn(SF).includes(key))
    expect(oaklandOnly).toEqual([])
  })

  it('the two cities are now dead on exactly the same eight options', () => {
    // Measured after the SF tract rollup. Pinned as membership, not a count, so
    // a payload that fills one city's gap without the other's fails loudly
    // instead of drifting. If a regenerated payload legitimately publishes one
    // of these, RE-PIN the list — do not relax it back to a length check.
    const DEAD_IN_BOTH = [
      'lepRate',
      'pctChinese',
      'pctKorean',
      'pctRussian',
      'pctSpanish',
      'pctTagalog',
      'pctVietnamese',
      'populationDensity',
    ]
    expect([...deadOn(SF)].sort()).toEqual(DEAD_IN_BOTH)
    expect([...deadOn(OAK)].sort()).toEqual(DEAD_IN_BOTH)
  })

  it('the six rolled-up SF rates are alive — the Poverty Rate card is not a dash', () => {
    // These were SF's extra six dead options before the tract rollup. Poverty
    // Rate is one of the four cards Demographics opens expanded, so an empty
    // povertyRate is the defect a reader meets first.
    for (const key of ['povertyRate', 'unemploymentRate', 'pctWFH', 'pctDriveAlone', 'pctTransit', 'pctBikeWalk']) {
      expect(isPlottable(SF, key), key).toBe(true)
    }
  })

  it('both cities carry unpublished options, so the view must explain the empty axis', () => {
    // The condition stays REACHABLE, which is why the view names the reason.
    expect(deadOn(SF).length).toBeGreaterThan(0)
    expect(deadOn(OAK).length).toBeGreaterThan(0)
  })
})
