// src/views/Demographics/cartogramCenters.test.ts
// SF's cartogram positions are hand-tuned and must stay bit-identical now that
// a boundary-derived centroid backs the table up. Two separate facts hold that
// up, and BOTH are pinned here — covering the table alone would only prove the
// fallback is unnecessary, not that it is unreachable:
//
//   1. resolveCenter consults the TABLE FIRST. Flip that ordering and every SF
//      circle moves to a computed centroid, so the ordering needs its own pin.
//   2. Every SF census row finds a table entry, so the fallback never fires.

import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import {
  NEIGHBORHOOD_CENTERS,
  resolveCenter,
  needsBoundaryCenters,
  buildBoundaryCenters,
  type LatLng,
} from './useDemographicsData'
import sfCensus from '../../data/census-neighborhoods.json'

const sfNames = (sfCensus as { name: string }[]).map(n => n.name)

describe('resolveCenter', () => {
  const table: Record<string, LatLng> = { Mission: { lat: 1, lng: 2 } }
  const fallback = new Map<string, LatLng>([
    ['Mission', { lat: 99, lng: 99 }],
    ['NW', { lat: 3, lng: 4 }],
  ])

  it('THE TABLE WINS when both have the name — this is what freezes SF', () => {
    expect(resolveCenter('Mission', table, fallback)).toEqual({ lat: 1, lng: 2 })
    expect(resolveCenter('Mission', table, fallback)).toBe(table.Mission)
  })

  it('falls back only for a name the table never had', () => {
    expect(resolveCenter('NW', table, fallback)).toEqual({ lat: 3, lng: 4 })
  })

  it('returns null when neither knows the name', () => {
    expect(resolveCenter('Nowhere', table, fallback)).toBeNull()
  })

  it('works with no fallback at all', () => {
    const empty = new Map<string, LatLng>()
    expect(resolveCenter('Mission', table, empty)).toEqual({ lat: 1, lng: 2 })
    expect(resolveCenter('NW', table, empty)).toBeNull()
  })
})

describe('needsBoundaryCenters', () => {
  it('is false when the table names every unit — SF skips the fallback build', () => {
    expect(needsBoundaryCenters(sfNames, NEIGHBORHOOD_CENTERS)).toBe(false)
  })

  it('is true as soon as one unit is unnamed — a region-coded city', () => {
    expect(needsBoundaryCenters(['C', 'NW'], NEIGHBORHOOD_CENTERS)).toBe(true)
    expect(needsBoundaryCenters(['Mission', 'C'], NEIGHBORHOOD_CENTERS)).toBe(true)
  })

  it('is false for an empty roster', () => {
    expect(needsBoundaryCenters([], NEIGHBORHOOD_CENTERS)).toBe(false)
  })
})

describe('buildBoundaryCenters', () => {
  const oaklandRegions = JSON.parse(
    readFileSync('public/data/geo/oakland-regions.geojson', 'utf8'),
  ) as GeoJSON.FeatureCollection

  it('returns the SAME object whenever no fallback is wanted — the SF path', () => {
    // This identity is what stops the cartogram re-animating when SF's
    // boundary GeoJSON resolves. A fresh `new Map()` here would look correct
    // and still wipe + replay the entrance under a reader.
    const before = buildBoundaryCenters(null, false)
    const after = buildBoundaryCenters(oaklandRegions, false)
    expect(after).toBe(before)
    expect(after.size).toBe(0)
  })

  it('returns the singleton before boundaries land, even when wanted', () => {
    expect(buildBoundaryCenters(null, true)).toBe(buildBoundaryCenters(null, false))
  })

  it('derives one centroid per region when the fallback IS wanted', () => {
    const centers = buildBoundaryCenters(oaklandRegions, true)
    expect(centers.size).toBe(10)
    expect(centers.get('NW')).toBeDefined()
    expect(centers.get('C')!.lat).toBeGreaterThan(37.6)
  })
})

describe('NEIGHBORHOOD_CENTERS (SF)', () => {
  it('covers every SF census neighborhood — the boundary fallback never fires on SF', () => {
    const missing = sfNames.filter(n => !(n in NEIGHBORHOOD_CENTERS))
    expect(missing).toEqual([])
  })

  it('carries no entry SF census data does not have', () => {
    const stale = Object.keys(NEIGHBORHOOD_CENTERS).filter(n => !sfNames.includes(n))
    expect(stale).toEqual([])
  })
})
