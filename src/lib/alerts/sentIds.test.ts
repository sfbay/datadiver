import { describe, it, expect } from 'vitest'
import { unseenEvents, nextSentIds, capReleasedPerStream, MAX_IDS_PER_STREAM, type SentIdMap } from './sentIds.js'
import type { AlertEvent } from './streams.js'

const DAY = 24 * 3600_000
const now = Date.parse('2026-07-16T12:00:00Z')

const crash = (id: string, ageDays: number): AlertEvent =>
  ({ id: `traffic-crashes:${id}`, datasetId: 'traffic-crashes', timestamp: '', receivedAt: now - ageDays * DAY, raw: {} }) as AlertEvent

describe('unseenEvents', () => {
  it('filters out already-sent ids, keeps the rest', () => {
    const sent: SentIdMap = { 'traffic-crashes': { 'traffic-crashes:a': now - 10 * DAY } }
    const events = [crash('a', 10), crash('b', 10)]
    expect(unseenEvents(sent, events).map((e) => e.id)).toEqual(['traffic-crashes:b'])
  })
  it('empty memory passes everything (new subscription)', () => {
    expect(unseenEvents({}, [crash('a', 1)])).toHaveLength(1)
  })
})

describe('capReleasedPerStream', () => {
  it('keeps the newest N per stream, other streams unaffected', () => {
    const events = [
      ...Array.from({ length: 30 }, (_, i) => crash(`c${i}`, i)),
      { id: 'business-openings:b1', datasetId: 'business-openings', timestamp: '', receivedAt: now - DAY, raw: {} } as AlertEvent,
    ]
    const capped = capReleasedPerStream(events, 25)
    const crashes = capped.filter((e) => e.datasetId === 'traffic-crashes')
    expect(crashes).toHaveLength(25)
    // newest survive: ages 0..24 kept, 25..29 dropped
    expect(Math.max(...crashes.map((e) => now - e.receivedAt))).toBe(24 * DAY)
    expect(capped.filter((e) => e.datasetId === 'business-openings')).toHaveLength(1)
  })
  it('is a no-op under the cap', () => {
    expect(capReleasedPerStream([crash('a', 1), crash('b', 2)], 25)).toHaveLength(2)
  })
})

describe('nextSentIds', () => {
  it('records matched released events keyed by id → event ms', () => {
    const next = nextSentIds({}, [crash('a', 5)], now)
    expect(next['traffic-crashes']!['traffic-crashes:a']).toBe(now - 5 * DAY)
  })
  it('preserves prior ids (merge, not replace)', () => {
    const sent: SentIdMap = { 'traffic-crashes': { 'traffic-crashes:old': now - 20 * DAY } }
    const next = nextSentIds(sent, [crash('new', 1)], now)
    expect(Object.keys(next['traffic-crashes']!)).toHaveLength(2)
  })
  it('ignores live-stream events (watermarks own those)', () => {
    const live = { id: '911-realtime:x', datasetId: '911-realtime', timestamp: '', receivedAt: now, raw: {} } as AlertEvent
    expect(nextSentIds({}, [live], now)).toEqual({})
  })
  it('prunes ids older than window + 30d grace', () => {
    // crashes window = 120d; 120 + 30 + 1 = older than the floor
    const sent: SentIdMap = { 'traffic-crashes': { 'traffic-crashes:ancient': now - 151 * DAY } }
    const next = nextSentIds(sent, [crash('fresh', 1)], now)
    expect(next['traffic-crashes']!['traffic-crashes:ancient']).toBeUndefined()
    expect(next['traffic-crashes']!['traffic-crashes:fresh']).toBeDefined()
  })
  it('hard-caps each stream at the newest MAX_IDS_PER_STREAM', () => {
    const matched = Array.from({ length: MAX_IDS_PER_STREAM + 25 }, (_, i) => crash(`m${i}`, (i % 90) / 24))
    const next = nextSentIds({}, matched, now)
    expect(Object.keys(next['traffic-crashes']!).length).toBeLessThanOrEqual(MAX_IDS_PER_STREAM)
  })
})
