import { describe, it, expect } from 'vitest'
import { detectSignificantEvents, detectNeighborhoodSurge } from './detectors'
import type { DetectorContext } from '@/types/heartbeat'
import type { AnomalyResult, NormalizedEvent } from '@/types/last48'

const NOW = 100 * 3600_000

function ev(p: Partial<NormalizedEvent>): NormalizedEvent {
  return { id: 'e1', datasetId: '911-realtime', timestamp: '', receivedAt: NOW - 3600_000, raw: {}, ...p } as NormalizedEvent
}
function ctx(events: NormalizedEvent[]): DetectorContext {
  return { events, anomalies: [], now: NOW }
}

describe('detectSignificantEvents', () => {
  it('surfaces a priority-A 911 call', () => {
    const items = detectSignificantEvents(ctx([ev({ priority: 'A', callType: 'Suicide Attempt', neighborhood: 'Mission' })]))
    expect(items).toHaveLength(1)
    expect(items[0].intent).toEqual({ type: 'event', eventId: 'e1' })
    expect(items[0].headline).toBe('Suicide attempt')  // prominent "what"
    expect(items[0].detail).toContain('Mission')         // subdued context
  })
  it('surfaces a keyword hit even when not priority-A', () => {
    const items = detectSignificantEvents(ctx([ev({ priority: 'B', callType: 'Shooting', neighborhood: 'Outer Sunset' })]))
    expect(items).toHaveLength(1)
    expect(items[0].headline).toContain('Shooting')
  })
  it('ignores routine calls and all 311', () => {
    const items = detectSignificantEvents(ctx([
      ev({ priority: 'C', callType: 'Traffic Stop' }),
      ev({ datasetId: '311-cases', callType: 'Encampment' }),
    ]))
    expect(items).toHaveLength(0)
  })
  it('flags a brand-new significant event as breaking', () => {
    const items = detectSignificantEvents(ctx([ev({ priority: 'A', callType: 'Shooting', receivedAt: NOW - 30_000 })]))
    expect(items[0].breaking).toBe(true)
  })
})

function anom(p: Partial<AnomalyResult>): AnomalyResult {
  return { neighborhood: 'Mission', datasetId: '311-cases', count48h: 40, baselineMean: 20, baselineSd: 5, zScore: 4, ...p }
}

describe('detectNeighborhoodSurge', () => {
  it('surfaces a high-z, high-volume surge with plain-language copy', () => {
    const items = detectNeighborhoodSurge({ events: [], anomalies: [anom({})], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0].headline).toBe('311 reports in the Mission are running dramatically above normal today.')
    expect(items[0].intent).toEqual({ type: 'neighborhood', neighborhood: 'Mission' })
  })
  it('ignores below-threshold z and tiny-sample surges', () => {
    expect(detectNeighborhoodSurge({ events: [], anomalies: [anom({ zScore: 1.5 })], now: NOW })).toHaveLength(0)
    expect(detectNeighborhoodSurge({ events: [], anomalies: [anom({ count48h: 3 })], now: NOW })).toHaveLength(0)
  })
  it('caps at 3 surges, highest z first', () => {
    const many = [5, 4.5, 4, 3.5, 3].map((z, i) => anom({ neighborhood: `N${i}`, zScore: z }))
    const items = detectNeighborhoodSurge({ events: [], anomalies: many, now: NOW })
    expect(items).toHaveLength(3)
    expect(items[0].headline).toContain('N0')
  })
})

import { detectStreamRateSpike, detectRepeatedType, DETECTORS } from './detectors'

describe('detectStreamRateSpike', () => {
  it('fires when the recent (lag-anchored) rate exceeds the 48h average', () => {
    // 48h avg ~ low; cluster of recent events near the newest event time.
    const newest = NOW - 7 * 3600_000 // 911 publish floor ~7h
    const events: NormalizedEvent[] = []
    for (let i = 0; i < 20; i++) events.push(ev({ id: `r${i}`, receivedAt: newest - i * 6 * 60_000 })) // 20 in ~2h
    for (let i = 0; i < 10; i++) events.push(ev({ id: `o${i}`, receivedAt: newest - (10 + i) * 3600_000 })) // sparse older
    const items = detectStreamRateSpike({ events, anomalies: [], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0].headline).toBe('911 calls have been coming in faster than usual lately.')
    expect(items[0].intent).toEqual({ type: 'none' })
  })
  it('does not fire for a steady stream', () => {
    const events: NormalizedEvent[] = []
    for (let i = 0; i < 48; i++) events.push(ev({ id: `s${i}`, receivedAt: NOW - i * 3600_000 })) // ~1/hr flat
    expect(detectStreamRateSpike({ events, anomalies: [], now: NOW })).toHaveLength(0)
  })
})

describe('detectRepeatedType', () => {
  it('clusters 3+ of a significant category into one plain-language item', () => {
    const events = [0, 1, 2].map((i) => ev({ id: `s${i}`, callType: 'Shooting', neighborhood: 'Bayview' }))
    const items = detectRepeatedType({ events, anomalies: [], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0].headline).toBe('Three shootings reported across the city in the last 48 hours.')
    expect(items[0].intent).toEqual({ type: 'none' })
  })
  it('does not fire below the threshold', () => {
    const events = [0, 1].map((i) => ev({ id: `s${i}`, callType: 'Shooting' }))
    expect(detectRepeatedType({ events, anomalies: [], now: NOW })).toHaveLength(0)
  })
})

describe('DETECTORS registry', () => {
  it('contains all four detectors', () => {
    expect(DETECTORS).toHaveLength(4)
  })
})
