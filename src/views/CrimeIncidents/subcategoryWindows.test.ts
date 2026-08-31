import { describe, it, expect } from 'vitest'
import { resolveMoverWindows, foldSidebarCounts } from './subcategoryWindows'

const range = { start: '2025-08-01', end: '2026-08-01' }

describe('the lag clamp', () => {
  it('clamps the current window to the data’s real last day', () => {
    // SFPD publishes days behind. An unclamped current window is SHORT while
    // the prior window is full, which fabricates a decline on every bucket at
    // once — the single most likely way this feature ships a confident lie.
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, '2026-07-28')
    expect(w!.current.end).toBe('2026-07-28')
  })

  it('leaves the end alone when the data reaches it', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, '2026-08-05')
    expect(w!.current.end).toBe('2026-08-01')
  })

  it('shifts the comparison by the CLAMPED length, not the requested one', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: 'prev' }, '2026-07-28')
    const days = (a: string, b: string) =>
      (Date.parse(b) - Date.parse(a)) / 86_400_000
    expect(days(w!.comparison.start, w!.comparison.end))
      .toBe(days(w!.current.start, w!.current.end))
  })

  it('survives a null latestDate by not clamping', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, null)
    expect(w!.current.end).toBe('2026-08-01')
  })
})

describe('compare off', () => {
  it('falls back to the immediately preceding window of equal length', () => {
    const w = resolveMoverWindows(range, null, null)
    expect(w!.comparison.end).toBe('2025-07-31')
    expect(w!.label).toMatch(/^vs the previous \d+ days$/)
  })

  it('labels a resolved compare window with concrete dates', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, null)
    expect(w!.label).toMatch(/^vs /)
    expect(w!.label).not.toMatch(/previous/)
  })
})

describe('degenerate ranges', () => {
  it('returns null when the clamp empties the window', () => {
    // latestDate before the range start: there is no current window at all.
    expect(resolveMoverWindows(range, null, '2025-01-01')).toBeNull()
  })
})

describe('foldSidebarCounts', () => {
  const CANONICAL = 'Larceny Theft|Larceny - From Vehicle' // "Car break-ins"
  const MERGED = 'Larceny Theft|Theft From Vehicle'

  it('folds the merged-away row into its canonical row when both are present', () => {
    const counts = new Map([[CANONICAL, 4166], [MERGED, 894]])
    const rows = foldSidebarCounts(counts)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe(CANONICAL)
    expect(rows[0].count).toBe(5060)
    expect(rows[0].keys.sort()).toEqual([CANONICAL, MERGED].sort())
  })

  it('keeps the merged-away row standing on its own when the canonical target is absent — a narrow slice (one neighborhood, a short range) can carry one string and not the other', () => {
    const counts = new Map([[MERGED, 12]])
    const rows = foldSidebarCounts(counts)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe(MERGED)
    expect(rows[0].count).toBe(12)
    expect(rows[0].keys).toEqual([MERGED])
  })
})
