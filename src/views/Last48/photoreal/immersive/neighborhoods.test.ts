// src/views/Last48/photoreal/immersive/neighborhoods.test.ts
import { describe, it, expect } from 'vitest'
import { NEIGHBORHOODS, NBHD_PITCH_MIN, NBHD_PITCH_MAX, NBHD_RANGE_MIN, NBHD_RANGE_MAX, matchesQuery, neighborhoodCounts } from './neighborhoods'
import type { NormalizedEvent } from '@/types/last48'
import { SF_BOUNDS } from '@/utils/geo'

describe('NEIGHBORHOODS (the navigator, 2026-09-23)', () => {
  it('lists all 41 Analysis Neighborhoods, alphabetised, no duplicates', () => {
    expect(NEIGHBORHOODS).toHaveLength(41)
    expect(new Set(NEIGHBORHOODS.map((n) => n.name)).size).toBe(41)
    const names = NEIGHBORHOODS.map((n) => n.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
  it('every camera target sits inside the city', () => {
    for (const n of NEIGHBORHOODS) {
      expect(n.lat, n.name).toBeGreaterThan(SF_BOUNDS.south)
      expect(n.lat, n.name).toBeLessThan(SF_BOUNDS.north)
      expect(n.lng, n.name).toBeGreaterThan(SF_BOUNDS.west)
      expect(n.lng, n.name).toBeLessThan(SF_BOUNDS.east)
    }
  })
  it('pitch, range and heading stay inside the immersive band', () => {
    for (const n of NEIGHBORHOODS) {
      expect(n.pitchDeg, n.name).toBeGreaterThanOrEqual(NBHD_PITCH_MIN)
      expect(n.pitchDeg, n.name).toBeLessThanOrEqual(NBHD_PITCH_MAX)
      expect(n.rangeM, n.name).toBeGreaterThanOrEqual(NBHD_RANGE_MIN)
      expect(n.rangeM, n.name).toBeLessThanOrEqual(NBHD_RANGE_MAX)
      expect(n.headingDeg, n.name).toBeGreaterThanOrEqual(0)
      expect(n.headingDeg, n.name).toBeLessThan(360)
    }
  })
})

describe('matchesQuery', () => {
  it('is case- and accent-insensitive, and an empty query matches everything', () => {
    expect(matchesQuery('Mission Bay', 'mission')).toBe(true)
    expect(matchesQuery('Café Society', 'cafe')).toBe(true)
    expect(matchesQuery('Nob Hill', '  ')).toBe(true)
    expect(matchesQuery('Nob Hill', 'marina')).toBe(false)
  })
})

describe('neighborhoodCounts (each stream in its own unit)', () => {
  const ev = (id: string, datasetId: NormalizedEvent['datasetId'], neighborhood: string | undefined, raw: Record<string, unknown> = {}) =>
    ({ id, datasetId, neighborhood, raw }) as unknown as NormalizedEvent
  it('counts Fire/EMS by call, not by dispatched unit', () => {
    const { counts } = neighborhoodCounts([
      ev('f1', 'fire-ems-dispatch', 'Mission', { call_number: '100' }),
      ev('f2', 'fire-ems-dispatch', 'Mission', { call_number: '100' }),
      ev('f3', 'fire-ems-dispatch', 'Mission', { call_number: '101' }),
      ev('p1', '911-realtime', 'Mission'),
      ev('c1', '311-cases', 'Mission'),
      ev('x', '311-cases', undefined),
    ], {})
    expect(counts.get('Mission')).toBe(4)
    expect(counts.size).toBe(1)
  })
  it('flags the counts as minimums when any stream is truncated', () => {
    expect(neighborhoodCounts([], { '311-cases': true }).floor).toBe(true)
    expect(neighborhoodCounts([], { '311-cases': false }).floor).toBe(false)
  })
})
