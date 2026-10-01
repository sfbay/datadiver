/**
 * Standing pins over the COMMITTED Trees snapshots (`public/data/trees/*.json`,
 * written by `scripts/build-trees.ts`). Reads the files from disk — never the
 * network. If a pin fails, the snapshot was regenerated against moved data:
 * re-pin HERE, update About's source notes and docs/data-insights.md in the
 * SAME commit (the failing pins ARE the checklist). Never hand-edit the JSON.
 *
 *   STRUCTURAL  the schema's invariants — hold at every regeneration.
 *   EXACT       the figures the view and its data notes cite, at asOf.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGGREGATES_PATH, DISAPPEARED_PATH, TREES_PATH } from '../../../scripts/build-trees'
import { SF_NEIGHBORHOODS } from '../../utils/geo'
import { PLACEABLE_FLOOR } from './fallReports'
import { classifyRow, parseSpecies } from './species'
import type { DisappearedLog, TreesAggregates, TreesSnapshot } from './types'

const read = <T,>(p: string) => JSON.parse(readFileSync(join(process.cwd(), p), 'utf8')) as T
const T = read<TreesSnapshot>(TREES_PATH)
const A = read<TreesAggregates>(AGGREGATES_PATH)
const D = read<DisappearedLog>(DISAPPEARED_PATH)

describe('trees snapshot — structural (hold at every regeneration)', () => {
  it('every column has one entry per site', () => {
    const n = T.id.length
    for (const k of ['x', 'y', 'sp', 'kind', 'cls', 'yr', 'nb', 'nt', 'fl'] as const) expect(T[k], k).toHaveLength(n)
    expect(new Set(T.id).size).toBe(n)
  })
  it('indexes resolve and codes are in range', () => {
    for (let i = 0; i < T.id.length; i += 1) {
      if (T.sp[i] < -1 || T.sp[i] >= T.species.length) throw new Error(`sp ${i}`)
      if (T.nb[i] < -1 || T.nb[i] >= T.neighborhoods.length) throw new Error(`nb ${i}`)
      if (T.kind[i] < 0 || T.kind[i] > 3 || T.cls[i] < 0 || T.cls[i] > 3) throw new Error(`code ${i}`)
      if ((T.x[i] === -1) !== (T.y[i] === -1)) throw new Error(`half a coordinate ${i}`)
    }
  })
  it('kind agrees with the classifier, string by string', () => {
    const KIND = ['tree', 'stump', 'site', 'shrub']
    for (let i = 0; i < T.id.length; i += 1) {
      const raw = T.sp[i] === -1 ? null : T.species[T.sp[i]]
      if (KIND[T.kind[i]] !== classifyRow(raw)) throw new Error(`site ${T.id[i]}: ${raw}`)
    }
  })
  it('mapped sites sit inside San Francisco', () => {
    for (let i = 0; i < T.id.length; i += 1) {
      if (T.x[i] === -1) continue
      const lon = T.x[i] / 1e5 - 123, lat = T.y[i] / 1e5 + 37
      if (!(lat > 37.6 && lat < 37.95 && lon > -122.6 && lon < -122.3)) throw new Error(`site ${T.id[i]} at ${lat},${lon}`)
    }
  })
  it('neighborhoods are the 41, in the app\'s order', () => {
    expect(T.neighborhoods).toEqual([...SF_NEIGHBORHOODS])
    expect(A.neighborhoods.map((n) => n.name)).toEqual([...SF_NEIGHBORHOODS])
  })
  it('totals add up', () => {
    const t = A.totals
    expect(t.trees + t.stumps + t.emptySites + t.shrubs).toBe(t.rows)
    expect(t.rows).toBe(T.id.length)
    expect(T.x.filter((v) => v === -1).length).toBe(t.unmapped)
  })
  it('ranked species are recorded, tree-only, verbatim and in count order', () => {
    expect(A.species.every((s) => parseSpecies(s.name).recorded && classifyRow(s.name) === 'tree')).toBe(true)
    for (let i = 1; i < A.species.length; i += 1) expect(A.species[i - 1].count).toBeGreaterThanOrEqual(A.species[i].count)
    expect(A.species[0].rank).toBe(1)
    expect(A.totals.topFive).toBe(A.species.slice(0, 5).reduce((s, x) => s + x.count, 0))
  })
  it('topFiveShare is the top five over ALL street trees (ruling R2)', () => {
    expect(A.totals.topFiveShare).toBe(Math.round((A.totals.topFive / A.totals.trees) * 1000) / 10)
  })
  it('notice arithmetic', () => {
    expect(A.notices.listed + A.notices.absent).toBe(A.notices.sites)
    expect(A.notices.replantedAfter).toBeLessThanOrEqual(A.notices.listed)
  })
  it('fall years run 2021 to the run year; only the last is partial', () => {
    const ys = A.falls.years
    expect(ys[0].year).toBe(2021)
    expect(ys[ys.length - 1].year).toBe(Number(T.asOf.slice(0, 4)))
    expect(ys.map((y) => y.partial)).toEqual(ys.map((_, i) => i === ys.length - 1))
  })
  it('every year\'s placeable flag agrees with its placed share and the floor (ruling R1)', () => {
    for (const y of A.falls.years) {
      const nonDup = y.fallen + y.aboutToFall
      const share = nonDup ? Math.round(((nonDup - y.unplaced) / nonDup) * 1000) / 10 : 100
      expect(y.placedShare, String(y.year)).toBe(share)
      expect(y.placeable, String(y.year)).toBe(y.placedShare >= PLACEABLE_FLOOR)
    }
  })
  it('the most recent full year is placeable (gate G3)', () => {
    const full = A.falls.years.filter((y) => !y.partial)
    expect(full[full.length - 1].placeable).toBe(true)
  })
  it('neighborhood fall rows cover exactly the placeable years, never more than the city placed', () => {
    const placeable = A.falls.years.filter((y) => y.placeable)
    for (const nh of A.neighborhoods) {
      expect(nh.falls.map((f) => f[0]), nh.name).toEqual(placeable.map((y) => y.year))
    }
    for (const y of placeable) {
      const fallen = A.neighborhoods.reduce((s, nh) => s + (nh.falls.find((f) => f[0] === y.year)?.[1] ?? 0), 0)
      const about = A.neighborhoods.reduce((s, nh) => s + (nh.falls.find((f) => f[0] === y.year)?.[2] ?? 0), 0)
      expect(fallen + about, String(y.year)).toBeLessThanOrEqual(y.fallen + y.aboutToFall - y.unplaced)
    }
  })
  it('equity figures cover the unflagged neighborhoods only', () => {
    expect(A.equity.n).toBe(A.neighborhoods.filter((n) => n.flag === null).length)
  })
  it('the disappeared log starts at the first snapshot', () => {
    expect(D.trackingSince <= T.asOf).toBe(true)
    for (const run of D.runs) expect(run.from < run.to).toBe(true)
  })
})

describe('trees snapshot — EXACT pins at asOf (re-pin + sourceNotes + data-insights in the same commit)', () => {
  it('pins', () => {
    expect(T.asOf).toBe('2026-09-30')
    expect(A.asOf).toBe('2026-09-30')
    expect(A.dataAsOf).toBe('2026-09-30')

    expect(A.totals).toEqual({
      rows: 144504,
      trees: 142321,
      stumps: 635,
      emptySites: 1483,
      shrubs: 65,
      unmapped: 5754,
      speciesNotRecorded: 2265,
      distinctSpecies: 648,
      topFive: 34899,
      topFiveShare: 24.5,
      largeTrunks: 8645,
      unmeasuredTrunks: 8935,
      plantedRecorded: 38083,
    })

    expect(A.species.length).toBe(648)
    expect(A.species.slice(0, 5).map((s) => [s.name, s.count])).toEqual([
      ['Platanus x hispanica :: Sycamore, London Plane', 8943],
      ['Lophostemon confertus :: Brisbane Box', 6973],
      ['Metrosideros excelsa :: New Zealand Xmas Tree', 6971],
      ['Tristaniopsis laurina :: Swamp Myrtle', 6430],
      ['Pittosporum undulatum :: Victorian Box', 5582],
    ])

    expect(A.notices.rows).toBe(5713)
    expect(A.notices.sites).toBe(5571)
    expect(A.notices.listed).toBe(4831)
    expect(A.notices.absent).toBe(740)
    expect(A.notices.replantedAfter).toBe(1022)
    expect(A.notices.unjoinable).toBe(3)
    expect(A.notices.byType).toEqual([
      ['Posted 15 Day', 2492],
      ['Posted 30 Day', 1867],
      ['Posted 24hr', 1354],
    ])

    expect(A.equity).toEqual({ n: 36, perK: { income: 0.66, poverty: -0.59 }, perKm2: { income: 0.34, poverty: -0.18 } })

    expect(A.falls.years).toEqual([
      { year: 2021, fallen: 1121, aboutToFall: 263, duplicates: 269, unplaced: 35, placedShare: 97.5, placeable: true, partial: false },
      { year: 2022, fallen: 621, aboutToFall: 192, duplicates: 128, unplaced: 437, placedShare: 46.2, placeable: false, partial: false },
      { year: 2023, fallen: 4390, aboutToFall: 436, duplicates: 1216, unplaced: 1561, placedShare: 67.7, placeable: false, partial: false },
      { year: 2024, fallen: 2474, aboutToFall: 540, duplicates: 568, unplaced: 250, placedShare: 91.7, placeable: true, partial: false },
      { year: 2025, fallen: 1592, aboutToFall: 752, duplicates: 376, unplaced: 0, placedShare: 100, placeable: true, partial: false },
      { year: 2026, fallen: 889, aboutToFall: 582, duplicates: 304, unplaced: 0, placedShare: 100, placeable: true, partial: true },
    ])
    expect(A.falls.years.map((y) => [y.year, y.placedShare, y.placeable])).toEqual([
      [2021, 97.5, true],
      [2022, 46.2, false],
      [2023, 67.7, false],
      [2024, 91.7, true],
      [2025, 100, true],
      [2026, 100, true],
    ])
    expect(A.falls.busiestDay).toEqual({ ymd: '2023-03-21', reports: 467 })

    const row = (name: string) => {
      const r = A.neighborhoods.find((n) => n.name === name)!
      return [r.name, r.trees, r.perK, r.perKm2]
    }
    expect(row('Tenderloin')).toEqual(['Tenderloin', 1676, 52.4, 1648])
    expect(row('Bayview Hunters Point')).toEqual(['Bayview Hunters Point', 9500, 238.6, 709.3])
    expect(row('Chinatown')).toEqual(['Chinatown', 664, 52.5, 1140.9])
    expect(row('Seacliff')).toEqual(['Seacliff', 1086, 448.9, 1971])

    expect(D).toEqual({ trackingSince: '2026-09-30', runs: [] })
  })
})
