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
    expect(items[0].headline).toContain('Mission')
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
