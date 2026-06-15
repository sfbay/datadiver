import { describe, it, expect } from 'vitest'
import { rankHeartbeatItems, MAX_ITEMS, MAX_PATTERNS, quietFallback } from './rank'
import type { HeartbeatItem } from '@/types/heartbeat'

function hb(p: Partial<HeartbeatItem> & { score: number; id: string }): HeartbeatItem {
  return {
    headline: p.id, category: 'live', severity: 'neutral',
    source: { view: '/live', label: p.id },
    freshness: 'live', computedAt: new Date(0), priority: p.score,
    intent: { type: 'none' }, ...p,
  } as HeartbeatItem
}

describe('rankHeartbeatItems', () => {
  it('sorts by score descending and caps at MAX_ITEMS', () => {
    const items = Array.from({ length: MAX_ITEMS + 5 }, (_, i) =>
      hb({ id: `e${i}`, score: i, intent: { type: 'event', eventId: `e${i}` } }))
    const ranked = rankHeartbeatItems(items)
    expect(ranked).toHaveLength(MAX_ITEMS)
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })
  it('guarantees pattern slots even when events outscore them', () => {
    const events = Array.from({ length: MAX_ITEMS + 5 }, (_, i) =>
      hb({ id: `e${i}`, score: 100, intent: { type: 'event', eventId: `e${i}` } }))
    const pattern = hb({ id: 'surge', score: 1, intent: { type: 'neighborhood', neighborhood: 'Mission' } })
    const ranked = rankHeartbeatItems([...events, pattern])
    expect(ranked.some((i) => i.id === 'surge')).toBe(true)
  })
  it('caps patterns at MAX_PATTERNS so events stay the majority', () => {
    const patterns = Array.from({ length: 6 }, (_, i) =>
      hb({ id: `p${i}`, score: 90 - i, intent: { type: 'neighborhood', neighborhood: `N${i}` } }))
    const events = Array.from({ length: 6 }, (_, i) =>
      hb({ id: `ev${i}`, score: 50, intent: { type: 'event', eventId: `ev${i}` } }))
    const ranked = rankHeartbeatItems([...patterns, ...events])
    const patternCount = ranked.filter((i) => i.intent?.type !== 'event').length
    expect(patternCount).toBe(MAX_PATTERNS)
    expect(ranked.filter((i) => i.intent?.type === 'event').length).toBeGreaterThan(MAX_PATTERNS)
  })
})

describe('quietFallback', () => {
  it('builds a calm display-only item', () => {
    const f = quietFallback(0)
    expect(f.intent).toEqual({ type: 'none' })
    expect(f.headline).toMatch(/all quiet/i)
  })
})
