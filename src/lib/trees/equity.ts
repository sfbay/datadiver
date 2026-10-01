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

export type EquityFlag = 'park' | 'low-coverage' | 'small-population' | null
/** Treasure Island: 7 rows in the whole inventory on Sept. 30, 2026. */
export const LOW_COVERAGE: ReadonlySet<string> = new Set(['Treasure Island'])
export const MIN_POPULATION = 2000

export function equityFlag(name: string, population: number, parks: ReadonlySet<string>): EquityFlag {
  if (parks.has(name)) return 'park'
  if (LOW_COVERAGE.has(name)) return 'low-coverage'
  if (population < MIN_POPULATION) return 'small-population'
  return null
}

export interface EquityInput { name: string; trees: number; population: number; areaKm2: number; medianIncome: number; povertyRate: number }
export interface EquityRow extends EquityInput { perK: number; perKm2: number; flag: EquityFlag }

const r1 = (n: number) => Math.round(n * 10) / 10

export function equityRows(inputs: readonly EquityInput[], parks: ReadonlySet<string>): EquityRow[] {
  return inputs.map((i) => ({
    ...i,
    perK: i.population > 0 ? r1((i.trees / i.population) * 1000) : 0,
    perKm2: i.areaKm2 > 0 ? r1(i.trees / i.areaKm2) : 0,
    flag: equityFlag(i.name, i.population, parks),
  }))
}

export interface EquityCorrelations { n: number; perK: { income: number; poverty: number }; perKm2: { income: number; poverty: number } }
const r2 = (n: number) => Math.round(n * 100) / 100

export function equityCorrelations(rows: readonly EquityRow[]): EquityCorrelations {
  const s = rows.filter((r) => r.flag === null)
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
