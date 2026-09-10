import { describe, it, expect } from 'vitest'
import { chainTour } from './tourChain'
import type { NormalizedEvent } from '@/types/last48'

const ev = (id: string, receivedAt: number, lng: number, lat: number): NormalizedEvent =>
  ({ id, datasetId: '311-cases', timestamp: '', receivedAt, longitude: lng, latitude: lat, raw: {} })

describe('chainTour', () => {
  it('starts at the newest and walks nearest-neighbour, visiting each once', () => {
    const events = [
      ev('far-old', 1, -122.50, 37.70),
      ev('newest', 9, -122.40, 37.78),
      ev('near-newest', 5, -122.401, 37.781),
      ev('mid', 7, -122.45, 37.75),
    ]
    const order = chainTour(events)
    expect(order[0]).toBe('newest')
    expect(order[1]).toBe('near-newest')
    expect(order).toHaveLength(4)
    expect(new Set(order).size).toBe(4)
  })
  it('respects the pass limit and drops events without coordinates', () => {
    const events = [ev('a', 3, -122.4, 37.7), ev('b', 2, -122.41, 37.71), { ...ev('c', 9, 0, 0), longitude: undefined, latitude: undefined }]
    expect(chainTour(events, 1)).toEqual(['a'])
    expect(chainTour(events)).toEqual(['a', 'b'])
  })
  it('empty in, empty out', () => {
    expect(chainTour([])).toEqual([])
  })
})
