// src/lib/trees/equity.ts
// ZERO-IMPORT LEAF. Street trees against income and poverty, by TWO
// denominators (spec §10.2, Jesse's ruling Sept. 30, 2026: show both). Per
// resident punishes density; per land area does not. The lead sentence may
// state only what holds under both.

const R = 6_371_008.8
const RAD = Math.PI / 180

function ringAreaM2(ring: readonly number[][]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1]
    a += (x2 - x1) * RAD * (2 + Math.sin(y1 * RAD) + Math.sin(y2 * RAD))
  }
  return Math.abs((a * R * R) / 2)
}
const polyAreaM2 = (poly: readonly number[][][]): number =>
  ringAreaM2(poly[0]) - poly.slice(1).reduce((s, hole) => s + ringAreaM2(hole), 0)

export function featureAreaKm2(geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }): number {
  const m2 = geometry.type === 'Polygon'
    ? polyAreaM2(geometry.coordinates as number[][][])
    : (geometry.coordinates as number[][][][]).reduce((s, p) => s + polyAreaM2(p), 0)
  return m2 / 1e6
}

function ranks(v: readonly number[]): number[] {
  const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(v.length)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) out[order[k][1]] = avg
    i = j + 1
  }
  return out
}

export function spearman(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 3) return 0
  const rx = ranks(x.slice(0, n)), ry = ranks(y.slice(0, n))
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sx = 0, sy = 0
  for (let i = 0; i < n; i += 1) { sxy += (rx[i] - mx) * (ry[i] - my); sx += (rx[i] - mx) ** 2; sy += (ry[i] - my) ** 2 }
  return sx === 0 || sy === 0 ? 0 : sxy / Math.sqrt(sx * sy)
}

export type EquityFlag = 'park' | 'low-coverage' | 'park-heavy' | 'small-population' | null
/** Treasure Island: 7 rows in the whole inventory on Sept. 30, 2026. */
export const LOW_COVERAGE: ReadonlySet<string> = new Set(['Treasure Island'])
export const MIN_POPULATION = 2000

/**
 * Neighborhoods where large parks dominate the land, flagged by the editor's
 * ruling R20 (Jesse, Sept. 30, 2026) — an AUTHORED list, not a threshold rule.
 * Value = the measured open-space share of the neighborhood's land, percent:
 * Planning Department land-use parcels (`c5ge-t6pj`, `open_space = true`),
 * parcel area summed by neighborhood via parcel centroid, divided by the land
 * area of public/data/geo/sf-analysis-neighborhoods.geojson, measured Sept. 30,
 * 2026 (the next ranked neighborhood, Outer Richmond, is 14.6%). Their
 * residential streets deserve their own analysis (banked, spec §8).
 */
export const PARK_HEAVY: Readonly<Record<string, number>> = { Lakeshore: 61.2, 'Twin Peaks': 20.2 }

/** Precedence: park → low-coverage → park-heavy → small-population. */
export function equityFlag(name: string, population: number, parks: ReadonlySet<string>): EquityFlag {
  if (parks.has(name)) return 'park'
  if (LOW_COVERAGE.has(name)) return 'low-coverage'
  if (Object.prototype.hasOwnProperty.call(PARK_HEAVY, name)) return 'park-heavy'
  if (population < MIN_POPULATION) return 'small-population'
  return null
}

/** Census income / poverty are `null` when the ACS row lacks them — never 0. */
export interface EquityInput {
  name: string; trees: number; population: number; areaKm2: number
  medianIncome: number | null; povertyRate: number | null
}
interface EquityRowBase extends EquityInput { perK: number; perKm2: number }
/** An unflagged row always carries finite census figures — the type proves it. */
export interface UnflaggedEquityRow extends EquityRowBase { flag: null; medianIncome: number; povertyRate: number }
export interface FlaggedEquityRow extends EquityRowBase { flag: Exclude<EquityFlag, null> }
export type EquityRow = UnflaggedEquityRow | FlaggedEquityRow

const r1 = (n: number) => Math.round(n * 10) / 10
const finite = (n: number | null): n is number => n !== null && Number.isFinite(n)

/**
 * An unflagged neighborhood with no census income or poverty figure cannot be
 * compared, and is a data error rather than a flag: callers check first (the
 * generator's G2), and this throws if one gets through.
 */
export function equityRows(inputs: readonly EquityInput[], parks: ReadonlySet<string>): EquityRow[] {
  return inputs.map((i): EquityRow => {
    const perK = i.population > 0 ? r1((i.trees / i.population) * 1000) : 0
    const perKm2 = i.areaKm2 > 0 ? r1(i.trees / i.areaKm2) : 0
    const flag = equityFlag(i.name, i.population, parks)
    if (flag !== null) return { ...i, perK, perKm2, flag }
    const { medianIncome, povertyRate } = i
    if (!finite(medianIncome) || !finite(povertyRate)) {
      throw new Error(`equityRows: unflagged neighborhood ${i.name} has no census income or poverty figure`)
    }
    return { ...i, perK, perKm2, flag, medianIncome, povertyRate }
  })
}

export const isUnflagged = (r: EquityRow): r is UnflaggedEquityRow => r.flag === null

export interface EquityCorrelations { n: number; perK: { income: number; poverty: number }; perKm2: { income: number; poverty: number } }
const r2 = (n: number) => Math.round(n * 100) / 100

export function equityCorrelations(rows: readonly EquityRow[]): EquityCorrelations {
  const s = rows.filter(isUnflagged)
  const inc = s.map((r) => r.medianIncome), pov = s.map((r) => r.povertyRate)
  return {
    n: s.length,
    perK: { income: r2(spearman(s.map((r) => r.perK), inc)), poverty: r2(spearman(s.map((r) => r.perK), pov)) },
    perKm2: { income: r2(spearman(s.map((r) => r.perKm2), inc)), poverty: r2(spearman(s.map((r) => r.perKm2), pov)) },
  }
}

export type LinkStrength = 'strong' | 'weak' | 'none'
export function linkStrength(rho: number): LinkStrength {
  const a = Math.abs(rho)
  return a >= 0.5 ? 'strong' : a >= 0.3 ? 'weak' : 'none'
}

const TIER: Readonly<Record<LinkStrength, number>> = { none: 0, weak: 1, strong: 2 }

/** The rows robustLink reads: an aggregates row or an EquityRow both fit. */
export interface LinkRow {
  name: string
  flag: EquityFlag
  perK: number
  perKm2: number
  medianIncome: number | null
}

export interface RobustLink {
  /** Rank link of the measure against median income, all unflagged rows, unrounded. */
  rho: number
  /** The leave-one-out value with the smallest magnitude, unrounded (= rho when there are no rows). */
  weakest: number
  /** The neighborhood whose removal gives `weakest` (the first in row order
   *  on a tie); null only when there are no rows (with one row, it names that
   *  row and `weakest` is the empty set's 0). */
  without: string | null
  /** Every neighborhood whose removal ALONE lowers the full set's tier or
   *  flips its sign — the names the data note gives. Name order. */
  breakers: string[]
  /** The tier the lead may claim: linkStrength(weakest), never above the
   *  full set's own tier, and 'none' when any leave-one-out set flips sign. */
  strength: LinkStrength
}

/**
 * Ruling R18: the equity lead claims a link under a measure only if it
 * survives leaving out ANY ONE neighborhood. Over UNFLAGGED rows with a
 * finite income: the rank link on the full set and on every leave-one-out
 * set, all unrounded (rounding first let 0.299 pass as 0.30). A sign that
 * differs from the full set's in any leave-one-out set gives 'none'.
 */
export function robustLink(rows: readonly LinkRow[], measure: 'perK' | 'perKm2'): RobustLink {
  const s = rows.filter((r) => r.flag === null && finite(r.medianIncome))
  const xs = s.map((r) => r[measure]), ys = s.map((r) => r.medianIncome as number)
  const rho = spearman(xs, ys)
  let weakest = rho
  let without: string | null = null
  let flipped = false
  const breakers: string[] = []
  const fullTier = TIER[linkStrength(rho)]
  for (let i = 0; i < s.length; i += 1) {
    const v = spearman(xs.filter((_, j) => j !== i), ys.filter((_, j) => j !== i))
    const flips = Math.sign(v) !== Math.sign(rho)
    if (flips) flipped = true
    if (flips || TIER[linkStrength(v)] < fullTier) breakers.push(s[i].name)
    if (without === null || Math.abs(v) < Math.abs(weakest)) { weakest = v; without = s[i].name }
  }
  const tier = Math.min(TIER[linkStrength(rho)], TIER[linkStrength(weakest)])
  const strength: LinkStrength = flipped ? 'none' : tier === 2 ? 'strong' : tier === 1 ? 'weak' : 'none'
  return { rho, weakest, without, breakers: breakers.sort(), strength }
}
