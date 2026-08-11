// src/views/Demographics/cartogramCenters.test.ts
// SF's cartogram positions are hand-tuned and must stay bit-identical now that
// a boundary-derived centroid backs the table up. That only holds while EVERY
// SF census row still finds a table entry — if a new name ever appeared, the
// fallback would silently add a circle SF never had. This pins that, and pins
// the table itself against SF's committed census payload in both directions.

import { describe, it, expect } from 'vitest'
import { NEIGHBORHOOD_CENTERS } from './useDemographicsData'
import sfCensus from '../../data/census-neighborhoods.json'

const sfNames = (sfCensus as { name: string }[]).map((n) => n.name)

describe('NEIGHBORHOOD_CENTERS (SF)', () => {
  it('covers every SF census neighborhood — the boundary fallback never fires on SF', () => {
    const missing = sfNames.filter((n) => !(n in NEIGHBORHOOD_CENTERS))
    expect(missing).toEqual([])
  })

  it('carries no entry SF census data does not have', () => {
    const stale = Object.keys(NEIGHBORHOOD_CENTERS).filter((n) => !sfNames.includes(n))
    expect(stale).toEqual([])
  })
})
