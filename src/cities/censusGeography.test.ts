// src/cities/censusGeography.test.ts
import { describe, it, expect } from 'vitest'
import { CITIES } from './registry'
import { censusMatchesAreas } from './registry'

describe('censusMatchesAreas', () => {
  it('sf: the 41 neighborhoods ARE the census spine, so area-keyed census affordances are live', () => {
    expect(censusMatchesAreas(CITIES.sf)).toBe(true)
  })

  it('oakland: census lives on regions, areas are beats — area-keyed affordances stand down', () => {
    expect(censusMatchesAreas(CITIES.oakland)).toBe(false)
  })

  it('a city with no census pipeline at all is false', () => {
    expect(censusMatchesAreas({ ...CITIES.oakland, census: null })).toBe(false)
  })
})
