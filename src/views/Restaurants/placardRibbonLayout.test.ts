import { describe, expect, it } from 'vitest'
import {
  dayNumber,
  FEED_THINS,
  labelledSpan,
  labelWidth,
  MIN_PX_PER_YEAR,
  packRows,
  placeLabel,
  PUBLISHING_GAPS,
  RIBBON_START,
  ribbonScale,
  ribbonWidth,
  rowCount,
  yearTicks,
} from './placardRibbonLayout'
import { FEED_BREAK } from './inspectionFeed'

describe('dayNumber', () => {
  it('counts whole days from the digits (no timezone drift)', () => {
    expect(dayNumber('1970-01-01')).toBe(0)
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-28')).toBe(2) // leap year
    expect(dayNumber('2025-03-01') - dayNumber('2025-02-28')).toBe(1)
    expect(dayNumber('2024-10-09T00:00:00.000')).toBe(dayNumber('2024-10-09'))
  })
})

describe('ribbonScale', () => {
  const x = ribbonScale({ start: RIBBON_START, end: '2026-09-24', left: 2, right: 402 })

  it('maps the axis ends to the plotting edges', () => {
    expect(x(RIBBON_START)).toBe(2)
    expect(x('2026-09-24')).toBe(402)
  })

  it('is linear in days', () => {
    const mid = (dayNumber(RIBBON_START) + dayNumber('2026-09-24')) / 2
    const midDate = new Date(mid * 86_400_000).toISOString().slice(0, 10)
    expect(x(midDate)).toBeCloseTo(202, 0)
  })

  it('pins out-of-axis dates to the edges (a 2009 registration, the junk 2031 row)', () => {
    expect(x('2009-05-01')).toBe(2)
    expect(x('2031-05-16')).toBe(402)
  })

  it('never divides by zero on a degenerate axis', () => {
    const y = ribbonScale({ start: '2024-01-01', end: '2024-01-01', left: 0, right: 100 })
    expect(Number.isFinite(y('2024-01-01'))).toBe(true)
  })
})

describe('ribbonWidth', () => {
  it('uses the container when the axis fits at the minimum density', () => {
    expect(ribbonWidth(900, RIBBON_START, '2026-09-24')).toBe(900)
  })

  it('grows past a narrow container so a phone scrolls instead of squeezing', () => {
    const w = ribbonWidth(300, RIBBON_START, '2026-09-24')
    expect(w).toBeGreaterThan(300)
    // ~9.98 years × 40 px
    expect(w).toBe(Math.round(((dayNumber('2026-09-24') - dayNumber(RIBBON_START)) / 365.25) * MIN_PX_PER_YEAR))
  })
})

describe('yearTicks', () => {
  it('ticks every January 1 strictly after the start, through the end', () => {
    expect(yearTicks(RIBBON_START, '2026-09-24').map((t) => t.year)).toEqual([
      2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ])
    expect(yearTicks('2017-01-01', '2018-01-01').map((t) => t.date)).toEqual(['2018-01-01'])
  })
})

describe('publishing gaps + the feed tick', () => {
  it('are the measured edges between the three datasets', () => {
    // pyih-qa8i last 2019-11-28 → 5tti-66ds first 2020-03-09;
    // 5tti-66ds last 2023-08-03 → tvy3-wexg first 2024-01-02 (live, 2026-09-24).
    expect(PUBLISHING_GAPS).toEqual([
      { from: '2019-11-29', to: '2020-03-09' },
      { from: '2023-08-04', to: '2024-01-02' },
    ])
    for (const g of PUBLISHING_GAPS) {
      expect(g.from < g.to).toBe(true)
      expect(g.from > RIBBON_START).toBe(true)
    }
  })

  it('draws the feed tick at the July 2025 break', () => {
    expect(FEED_THINS).toBe(FEED_BREAK)
    expect(FEED_THINS).toBe('2025-07-01')
  })
})

describe('packRows', () => {
  it('keeps non-overlapping spans on one row', () => {
    expect(packRows([{ x0: 0, x1: 10 }, { x0: 20, x1: 30 }, { x0: 40, x1: 50 }])).toEqual([0, 0, 0])
  })

  it('moves an overlapping span to the next free row, honoring the gap', () => {
    const rows = packRows([{ x0: 0, x1: 50 }, { x0: 40, x1: 60 }, { x0: 51, x1: 70 }], 2)
    // 3rd starts at 51 — only 1px after the 1st ends, so the gap pushes it off row 0.
    expect(rows).toEqual([0, 1, 2])
    expect(packRows([{ x0: 0, x1: 50 }, { x0: 40, x1: 60 }, { x0: 52, x1: 70 }], 2)).toEqual([0, 1, 0])
  })

  it('returns rows in the ORIGINAL order, whatever order the spans arrive in', () => {
    expect(packRows([{ x0: 40, x1: 60 }, { x0: 0, x1: 50 }])).toEqual([1, 0])
  })

  it('caps rows and overlaps onto the row that frees up earliest', () => {
    const burst = [0, 1, 2, 3, 4].map((i) => ({ x0: i, x1: i + 10 }))
    const rows = packRows(burst, 1, 3)
    expect(rowCount(rows)).toBe(3)
    expect(rows.slice(0, 3)).toEqual([0, 1, 2])
    expect(rows[3]).toBe(0)
  })

  it('handles the empty case', () => {
    expect(packRows([])).toEqual([])
    expect(rowCount([])).toBe(0)
  })
})

describe('labels', () => {
  it('estimates width from characters and the live font size (Large Type grows it)', () => {
    expect(labelWidth('Katani Pizza', 10)).toBe(Math.ceil(12 * 10 * 0.52))
    expect(labelWidth('Katani Pizza', 11.8)).toBeGreaterThan(labelWidth('Katani Pizza', 10))
    expect(labelWidth('92', 8, 0.6)).toBe(Math.ceil(2 * 8 * 0.6))
  })

  it('keeps a label inside the SVG', () => {
    expect(placeLabel(10, 50, 400)).toBe(10)
    expect(placeLabel(380, 50, 400)).toBe(350)
    expect(placeLabel(10, 500, 400)).toBe(0)
  })

  it('a labelled span covers whichever is longer, bar or label', () => {
    expect(labelledSpan(10, 200, 40, 400)).toEqual({ x0: 10, x1: 200 })
    expect(labelledSpan(10, 13, 40, 400)).toEqual({ x0: 10, x1: 50 })
    // Near the right edge the label shifts left, and the span follows it.
    expect(labelledSpan(390, 393, 40, 400)).toEqual({ x0: 360, x1: 400 })
  })
})
