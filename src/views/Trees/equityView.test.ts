// src/views/Trees/equityView.test.ts
import { describe, expect, it } from 'vitest'
import type { NeighborhoodAggregate } from '@/lib/trees/types'
import { choroplethStops, rankNeighborhoods } from './equityView'
import { MOSS_RAMP, MOSS_RAMP_DARK, stopColor, unflaggedCount, unflaggedMedian, unflaggedRange } from './equityView'

const nb = (name: string, perK: number, perKm2: number, flag: NeighborhoodAggregate['flag'] = null): NeighborhoodAggregate =>
  ({ name, trees: 1, stumps: 0, largeTrunks: 0, population: 5000, areaKm2: 1, medianIncome: 1, povertyRate: 1, perK, perKm2, flag, falls: [] })
const rows = [nb('Tenderloin', 54, 1701), nb('Bayview Hunters Point', 243, 724), nb('Presidio', 23, 14, 'park'), nb('Seacliff', 452, 1983)]

describe('rankNeighborhoods — the order flips with the measure', () => {
  it('per resident', () => {
    expect(rankNeighborhoods(rows, 'perK').map((r) => [r.name, r.position])).toEqual([
      ['Seacliff', 1], ['Bayview Hunters Point', 2], ['Tenderloin', 3], ['Presidio', null],
    ])
  })
  it('per square kilometer', () => {
    expect(rankNeighborhoods(rows, 'perKm2').map((r) => r.name)).toEqual(['Seacliff', 'Tenderloin', 'Bayview Hunters Point', 'Presidio'])
  })
})

describe('choroplethStops', () => {
  it('five ascending steps from unflagged values only', () => {
    const stops = choroplethStops(rows, 'perK', false)
    expect(stops).toHaveLength(5)
    expect(stops[0][0]).toBe(54) // Presidio's 23 is flagged and ignored
    for (let i = 1; i < stops.length; i += 1) expect(stops[i][0]).toBeGreaterThanOrEqual(stops[i - 1][0])
  })
})

// ── beyond the brief's pins ─────────────────────────────────────────────────

describe('rankNeighborhoods — the other measure and the flagged tail', () => {
  it('each row carries its active figure and its rank under the OTHER measure', () => {
    const byK = rankNeighborhoods(rows, 'perK')
    expect(byK.map((r) => [r.name, r.value, r.otherPosition])).toEqual([
      ['Seacliff', 452, 1], ['Bayview Hunters Point', 243, 3], ['Tenderloin', 54, 2], ['Presidio', 23, null],
    ])
    const byArea = rankNeighborhoods(rows, 'perKm2')
    expect(byArea.map((r) => [r.name, r.position, r.otherPosition])).toEqual([
      ['Seacliff', 1, 1], ['Tenderloin', 2, 3], ['Bayview Hunters Point', 3, 2], ['Presidio', null, null],
    ])
  })
  it('ties share the lower position and sort by name; the next distinct value skips ahead', () => {
    const tied = [nb('Tenderloin', 51.8, 1), nb('Chinatown', 51.8, 2), nb('Noe Valley', 238.7, 3), nb('Lakeshore', 37.6, 4)]
    expect(rankNeighborhoods(tied, 'perK').map((r) => [r.name, r.position])).toEqual([
      ['Noe Valley', 1], ['Chinatown', 2], ['Tenderloin', 2], ['Lakeshore', 4],
    ])
  })
  it('flagged rows sit last in name order, however large their figure', () => {
    const r = [nb('Golden Gate Park', 1755.1, 19.3, 'park'), nb('Mission', 176.4, 1968.8), nb('Treasure Island', 2.5, 3, 'low-coverage'), nb('McLaren Park', 974.2, 94.7, 'park')]
    expect(rankNeighborhoods(r, 'perK').map((x) => [x.name, x.position])).toEqual([
      ['Mission', 1], ['Golden Gate Park', null], ['McLaren Park', null], ['Treasure Island', null],
    ])
  })
  it('does not mutate its input', () => {
    const copy = rows.map((r) => ({ ...r }))
    rankNeighborhoods(rows, 'perKm2')
    expect(rows).toEqual(copy)
  })
})

describe('choropleth colours', () => {
  it('light theme: the stops walk pale → deep, fewest first', () => {
    expect(choroplethStops(rows, 'perK', false).map((s) => s[1])).toEqual([...MOSS_RAMP])
    expect(MOSS_RAMP).toEqual(['#e6efd6', '#c9dba8', '#9bb37c', '#7a9954', '#4f6b33'])
  })
  it('dark theme: lightness reversed — fewest is the dim olive, most the brightest (R15)', () => {
    expect(choroplethStops(rows, 'perK', true).map((s) => s[1])).toEqual([...MOSS_RAMP_DARK])
    expect(MOSS_RAMP_DARK).toEqual(['#4f6b33', '#7a9954', '#9db87a', '#c9dba8', '#e6efd6'])
    // the thresholds do not depend on the theme, only the colours
    expect(choroplethStops(rows, 'perK', true).map((s) => s[0])).toEqual(choroplethStops(rows, 'perK', false).map((s) => s[0]))
    // the most-trees neighborhood takes the brightest dark step; the fewest the dimmest
    const dark = choroplethStops(rows, 'perK', true)
    expect(stopColor(452, dark)).toBe('#e6efd6')
    expect(stopColor(-1, dark)).toBe('#4f6b33') // below the first stop: the dimmest
    // over 36 values each step is used once, fewest → most = dim → bright
    const many = Array.from({ length: 36 }, (_, i) => nb(`N${String(i).padStart(2, '0')}`, i + 1, 100 - i))
    const s36 = choroplethStops(many, 'perK', true)
    expect([1, 8, 15, 22, 36].map((v) => stopColor(v, s36))).toEqual([...MOSS_RAMP_DARK])
  })
  it('quantile thresholds over 36 values sit at the 0/20/40/60/80% positions', () => {
    const many = Array.from({ length: 36 }, (_, i) => nb(`N${String(i).padStart(2, '0')}`, i + 1, 100 - i))
    expect(choroplethStops(many, 'perK', false).map((s) => s[0])).toEqual([1, 8, 15, 22, 29])
  })
  it('a value takes the colour of the highest stop at or below it', () => {
    const many = Array.from({ length: 36 }, (_, i) => nb(`N${String(i).padStart(2, '0')}`, i + 1, 100 - i))
    const s36 = choroplethStops(many, 'perK', false)
    expect([1, 7, 8, 21, 22, 36].map((v) => MOSS_RAMP.indexOf(stopColor(v, s36) as typeof MOSS_RAMP[number]))).toEqual([0, 0, 1, 2, 3, 4])
    const stops = choroplethStops(rows, 'perK', false)
    expect(stopColor(452, stops)).toBe(MOSS_RAMP[4])
    expect(stopColor(300, stops)).toBe(stopColor(243, stops))
    expect(stopColor(-1, stops)).toBe(MOSS_RAMP[0]) // below the first stop clamps to the lightest
  })
  it('no unflagged rows: no stops', () => {
    expect(choroplethStops([nb('Presidio', 23, 14, 'park')], 'perK', false)).toEqual([])
    expect(choroplethStops([nb('Presidio', 23, 14, 'park')], 'perK', true)).toEqual([])
  })
})

describe('citywide medians come from UNFLAGGED rows only', () => {
  it('odd count: the middle value; flagged rows ignored', () => {
    expect(unflaggedMedian(rows, 'perK')).toBe(243)
    expect(unflaggedMedian(rows, 'perKm2')).toBe(1701)
  })
  it('even count: the mean of the middle two', () => {
    const r = [...rows, nb('Mission', 176.4, 1968.8)]
    expect(unflaggedMedian(r, 'perK')).toBeCloseTo((176.4 + 243) / 2, 6)
  })
  it('a null census figure is skipped, never read as zero', () => {
    const r = [{ ...nb('A', 1, 1), medianIncome: 100 }, { ...nb('B', 1, 1), medianIncome: 300 }, { ...nb('C', 1, 1, 'park'), medianIncome: null }]
    expect(unflaggedMedian(r, 'medianIncome')).toBe(200)
    expect(unflaggedRange(r, 'medianIncome')).toEqual([100, 300])
  })
  it('nothing unflagged: null', () => {
    expect(unflaggedMedian([nb('Presidio', 23, 14, 'park')], 'perK')).toBeNull()
    expect(unflaggedRange([nb('Presidio', 23, 14, 'park')], 'medianIncome')).toBeNull()
  })
})

describe('unflaggedCount — the N in "among the N neighborhoods without a flag"', () => {
  it('counts the rows with no flag, whatever their figures', () => {
    expect(unflaggedCount(rows)).toBe(3)
    expect(unflaggedCount([nb('Presidio', 23, 14, 'park'), nb('Treasure Island', 2.5, 3, 'low-coverage')])).toBe(0)
    expect(unflaggedCount([])).toBe(0)
  })
})
