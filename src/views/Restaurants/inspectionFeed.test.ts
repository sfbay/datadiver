// src/views/Restaurants/inspectionFeed.test.ts
//
// The one contract that matters: neither card window can straddle the July
// 2025 feed break, on any day the page could be opened.

import { describe, it, expect } from 'vitest'
import {
  FEED_BREAK,
  FEED_START,
  BEFORE_WINDOW,
  DEFAULT_WINDOW,
  sinceWindow,
  feedWindow,
  parseFeedWindow,
  straddlesBreak,
  clampedEnd,
  isAfterBreak,
} from './inspectionFeed'

/** Every day from the break through 2030, as 'YYYY-MM-DD' (UTC integer math only). */
function everyDay(from: string, to: string): string[] {
  const out: string[] = []
  const [y, m, d] = from.split('-').map(Number)
  for (let t = Date.UTC(y, m - 1, d); ; t += 86_400_000) {
    const s = new Date(t).toISOString().slice(0, 10)
    if (s > to) break
    out.push(s)
  }
  return out
}

describe('inspectionFeed', () => {
  it('pins the break and the feed start', () => {
    expect(FEED_BREAK).toBe('2025-07-01')
    expect(FEED_START).toBe('2024-01-02')
    expect(DEFAULT_WINDOW).toBe('since')
  })

  it('before = July 2024 – June 2025, ending the day before the break', () => {
    expect(BEFORE_WINDOW).toEqual({ id: 'before', start: '2024-07-01', end: '2025-06-30' })
    expect(BEFORE_WINDOW.end < FEED_BREAK).toBe(true)
    expect(BEFORE_WINDOW.start >= FEED_START).toBe(true)
  })

  it('since at 2026-09-24 = [2025-09-01, 2026-08-31] (the spec figure)', () => {
    expect(sinceWindow('2026-09-24')).toEqual({ id: 'since', start: '2025-09-01', end: '2026-08-31' })
  })

  it('since floors at the break while fewer than 12 whole months have passed', () => {
    expect(sinceWindow('2026-03-10')).toEqual({ id: 'since', start: FEED_BREAK, end: '2026-02-28' })
    expect(sinceWindow('2028-03-01').end).toBe('2028-02-29') // leap year
    expect(sinceWindow('2027-01-15')).toEqual({ id: 'since', start: '2026-01-01', end: '2026-12-31' })
  })

  it('NEITHER window straddles the break on any day from the break through 2030', () => {
    expect(straddlesBreak(BEFORE_WINDOW)).toBe(false)
    for (const today of everyDay(FEED_BREAK, '2030-12-31')) {
      const w = sinceWindow(today)
      expect(straddlesBreak(w), today).toBe(false)
      expect(w.start >= FEED_BREAK, today).toBe(true)
      expect(w.start <= w.end, today).toBe(true)
      expect(straddlesBreak(feedWindow('before', today)), today).toBe(false)
    }
  })

  it('straddlesBreak detects a crossing window', () => {
    expect(straddlesBreak({ start: '2025-06-01', end: '2025-07-31' })).toBe(true)
    expect(straddlesBreak({ start: '2025-07-01', end: '2025-07-31' })).toBe(false)
    expect(straddlesBreak({ start: '2025-06-01', end: '2025-06-30' })).toBe(false)
  })

  it('clamps the query end to today and parses ?window=', () => {
    expect(clampedEnd({ end: '2026-08-31' }, '2026-09-24')).toBe('2026-08-31')
    expect(clampedEnd({ end: '2026-08-31' }, '2026-08-15')).toBe('2026-08-15')
    expect(parseFeedWindow('before')).toBe('before')
    expect(parseFeedWindow('since')).toBe('since')
    expect(parseFeedWindow('bogus')).toBe('since')
    expect(parseFeedWindow(null)).toBe('since')
    expect(isAfterBreak('2025-07-01T00:00:00.000')).toBe(true)
    expect(isAfterBreak('2025-06-30')).toBe(false)
  })
})
