import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import {
  sfHour,
  clockText,
  summarize,
  busiestBuckets,
  bucketByTimeOfDay,
  radiusLabelText,
} from './digestSummary'

// receivedAt must be a real epoch so the SF-timezone math is exercised.
function ev(p: Partial<NormalizedEvent> & { receivedAt: number }): NormalizedEvent {
  return {
    id: `911-realtime:${p.receivedAt}`,
    datasetId: '911-realtime',
    timestamp: new Date(p.receivedAt).toISOString(),
    latitude: 37.7599,
    longitude: -122.4148,
    raw: {},
    ...p,
  }
}

describe('sfHour', () => {
  it('reads SF wall-clock hour in standard time (PST = UTC-8)', () => {
    // 2026-01-15 20:00 UTC = 12:00 PST
    expect(sfHour(Date.UTC(2026, 0, 15, 20, 0))).toBe(12)
  })
  it('reads SF wall-clock hour across DST (PDT = UTC-7)', () => {
    // 2026-07-15 20:00 UTC = 13:00 PDT — proves tz, not a fixed offset
    expect(sfHour(Date.UTC(2026, 6, 15, 20, 0))).toBe(13)
  })
})

describe('clockText', () => {
  it('formats AP-style SF local time', () => {
    expect(clockText(Date.UTC(2026, 0, 15, 20, 0))).toBe('12:00 p.m.')
    expect(clockText(Date.UTC(2026, 0, 15, 15, 5))).toBe('7:05 a.m.')
  })
})

describe('summarize', () => {
  it('totals, splits by stream, and counts significant', () => {
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 20), callType: 'Shooting' }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 21), callType: 'Medical' }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22), datasetId: 'fire-ems-dispatch', callType: 'Structure fire' }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 23), datasetId: '311-cases', callType: 'Graffiti' }),
    ]
    const s = summarize(events)
    expect(s.total).toBe(4)
    expect(s.byStream['911-realtime']).toBe(2)
    expect(s.byStream['fire-ems-dispatch']).toBe(1)
    expect(s.byStream['311-cases']).toBe(1)
    expect(s.significant).toBe(2) // shooting + structure fire (311 excluded)
  })
  it('reports a null busiestLabel for no events', () => {
    expect(summarize([]).busiestLabel).toBeNull()
  })
})

describe('busiestBuckets', () => {
  it('counts into 12 two-hour SF buckets and finds the peak window', () => {
    // three events at 14:xx PST (UTC 22:00) -> bucket 7 (14:00-15:59) = "2-3 p.m."
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22, 10) }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22, 30) }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22, 50) }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 17) }), // 9 a.m. PST -> bucket 4
    ]
    const b = busiestBuckets(events)
    expect(b).toHaveLength(12)
    expect(b[7]).toBe(3)
    expect(b[4]).toBe(1)
    expect(summarize(events).busiestLabel).toBe('2–3 p.m.')
  })
})

describe('bucketByTimeOfDay', () => {
  it('groups into ordered blocks, newest-first, omitting empties', () => {
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 17), callType: 'Medical' }),       //  9 a.m. -> morning
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22), callType: 'Traffic stop' }),   //  2 p.m. -> afternoon
      ev({ receivedAt: Date.UTC(2026, 0, 15, 23), callType: 'Shooting' }),       //  3 p.m. -> afternoon (sig)
    ]
    const blocks = bucketByTimeOfDay(events)
    expect(blocks.map((b) => b.key)).toEqual(['morning', 'afternoon'])
    const afternoon = blocks.find((b) => b.key === 'afternoon')!
    expect(afternoon.rows[0].clock).toBe('3:00 p.m.') // newest first
    expect(afternoon.rows[0].significant).toBe(true)
    expect(afternoon.rows[0].streamLabel).toBe('911 calls')
    expect(afternoon.rows[0].what).toBe('Shooting')
  })
})

describe('radiusLabelText', () => {
  it('renders the fraction vocabulary with a unit', () => {
    expect(radiusLabelText(0.125)).toBe('⅛ mi')
    expect(radiusLabelText(0.5)).toBe('½ mi')
    expect(radiusLabelText(2)).toBe('2 mi')
  })
})
