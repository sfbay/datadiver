// src/views/Demographics/regionLabels.test.ts
// The region-name symbol layer's source data.
//
// The defect this closes: on a two-geography city the choropleth paints a
// 10-region invention while Mapbox's basemap goes on labelling at NEIGHBORHOOD
// scale, so a reader sees a dark fill captioned "Elmhurst" and attributes Deep
// East Oakland's median income to Elmhurst. SF has no such gap — the polygons
// it paints ARE the places the basemap names — so SF must gain nothing here,
// and that is asserted with SF's real boundary asset, not just in principle.

import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { CITIES } from '../../cities/registry'
import { OAKLAND_REGION_NAMES } from '../../cities/oakland/regionNames'
import { buildRegionLabelFeatures } from './regionLabels'

const oaklandRegions = JSON.parse(
  readFileSync('public/data/geo/oakland-regions.geojson', 'utf8'),
) as GeoJSON.FeatureCollection

describe('buildRegionLabelFeatures — Oakland', () => {
  const fc = buildRegionLabelFeatures(oaklandRegions, CITIES.oakland)

  it('emits one Point per region', () => {
    expect(fc.features).toHaveLength(10)
    for (const f of fc.features) expect(f.geometry.type).toBe('Point')
  })

  it('carries the AUTHORED name as the label and the CODE as the id', () => {
    const byCode = new Map(
      fc.features.map(f => [f.properties!.nhood as string, f.properties!.label as string]),
    )
    expect(byCode.size).toBe(10)
    for (const [code, name] of Object.entries(OAKLAND_REGION_NAMES)) {
      expect(byCode.get(code)).toBe(name)
    }
    // The reader must never meet the bare code on the map.
    expect(byCode.get('NW')).toBe('Montclair & the North Hills')
    expect(byCode.get('E')).toBe('Deep East Oakland')
  })

  it('places every label inside the Oakland bbox', () => {
    for (const f of fc.features) {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
      expect(lat).toBeGreaterThan(37.6)
      expect(lat).toBeLessThan(37.9)
      expect(lng).toBeGreaterThan(-122.4)
      expect(lng).toBeLessThan(-122.1)
    }
  })

  it('gives each region its own position', () => {
    const seen = new Set(
      fc.features.map(f => (f.geometry as GeoJSON.Point).coordinates.join(',')),
    )
    expect(seen.size).toBe(10)
  })
})

describe('buildRegionLabelFeatures — one-geography cities gain nothing', () => {
  it("SF's real boundaries produce ZERO label features", () => {
    const sfBoundaries = JSON.parse(
      readFileSync(`public${CITIES.sf.areas.geojsonPath}`, 'utf8'),
    ) as GeoJSON.FeatureCollection
    expect(sfBoundaries.features.length).toBeGreaterThan(0) // the asset really loaded
    expect(buildRegionLabelFeatures(sfBoundaries, CITIES.sf).features).toEqual([])
  })

  it('the CITY is the gate, not the geometry — region polygons under SF still yield none', () => {
    expect(buildRegionLabelFeatures(oaklandRegions, CITIES.sf).features).toEqual([])
  })

  it('returns an empty collection before boundaries land', () => {
    expect(buildRegionLabelFeatures(null, CITIES.oakland).features).toEqual([])
  })

  it('hands back a stable object when there is nothing to label', () => {
    // Same singleton reasoning as buildBoundaryCenters: a fresh object here
    // would churn the layer identity on every render.
    expect(buildRegionLabelFeatures(null, CITIES.sf)).toBe(
      buildRegionLabelFeatures(oaklandRegions, CITIES.sf),
    )
  })
})
