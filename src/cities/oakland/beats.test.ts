import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OAKLAND_BEATS } from './beats'

// The committed asset and the authored const can never drift silently —
// the duplicated-allowlist lesson, applied to geography.
describe('oakland beats asset ↔ OAKLAND_BEATS', () => {
  const geo = JSON.parse(
    readFileSync('public/data/geo/oakland-beats.geojson', 'utf8')
  ) as { features: { properties: { nhood: string } }[] }

  it('59 features, one per beat', () => {
    expect(geo.features).toHaveLength(59)
    expect(OAKLAND_BEATS).toHaveLength(59)
  })

  it('asset nhood set === OAKLAND_BEATS exactly', () => {
    const assetIds = geo.features.map((f) => f.properties.nhood).sort()
    expect(assetIds).toEqual([...OAKLAND_BEATS].sort())
  })

  it('every id matches the beat grammar (incl. the Z suffix)', () => {
    for (const id of OAKLAND_BEATS) {
      expect(id).toMatch(/^([0-9]{2}[XYZ]|LKM1|PDT2)$/)
    }
  })

  it('features carry ONLY the canonical join property', () => {
    for (const f of geo.features) {
      expect(Object.keys(f.properties)).toEqual(['nhood'])
    }
  })
})
