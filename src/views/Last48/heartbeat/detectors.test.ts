import { describe, it, expect } from 'vitest'
import { detectSignificantEvents } from './detectors'
import type { DetectorContext } from '@/types/heartbeat'
import type { NormalizedEvent } from '@/types/last48'

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
