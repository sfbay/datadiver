// src/lib/trees/fallReports.ts
// ZERO-IMPORT LEAF. 311 "Tree Maintenance" fall reports (vw6y-z8j6). Spec
// §10.1.8. A report is a REPORT at an address or corner — never a tree.

export type FallKind = 'fallen' | 'about-to-fall'
export const NEARBY_METERS = 30
export const FALL_WINDOW_START = '2021-01-01'
export const FALL_WHERE =
  `service_name='Tree Maintenance' AND lower(service_details) in('fallen_tree','about_to_fall') AND requested_datetime >= '${FALL_WINDOW_START}'`

export function fallKind(serviceDetails: string | null | undefined): FallKind | null {
  const s = (serviceDetails ?? '').trim().toLowerCase()
  return s === 'fallen_tree' ? 'fallen' : s === 'about_to_fall' ? 'about-to-fall' : null
}

export function isCityDuplicate(statusNotes: string | null | undefined): boolean {
  return /duplicate/i.test(statusNotes ?? '')
}

/** SF bounding box. 2,161 of 13,508 reports since 2021 sit at 0,0. */
export function isPlaced(lat: string | number | null | undefined, lon: string | number | null | undefined): boolean {
  const a = Number(lat), o = Number(lon)
  return lat !== null && lat !== undefined && lon !== null && lon !== undefined &&
    a > 37.6 && a < 37.95 && o > -122.6 && o < -122.3
}

const CELL = 0.0005 // degrees: ~55 m north-south, ~44 m east-west at SF
export interface Grid { cells: Map<string, { lat: number; lon: number }[]> }
const cellOf = (lat: number, lon: number) => `${Math.floor(lat / CELL)}|${Math.floor(lon / CELL)}`

export function buildGrid(points: readonly { lat: number; lon: number }[]): Grid {
  const cells = new Map<string, { lat: number; lon: number }[]>()
  for (const p of points) {
    const k = cellOf(p.lat, p.lon)
    const list = cells.get(k)
    if (list) list.push(p); else cells.set(k, [p])
  }
  return { cells }
}

export function countWithin(grid: Grid, lat: number, lon: number, meters: number = NEARBY_METERS): number {
  const cy = Math.floor(lat / CELL), cx = Math.floor(lon / CELL)
  const mPerLat = 111_320, mPerLon = 111_320 * Math.cos(lat * Math.PI / 180)
  let n = 0
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    for (const p of grid.cells.get(`${cy + dy}|${cx + dx}`) ?? []) {
      const y = (p.lat - lat) * mPerLat, x = (p.lon - lon) * mPerLon
      if (x * x + y * y <= meters * meters) n += 1
    }
  }
  return n
}
