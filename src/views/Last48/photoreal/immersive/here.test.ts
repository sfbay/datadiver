// src/views/Last48/photoreal/immersive/here.test.ts
import { describe, it, expect } from 'vitest'
import { nearbyCounts, formatNearby, acsLine, cornerFromGeocode, HERE_RADIUS_M } from './here'
import type { NormalizedEvent } from '@/types/last48'

const ev = (id: string, datasetId: NormalizedEvent['datasetId'], lng: number, lat: number): NormalizedEvent =>
  ({ id, datasetId, timestamp: '', receivedAt: 1, longitude: lng, latitude: lat, raw: {} })

// 0.001° lat ≈ 111 m; 0.003° ≈ 334 m (outside 300).
const HERE = { lng: -122.42, lat: 37.76 }
const EVENTS = [
  ev('a', '911-realtime', -122.42, 37.761),
  ev('b', '911-realtime', -122.4205, 37.7605),
  ev('c', 'fire-ems-dispatch', -122.42, 37.759),
  ev('d', '311-cases', -122.42, 37.763),          // 334 m north — out
  ev('e', '311-cases', -122.4235, 37.76),         // ≈308 m west (cos 37.76 ≈ 0.79) — out
  { ...ev('f', '311-cases', 0, 0), longitude: undefined, latitude: undefined },
]

describe('nearbyCounts / formatNearby (Round B §3)', () => {
  it('counts by stream within 300 m, ignoring unlocated rows', () => {
    expect(HERE_RADIUS_M).toBe(300)
    expect(nearbyCounts(EVENTS, HERE.lng, HERE.lat)).toEqual({ '911-realtime': 2, 'fire-ems-dispatch': 1, '311-cases': 0 })
  })
  it('speaks the stream words in stream order and skips zeros', () => {
    expect(formatNearby({ '911-realtime': 4, 'fire-ems-dispatch': 1, '311-cases': 2 })).toBe('911 dispatch 4 · Fire/EMS 1 · 311 case 2')
    expect(formatNearby({ '911-realtime': 0, 'fire-ems-dispatch': 3, '311-cases': 0 })).toBe('Fire/EMS 3')
  })
  it('all zero reads "quiet here"', () => {
    expect(formatNearby({ '911-realtime': 0, 'fire-ems-dispatch': 0, '311-cases': 0 })).toBe('quiet here')
  })
})

describe('acsLine', () => {
  it('one plain line, whole dollars, whole percent', () => {
    expect(acsLine({ medianRent: 2339.6, pctOver65: 18.4 })).toBe('Median rent $2,340 · 18% over 65')
  })
  it('omits a missing half; null when both are missing', () => {
    expect(acsLine({ medianRent: 2100 })).toBe('Median rent $2,100')
    expect(acsLine({ pctOver65: 9.6 })).toBe('10% over 65')
    expect(acsLine({})).toBeNull()
    expect(acsLine(undefined)).toBeNull()
  })
})

describe('cornerFromGeocode', () => {
  it("reads the first feature's name from a Mapbox v6 reverse response", () => {
    const json = { features: [{ properties: { name: '445 Minna Street', full_address: '445 Minna Street, San Francisco, California 94103, United States' } }] }
    expect(cornerFromGeocode(json)).toBe('near 445 Minna Street')
  })
  it('anything else → null (the row is omitted)', () => {
    expect(cornerFromGeocode({ features: [] })).toBeNull()
    expect(cornerFromGeocode({ features: [{ properties: {} }] })).toBeNull()
    expect(cornerFromGeocode(null)).toBeNull()
    expect(cornerFromGeocode('nope')).toBeNull()
  })
})
