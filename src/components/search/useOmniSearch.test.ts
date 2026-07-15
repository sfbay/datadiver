import { describe, it, expect } from 'vitest'
import { SEARCH_INDEX } from './useOmniSearch'

describe('OmniSearch index', () => {
  it('neighborhood results carry the nh param the Neighborhood view reads', () => {
    const places = SEARCH_INDEX.filter((r) => r.category === 'place')
    expect(places.length).toBeGreaterThan(30)
    for (const p of places) {
      expect(p.path).toBe('/neighborhood')
      expect(p.params?.nh, `${p.label} must use ?nh= (Neighborhood.tsx reads 'nh', not 'n')`).toBeTruthy()
    }
  })
})
