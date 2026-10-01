// src/lib/trees/equity.test.ts
import { describe, expect, it } from 'vitest'
import { equityCorrelations, equityFlag, equityRows, featureAreaKm2, linkStrength, robustLink, spearman } from './equity'

const PARKS = new Set(['Golden Gate Park', 'McLaren Park', 'Lincoln Park', 'Presidio'])

describe('featureAreaKm2', () => {
  it('a 0.01° square at SF latitude is about 0.98 km²', () => {
    const sq = [[[-122.45, 37.75], [-122.44, 37.75], [-122.44, 37.76], [-122.45, 37.76], [-122.45, 37.75]]]
    expect(featureAreaKm2({ type: 'Polygon', coordinates: sq })).toBeCloseTo(0.978, 2)
  })
  it('holes subtract and MultiPolygon parts add', () => {
    const outer = [[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02], [0, 0]]
    const hole = [[0.005, 0.005], [0.015, 0.005], [0.015, 0.015], [0.005, 0.015], [0.005, 0.005]]
    const whole = featureAreaKm2({ type: 'Polygon', coordinates: [outer] })
    const holed = featureAreaKm2({ type: 'Polygon', coordinates: [outer, hole] })
    expect(holed).toBeCloseTo(whole * 0.75, 3)
    expect(featureAreaKm2({ type: 'MultiPolygon', coordinates: [[outer], [outer]] })).toBeCloseTo(whole * 2, 6)
  })
})

describe('spearman', () => {
  it('perfect and inverse orderings', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6)
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6)
  })
  it('ties take the average rank', () => {
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9487, 3)
  })
  it('fewer than three points or a flat series is 0, never NaN', () => {
    expect(spearman([1, 2], [2, 1])).toBe(0)
    expect(spearman([5, 5, 5], [1, 2, 3])).toBe(0)
  })
})

describe('equityFlag — shown, flagged, and left out of the lead sentence', () => {
  it('park land, the barely-covered island, and tiny populations', () => {
    expect(equityFlag('Presidio', 4000, PARKS)).toBe('park')
    expect(equityFlag('Treasure Island', 3000, PARKS)).toBe('low-coverage')
    expect(equityFlag('Seacliff', 1999, PARKS)).toBe('small-population')
    expect(equityFlag('Mission', 58000, PARKS)).toBeNull()
  })
})

describe('equityRows + equityCorrelations', () => {
  const inp = (name: string, trees: number, population: number, areaKm2: number, medianIncome: number, povertyRate: number) =>
    ({ name, trees, population, areaKm2, medianIncome, povertyRate })
  const rows = equityRows([
    inp('A', 1000, 10000, 2, 50000, 20), inp('B', 3000, 20000, 2, 90000, 12),
    inp('C', 5000, 20000, 4, 150000, 6), inp('D', 9000, 30000, 3, 200000, 4),
    inp('Presidio', 86, 4000, 6, 234000, 3),
  ], PARKS)
  it('computes both rates', () => {
    expect(rows[0]).toMatchObject({ name: 'A', perK: 100, perKm2: 500, flag: null })
  })
  it('flagged rows are returned but excluded from the correlations', () => {
    expect(rows.find((r) => r.name === 'Presidio')!.flag).toBe('park')
    const c = equityCorrelations(rows)
    expect(c.n).toBe(4)
    expect(c.perK.income).toBe(1)
    expect(c.perK.poverty).toBe(-1)
  })
  it('a flagged row may lack census figures; they stay null, never 0', () => {
    const [r] = equityRows([{ name: 'Presidio', trees: 86, population: 4000, areaKm2: 6, medianIncome: null, povertyRate: null }], PARKS)
    expect(r).toMatchObject({ flag: 'park', medianIncome: null, povertyRate: null })
  })
  it('an unflagged row with a census gap is refused, never ranked', () => {
    expect(() => equityRows([inp('A', 1000, 10000, 2, 50000, 20), { ...inp('B', 1, 9000, 1, 0, 0), medianIncome: null }], PARKS))
      .toThrow(/B has no census income or poverty/)
    expect(() => equityRows([{ ...inp('C', 1, 9000, 1, 80000, 0), povertyRate: Number.NaN }], PARKS)).toThrow(/C/)
  })
})

describe('robustLink — a link counts only if it survives leaving out any one neighborhood (R18)', () => {
  const mk = (xs: number[], ys: number[]) =>
    xs.map((x, i) => ({ name: String.fromCharCode(65 + i), flag: null, perK: x, perKm2: -x, medianIncome: ys[i] }))
  it('a clean ordering keeps its tier under every removal', () => {
    expect(robustLink(mk([1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]), 'perK')).toEqual({ rho: 1, weakest: 1, without: 'A', strength: 'strong' })
    // the measure is read by name: perKm2 runs the other way
    expect(robustLink(mk([1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]), 'perKm2')).toMatchObject({ rho: -1, strength: 'strong' })
  })
  it('one neighborhood carrying a weak link drops it to none, and is named', () => {
    const r = robustLink(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [5, 3, 8, 1, 9, 2, 7, 4, 6, 100]), 'perK')
    expect(r.rho).toBeCloseTo(0.3455, 4)
    expect(linkStrength(r.rho)).toBe('weak')
    expect(r.weakest).toBeCloseTo(0.1, 6)
    expect(r.without).toBe('J')
    expect(r.strength).toBe('none')
  })
  it('the tier is never above the full set’s own, and a sign flip gives none', () => {
    // full −0.40 (weak); leaving out the first row gives +0.50
    const r = robustLink(mk([1, 2, 3, 4], [88, 49, 44, 70]), 'perK')
    expect(r.rho).toBeCloseTo(-0.4, 6)
    expect(r.weakest).toBeCloseTo(0.5, 6)
    expect(r.strength).toBe('none')
  })
  it('a strong link that only weakens stays strong when every removal keeps it at 0.5 or more', () => {
    expect(robustLink(mk([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]), 'perK')).toMatchObject({ rho: 0.8, without: 'E', strength: 'strong' })
  })
  it('flagged rows and rows with no income are left out', () => {
    const base = mk([1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60])
    const withExtras = [
      ...base,
      { name: 'Presidio', flag: 'park' as const, perK: 99, perKm2: 99, medianIncome: 1 },
      { name: 'Gap', flag: null, perK: 0, perKm2: 0, medianIncome: null },
    ]
    expect(robustLink(withExtras, 'perK')).toEqual(robustLink(base, 'perK'))
  })
})

it('linkStrength tiers', () => {
  expect(linkStrength(0.65)).toBe('strong')
  expect(linkStrength(-0.58)).toBe('strong')
  expect(linkStrength(0.33)).toBe('weak')
  expect(linkStrength(-0.17)).toBe('none')
})
