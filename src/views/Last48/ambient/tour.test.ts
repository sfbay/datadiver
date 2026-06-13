// src/views/Last48/ambient/tour.test.ts
import { describe, it, expect } from 'vitest'
import { buildPass, nextTourId, PASS_SIZE } from './tour'
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
