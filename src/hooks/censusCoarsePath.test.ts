// src/hooks/censusCoarsePath.test.ts
// The boundary asset the Demographics choropleth loads. Oakland's areas are 59
// POLICE BEATS; its census rows are keyed by 10 region codes. Joining region
// rows onto beat polygons yields zero matches — which downstream flattens the
// colour ramp into stops Mapbox rejects: a silent no-paint, not an error. This
// pins the resolver that keeps the two apart.

import { describe, it, expect } from 'vitest'
import { CITIES, censusCoarseGeojsonPath } from '../cities/registry'

describe('censusCoarseGeojsonPath', () => {
  it('oakland resolves the 10-region asset, NOT the 59-beat asset', () => {
    expect(censusCoarseGeojsonPath(CITIES.oakland)).toBe('/data/geo/oakland-regions.geojson')
    expect(censusCoarseGeojsonPath(CITIES.oakland)).not.toBe(CITIES.oakland.areas.geojsonPath)
  })

  it('sf resolves its neighborhoods — unchanged, the two spines are one', () => {
    expect(censusCoarseGeojsonPath(CITIES.sf)).toBe(CITIES.sf.areas.geojsonPath)
  })
})
