// src/data/census-sf.test.ts
// Coverage pins for the committed SF ACS payload.
//
// SF's neighborhood rows are built from BLOCK GROUPS, and the ACS does not
// tabulate poverty, unemployment, or commute mode at block-group scale — so six
// variables arrived empty and the Demographics view opened with a '—' Poverty
// Rate card. `scripts/patch-sf-neighborhood-rates.py` fills them by rolling the
// TRACT file's values up through DataSF's official whole-tract assignment
// (sevw-6tgi), population-weighted. These pins are what keep that fix from
// silently evaporating the next time the payload is regenerated.
//
// If a regenerated payload legitimately moves a number here, RE-PIN it to the
// new measured truth — do not loosen the assertion into a range.

import { describe, it, expect } from 'vitest'
import neighborhoods from './census-neighborhoods.json'
import tracts from './census-tracts.json'

const NBHDS = neighborhoods as unknown as Record<string, unknown>[]
const TRACTS = tracts as unknown as Record<string, unknown>[]

/** The six variables the rollup script writes. */
const ROLLED_UP_KEYS = [
  'povertyRate',
  'unemploymentRate',
  'pctWFH',
  'pctDriveAlone',
  'pctTransit',
  'pctBikeWalk',
] as const

const coverage = (rows: Record<string, unknown>[], key: string) =>
  rows.filter((r) => typeof r[key] === 'number' && Number.isFinite(r[key])).length

describe('SF committed census payload', () => {
  it('holds the 41 analysis neighborhoods and 244 tracts', () => {
    expect(NBHDS).toHaveLength(41)
    expect(TRACTS).toHaveLength(244)
  })

  it('publishes the six rolled-up variables on 40 of 41 neighborhoods', () => {
    // 40, not 41: Lincoln Park's only tract is 980200, one of the four the ACS
    // publishes no rate for. An absent value there is a real gap, not a bug —
    // the script refuses to invent one.
    for (const key of ROLLED_UP_KEYS) {
      expect(coverage(NBHDS, key), key).toBe(40)
    }
  })

  it('names the one neighborhood the rollup cannot reach', () => {
    const missing = NBHDS.filter((r) => typeof r.povertyRate !== 'number').map((r) => r.name)
    expect(missing).toEqual(['Lincoln Park'])
    for (const key of ROLLED_UP_KEYS) {
      const gap = NBHDS.filter((r) => typeof r[key] !== 'number').map((r) => r.name)
      expect(gap, key).toEqual(['Lincoln Park'])
    }
  })

  it('keeps every rolled-up rate inside 0–100', () => {
    for (const row of NBHDS) {
      for (const key of ROLLED_UP_KEYS) {
        const value = row[key]
        if (typeof value !== 'number') continue
        expect(value, `${row.name}.${key}`).toBeGreaterThanOrEqual(0)
        expect(value, `${row.name}.${key}`).toBeLessThanOrEqual(100)
      }
    }
  })

  it('sources the rollup from 240 of the 244 tracts', () => {
    for (const key of ROLLED_UP_KEYS) {
      expect(coverage(TRACTS, key), key).toBe(240)
    }
  })

  it('leaves renterHouseholds intact on all 41 neighborhoods', () => {
    // The tripwire. `renterHouseholds` is written by ONE script
    // (patch-renter-households.py) and destroyed by another
    // (generate-census-static.ts, whose SF path cannot produce it). It is the
    // denominator behind every eviction rate on the Housing view, so losing it
    // turns a headline figure into '—' with nothing failing.
    expect(coverage(NBHDS, 'renterHouseholds')).toBe(41)
    expect(coverage(TRACTS, 'renterHouseholds')).toBe(244)
  })

  it('rolls poverty up to a citywide weighted rate near 10.7%', () => {
    // Population-weighted across the neighborhoods that carry a value; the same
    // weighting done tract-by-tract gives 10.68%, and SF's published ACS poverty
    // rate sits around 10–11%.
    let weighted = 0
    let population = 0
    for (const row of NBHDS) {
      const rate = row.povertyRate
      const pop = row.population
      if (typeof rate !== 'number' || typeof pop !== 'number' || pop <= 0) continue
      weighted += rate * pop
      population += pop
    }
    expect(weighted / population).toBeGreaterThan(9)
    expect(weighted / population).toBeLessThan(12)
  })
})
