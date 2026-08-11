// src/cities/oakland/regions.test.ts
// Pins the 10-region demographic spine: the committed geojson, the authored
// names, and the generated members map. Kills names↔asset↔members drift by
// construction (the duplicated-allow-list lesson).

import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { OAKLAND_REGION_NAMES, OAKLAND_REGION_CODES } from './regionNames'
import { OAKLAND_REGION_MEMBERS } from './regionMembers'

const CODES = ['C', 'CE', 'E', 'F', 'L', 'N', 'NW', 'S', 'SE', 'W']

describe('oakland-regions.geojson', () => {
  const fc = JSON.parse(readFileSync('public/data/geo/oakland-regions.geojson', 'utf8'))

  it('has exactly 10 features whose nhood set is the 10 region codes', () => {
    expect(fc.features).toHaveLength(10)
    expect(fc.features.map((f: any) => f.properties.nhood).sort()).toEqual([...CODES].sort())
  })

  it('every feature carries ONLY the nhood property', () => {
    for (const f of fc.features) {
      expect(Object.keys(f.properties)).toEqual(['nhood'])
    }
  })

  it('sits in the Oakland bounding box', () => {
    const flat = JSON.stringify(fc)
    expect(flat).toMatch(/-122\.[0-3]/)
    expect(flat).toMatch(/37\.[678]/)
  })
})

describe('region names + members', () => {
  it('names are bijective on the 10 codes', () => {
    expect(Object.keys(OAKLAND_REGION_NAMES).sort()).toEqual([...CODES].sort())
    expect(OAKLAND_REGION_CODES).toEqual([...CODES].sort())
  })

  it('members map is keyed by the same 10 codes', () => {
    expect(Object.keys(OAKLAND_REGION_MEMBERS).sort()).toEqual([...CODES].sort())
  })

  it('members cover the 131 source polygons (129 unique names; 2 span CE/E)', () => {
    const all = Object.values(OAKLAND_REGION_MEMBERS).flat()
    expect(all).toHaveLength(131) // sb4q-6bkc feature rows
    expect(new Set(all).size).toBe(129) // Coliseum Industrial Complex + East 14th Street Business appear under CE AND E
  })

  it('the only cross-region names are the two Coliseum-edge industrial areas', () => {
    const seen = new Map<string, string[]>()
    for (const [code, names] of Object.entries(OAKLAND_REGION_MEMBERS)) {
      for (const n of names) seen.set(n, [...(seen.get(n) ?? []), code])
    }
    const spanning = [...seen.entries()].filter(([, codes]) => codes.length > 1).map(([n]) => n).sort()
    expect(spanning).toEqual(['Coliseum Industrial Complex', 'East 14th Street Business'])
  })
})
