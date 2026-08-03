import { describe, it, expect } from 'vitest'
import { ERA_START_YEAR } from './eraStripMath'

describe('parseBuyoutYearCounts', () => {
  it('carries the disclosed split, clamped to count', async () => {
    const { parseBuyoutYearCounts } = await import('./eraStripMath')
    expect(parseBuyoutYearCounts([
      { yr: '2026', n: '180', with_amt: '103' },
      { n: '4645' } as never,                        // null-year row dropped
      { yr: '2015', n: '195', with_amt: '999' },     // clamp: disclosed ≤ count
      { yr: '2020', n: '334' },                      // missing with_amt → 0
    ])).toEqual([
      { year: 2015, count: 195, disclosed: 195 },
      { year: 2020, count: 334, disclosed: 0 },
      { year: 2026, count: 180, disclosed: 103 },
    ])
  })
})

describe('ERA_ANNOTATIONS detail', () => {
  it('every annotation carries a non-empty detail line', async () => {
    const { ERA_ANNOTATIONS } = await import('./eraStripMath')
    expect(ERA_ANNOTATIONS).toHaveLength(4)
    for (const a of ERA_ANNOTATIONS) expect(a.detail.length).toBeGreaterThan(10)
  })
})
