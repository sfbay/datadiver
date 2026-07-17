import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import {
  sfHour,
  clockText,
  summarize,
  busiestBuckets,
  bucketByDay,
  sfDayKey,
  sfDayLine,
  radiusLabelText,
  bucketReleased,
  sfMonthDay,
} from './digestSummary'
import type { AlertEvent } from './streams.js'

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

describe('bucketByDay', () => {
  // Reference "now" for tests that don't care about the late flag — well
  // after every fixture event so nothing here happens to sit exactly on a
  // day/late boundary by accident.
  const NOW = Date.UTC(2026, 0, 17, 0, 0)

  it('groups into ordered blocks, newest-first, omitting empties', () => {
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 17), callType: 'Medical' }),       //  9 a.m. -> morning
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22), callType: 'Traffic stop' }),   //  2 p.m. -> afternoon
      ev({ receivedAt: Date.UTC(2026, 0, 15, 23), callType: 'Shooting' }),       //  3 p.m. -> afternoon (sig)
    ]
    const groups = bucketByDay(events, NOW)
    expect(groups).toHaveLength(1)
    const blocks = groups[0].blocks
    expect(blocks.map((b) => b.key)).toEqual(['morning', 'afternoon'])
    const afternoon = blocks.find((b) => b.key === 'afternoon')!
    expect(afternoon.rows[0].clock).toBe('3:00 p.m.') // newest first
    expect(afternoon.rows[0].significant).toBe(true)
    expect(afternoon.rows[0].streamLabel).toBe('911') // compact label, not "911 calls"
    expect(afternoon.rows[0].what).toBe('Shooting')
  })

  it('uses the block address for row location, falling back to neighborhood', () => {
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22), callType: 'Assault', address: '19th St & Dolores St', neighborhood: 'Mission' }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 21), datasetId: '311-cases', callType: 'Graffiti', neighborhood: 'Mission' }), // no address
    ]
    const rows = bucketByDay(events, NOW).flatMap((g) => g.blocks).flatMap((b) => b.rows)
    expect(rows[0].location).toBe('19th St & Dolores St') // street wins over neighborhood
    expect(rows[0].streamLabel).toBe('911')
    expect(rows[1].location).toBe('Mission')              // neighborhood fallback
    expect(rows[1].streamLabel).toBe('311')
  })

  it('groups events on different SF days into separate DayGroups, newest day first', () => {
    const dayOne = Date.UTC(2026, 0, 15, 20) // SF Jan 15, noon PST
    const dayTwo = Date.UTC(2026, 0, 16, 20) // SF Jan 16, noon PST
    const events = [
      ev({ receivedAt: dayOne, callType: 'Graffiti', datasetId: '311-cases' }),
      ev({ receivedAt: dayTwo, callType: 'Shooting' }),
    ]
    const groups = bucketByDay(events, dayTwo)
    expect(groups).toHaveLength(2)
    expect(groups[0].dateKey).toBe(sfDayKey(dayTwo))
    expect(groups[0].dayLabel).toBe(sfDayLine(dayTwo).toUpperCase())
    expect(groups[1].dateKey).toBe(sfDayKey(dayOne))
    expect(groups[1].dayLabel).toBe(sfDayLine(dayOne).toUpperCase())
  })

  it('flags rows more than 24h old as late, fresh rows as not late', () => {
    const now = Date.UTC(2026, 0, 16, 20)
    const events = [
      ev({ receivedAt: now - 2 * 3600_000, callType: 'Fresh' }), // 2h old -> not late
      ev({ receivedAt: now - 30 * 3600_000, callType: 'Old', datasetId: 'fire-ems-dispatch' }), // 30h old -> late
    ]
    const rows = bucketByDay(events, now).flatMap((g) => g.blocks).flatMap((b) => b.rows)
    const fresh = rows.find((r) => r.what === 'Fresh')!
    const old = rows.find((r) => r.what === 'Old')!
    expect(fresh.late).toBe(false)
    expect(old.late).toBe(true)
  })

  it('carries a rangeLabel on every block', () => {
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 17), callType: 'Medical' }),     // morning
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22), callType: 'Traffic stop' }), // afternoon
    ]
    const blocks = bucketByDay(events, NOW).flatMap((g) => g.blocks)
    const morning = blocks.find((b) => b.key === 'morning')!
    const afternoon = blocks.find((b) => b.key === 'afternoon')!
    expect(morning.rangeLabel).toBe('6–11 a.m.')
    expect(afternoon.rangeLabel).toBe('noon–5 p.m.')
  })
})

describe('radiusLabelText', () => {
  it('renders the fraction vocabulary with a unit', () => {
    expect(radiusLabelText(0.125)).toBe('⅛ mi')
    expect(radiusLabelText(0.5)).toBe('½ mi')
    expect(radiusLabelText(2)).toBe('2 mi')
  })
})

describe('sfMonthDay', () => {
  it('AP month style: spelled Mar–Jul, abbreviated otherwise', () => {
    expect(sfMonthDay(Date.parse('2026-05-14T19:00:00Z'))).toBe('May 14')
    expect(sfMonthDay(Date.parse('2026-01-14T19:00:00Z'))).toBe('Jan. 14')
  })
})

describe('bucketReleased', () => {
  const now = Date.parse('2026-07-16T12:00:00Z')
  const DAY = 24 * 3600_000
  const crash = (id: string, ageDays: number): AlertEvent =>
    ({ id: `traffic-crashes:${id}`, datasetId: 'traffic-crashes', timestamp: '',
       receivedAt: now - ageDays * DAY, headline: 'Broadside crash — severe injury',
       address: 'Mission St & 16th St', raw: { collision_severity: 'Injury (Severe)' } }) as AlertEvent
  const biz = (id: string, ageDays: number): AlertEvent =>
    ({ id: `business-openings:${id}`, datasetId: 'business-openings', timestamp: '',
       receivedAt: now - ageDays * DAY, headline: 'New business — Blue Ramen',
       callType: 'Food services', address: '455 Valencia St', raw: {} }) as AlertEvent

  it('groups per released stream, rows newest event first', () => {
    const groups = bucketReleased([crash('a', 50), crash('b', 40), biz('c', 3)])
    expect(groups).toHaveLength(2)
    const crashes = groups.find((g) => g.streamId === 'traffic-crashes')!
    expect(crashes.rows.map((r) => r.id)).toEqual(['traffic-crashes:b', 'traffic-crashes:a'])
    expect(crashes.heading).toBe('crash reports')
    expect(crashes.note).toMatch(/batches/)
  })
  it('rows carry an event DATE label, significance, and sector parenthetical', () => {
    const [g] = bucketReleased([biz('c', 3)])
    expect(g.rows[0].dateLabel).toMatch(/^[A-Z]/) // "Jul 13" style
    expect(g.rows[0].what).toBe('New business — Blue Ramen (food services)')
    expect(g.rows[0].significant).toBe(false)
    const [c] = bucketReleased([crash('a', 50)])
    expect(c.rows[0].significant).toBe(true)
  })
  it('silently drops live events (they belong to bucketByDay)', () => {
    const live = { id: '911-realtime:x', datasetId: '911-realtime', timestamp: '', receivedAt: now, raw: {} } as AlertEvent
    expect(bucketReleased([live])).toHaveLength(0)
  })
})
