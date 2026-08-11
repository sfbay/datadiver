// src/cities/censusUnits.test.ts
// The coarse-census-unit label + noun helpers. Oakland's census rows are keyed
// by region CODE ('C', 'NW'); the authored name is DISPLAY ONLY, exactly as
// composeAreaLabel is for beats. SF is the identity case — its neighborhood
// names already ARE the labels, so every assertion below must leave it alone.

import { describe, it, expect } from 'vitest'
import { CITIES } from './registry'
import { censusUnitLabel, censusUnitNoun } from './areaLabel'

describe('censusUnitLabel', () => {
  it('oakland renders the authored region name for a code', () => {
    expect(censusUnitLabel(CITIES.oakland, 'NW')).toBe('Montclair & the North Hills')
    expect(censusUnitLabel(CITIES.oakland, 'C')).toBe('Downtown & Lake Merritt')
  })

  it('an unknown id falls back to the id itself — never to a wrong place name', () => {
    expect(censusUnitLabel(CITIES.oakland, 'ZZ')).toBe('ZZ')
  })

  it('sf is the identity — its neighborhood names are already the labels', () => {
    expect(censusUnitLabel(CITIES.sf, 'Mission')).toBe('Mission')
    expect(censusUnitLabel(CITIES.sf, 'Bayview Hunters Point')).toBe('Bayview Hunters Point')
  })

  it('labels every committed oakland region code', () => {
    const regions = CITIES.oakland.census?.regions
    expect(regions).toBeDefined()
    for (const code of Object.keys(regions!.names)) {
      expect(censusUnitLabel(CITIES.oakland, code)).not.toBe(code)
    }
  })
})

describe('censusUnitNoun', () => {
  it('oakland speaks regions, sf keeps neighborhoods', () => {
    expect(censusUnitNoun(CITIES.oakland).many).toBe('regions')
    expect(censusUnitNoun(CITIES.oakland).one).toBe('region')
    expect(censusUnitNoun(CITIES.sf).many).toBe('neighborhoods')
    expect(censusUnitNoun(CITIES.sf).one).toBe('neighborhood')
  })

  it("never speaks oakland's AREA noun — beats are not the census spine", () => {
    expect(censusUnitNoun(CITIES.oakland).many).not.toBe(CITIES.oakland.areas.nounPlural)
  })
})
