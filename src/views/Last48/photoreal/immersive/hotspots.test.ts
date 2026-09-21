// src/views/Last48/photoreal/immersive/hotspots.test.ts
import { describe, it, expect } from 'vitest'
import { selectHotspots, HOTSPOT_MIN_Z, HOTSPOT_LIMIT } from './hotspots'
import type { AnomalyResult, FreshnessMap, NormalizedEvent } from '@/types/last48'

const fresh = (lagMs: number | null) => ({ rowsUpdatedAt: null, maxEventTime: null, eventLagMs: lagMs, refreshLagMs: null, error: null })
const ALL_FRESH: FreshnessMap = {
  '911-realtime': fresh(60_000),
  'fire-ems-dispatch': fresh(60_000),
  '311-cases': fresh(60_000),
}
const anomaly = (neighborhood: string, datasetId: AnomalyResult['datasetId'], zScore: number): AnomalyResult =>
  ({ neighborhood, datasetId, zScore, count48h: 10, baselineMean: 5, baselineSd: 2 })
const ev = (id: string, neighborhood: string, lng: number, lat: number): NormalizedEvent =>
  ({ id, datasetId: '911-realtime', timestamp: '', receivedAt: 1, neighborhood, longitude: lng, latitude: lat, raw: {} })

const EVENTS = [
  ev('a', 'Mission', -122.42, 37.76), ev('b', 'Mission', -122.40, 37.74),
  ev('c', 'Tenderloin', -122.41, 37.78),
  ev('d', 'Sunset/Parkside', -122.49, 37.75),
]

describe('selectHotspots (Round B §2)', () => {
  it('combines per neighborhood with Stouffer (Σz/√k), keeps z ≥ 1.5, ranks descending', () => {
    const out = selectHotspots([
      anomaly('Mission', '911-realtime', 2.0), anomaly('Mission', '311-cases', 2.0),   // 4/√2 = 2.83
      anomaly('Tenderloin', '911-realtime', 1.6),                                     // 1.6
      anomaly('Sunset/Parkside', '911-realtime', 1.4),                                // below the line
    ], ALL_FRESH, EVENTS)
    expect(out.map((h) => h.neighborhood)).toEqual(['Mission', 'Tenderloin'])
    expect(out[0].z).toBeCloseTo(2.83, 2)
    expect(out[0].tier).toBe(3)
    expect(out[1].tier).toBe(1)
    expect(HOTSPOT_MIN_Z).toBe(1.5)
  })
  it('speaks the Pulse tier words, never a z-score', () => {
    const out = selectHotspots([anomaly('Mission', '911-realtime', 2.0)], ALL_FRESH, EVENTS)
    expect(out[0].caption).toBe('well above usual')
    expect(out[0].caption).not.toMatch(/\d/)
  })
  it("flies to the centroid of the neighborhood's events, and counts them", () => {
    const out = selectHotspots([anomaly('Mission', '911-realtime', 2.0)], ALL_FRESH, EVENTS)
    expect(out[0].lng).toBeCloseTo(-122.41, 5)
    expect(out[0].lat).toBeCloseTo(37.75, 5)
    expect(out[0].count).toBe(2)
  })
  it('a stale stream contributes nothing (freshness gate, as the Pulse)', () => {
    const stale: FreshnessMap = { ...ALL_FRESH, '311-cases': fresh(48 * 3_600_000) }
    const out = selectHotspots([
      anomaly('Mission', '311-cases', 3.0),                 // stale — dropped
      anomaly('Tenderloin', '911-realtime', 1.6),
    ], stale, EVENTS)
    expect(out.map((h) => h.neighborhood)).toEqual(['Tenderloin'])
    const unknown: FreshnessMap = { ...ALL_FRESH, '311-cases': fresh(null) }
    expect(selectHotspots([anomaly('Mission', '311-cases', 3.0)], unknown, EVENTS)).toEqual([])
  })
  it('a quiet reading never surfaces', () => {
    expect(selectHotspots([anomaly('Mission', '911-realtime', -3.0)], ALL_FRESH, EVENTS)).toEqual([])
  })
  it('a neighborhood with no located events is skipped (nothing to fly to)', () => {
    expect(selectHotspots([anomaly('Presidio', '911-realtime', 3.0)], ALL_FRESH, EVENTS)).toEqual([])
  })
  it('caps at four and ignores pre-combined rows', () => {
    const many = ['Mission', 'Tenderloin', 'Sunset/Parkside', 'Presidio', 'Marina'].map((n) => anomaly(n, '911-realtime', 2.0))
    const events = ['Mission', 'Tenderloin', 'Sunset/Parkside', 'Presidio', 'Marina'].map((n, i) => ev(String(i), n, -122.4, 37.7))
    const out = selectHotspots([...many, anomaly('Mission', 'combined', 9)], ALL_FRESH, events)
    expect(out).toHaveLength(HOTSPOT_LIMIT)
    expect(out[0].z).toBeCloseTo(2.0, 5)
  })
})
