// src/views/Last48/photoreal/immersive/pointInNeighborhood.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pointInNeighborhood } from './pointInNeighborhood'

const boundaries = JSON.parse(readFileSync('public/data/geo/sf-analysis-neighborhoods.geojson', 'utf8')) as GeoJSON.FeatureCollection

describe('pointInNeighborhood (Round B §3)', () => {
  it('16th & Mission is the Mission', () => {
    expect(pointInNeighborhood(-122.4194, 37.7649, boundaries)).toBe('Mission')
  })
  it('the ocean is nowhere', () => {
    expect(pointInNeighborhood(-122.6, 37.75, boundaries)).toBeNull()
  })
  it('no boundaries yet → null, not a throw', () => {
    expect(pointInNeighborhood(-122.4194, 37.7649, null)).toBeNull()
  })
})
