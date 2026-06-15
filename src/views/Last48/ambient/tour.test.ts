// src/views/Last48/ambient/tour.test.ts
import { describe, it, expect } from 'vitest'
import { buildPass, nextTourId, dueWaitMs, PASS_SIZE } from './tour'
import type { NormalizedEvent } from '@/types/last48'

function ev(p: { id: string; receivedAt: number; geo?: boolean }): NormalizedEvent {
  return {
    id: p.id,
    datasetId: '911-realtime',
    timestamp: new Date(p.receivedAt).toISOString(),
    receivedAt: p.receivedAt,
    ...(p.geo === false ? {} : { longitude: -122.4, latitude: 37.76 }),
  } as NormalizedEvent
}

describe('buildPass', () => {
  it('returns newest-first ids, capped at PASS_SIZE', () => {
    const events = Array.from({ length: PASS_SIZE + 10 }, (_, i) =>
      ev({ id: `e${i}`, receivedAt: i }))
    const pass = buildPass(events)
    expect(pass).toHaveLength(PASS_SIZE)
    expect(pass[0]).toBe(`e${PASS_SIZE + 9}`) // newest
    expect(pass[pass.length - 1]).toBe('e10')  // oldest in the pass
  })

  it('excludes events without coordinates', () => {
    const events = [
      ev({ id: 'geo', receivedAt: 2 }),
      ev({ id: 'nogeo', receivedAt: 3, geo: false }),
    ]
    expect(buildPass(events)).toEqual(['geo'])
  })

  it('returns empty for empty input', () => {
    expect(buildPass([])).toEqual([])
  })
})

describe('nextTourId', () => {
  const pass = ['a', 'b', 'c']

  it('starts at the first id when current is null', () => {
    expect(nextTourId(pass, null, new Set(pass))).toBe('a')
  })

  it('advances to the next id', () => {
    expect(nextTourId(pass, 'a', new Set(pass))).toBe('b')
  })

  it('skips ids evicted from the window', () => {
    expect(nextTourId(pass, 'a', new Set(['a', 'c']))).toBe('c')
  })

  it('returns null when the pass is exhausted', () => {
    expect(nextTourId(pass, 'c', new Set(pass))).toBeNull()
  })

  it('returns null when current id is unknown and nothing remains', () => {
    expect(nextTourId(pass, 'zzz', new Set(pass))).toBeNull()
  })

  it('returns null when all ids after current are evicted', () => {
    expect(nextTourId(pass, 'a', new Set(['a']))).toBeNull()
  })
})

describe('dueWaitMs (wall-clock gate)', () => {
  it('fires (0) exactly at the due time', () => {
    expect(dueWaitMs(1000, 1000)).toBe(0)
  })

  it('fires (0) when overdue — a late/throttled timer still advances once', () => {
    expect(dueWaitMs(1000, 1200)).toBe(0)
  })

  it('waits the remainder when a timer wakes early (coalesced burst on refocus)', () => {
    expect(dueWaitMs(1000, 700)).toBe(300)
  })

  it('absorbs sub-slop jitter — does not re-arm for a few stray ms', () => {
    expect(dueWaitMs(1000, 900, 200)).toBe(0)
  })

  it('a burst of early ticks all defer to the same remaining wait, never stacking advances', () => {
    // Five coalesced timers released at the same instant, all before due:
    // every one is told to wait the remainder, so zero advances happen now.
    const now = 600
    const waits = [0, 1, 2, 3, 4].map(() => dueWaitMs(1000, now))
    expect(waits.every((w) => w === 400)).toBe(true)
  })
})
