// src/utils/polygonRadius.ts
// Which Analysis Neighborhoods does a pin's alert circle overlap?
// Exact for circle↔polygon: the circle intersects a polygon iff the center
// is inside it OR the min distance from the center to its boundary is ≤ the
// radius. Used by the digest email's "Neighborhood pulse" (api/_lib).
//
// Structural types on purpose (no GeoJSON.* ambient namespace) so the
// module typechecks in the api bundle without @types/geojson. The ray-cast
// deliberately mirrors pointInPolygon.ts rather than importing it — that
// module's GeoJSON.Geometry signature would drag the ambient namespace into
// the api typecheck; the algorithm is frozen.
// Runtime imports: none (pure). Holes (inner rings) are ignored, matching
// pointInPolygon.ts.

export interface BoundaryFeature {
  properties?: { nhood?: string } | null
  geometry: { type: string; coordinates: unknown }
}

export interface BoundaryCollection {
  features: BoundaryFeature[]
}

type Ring = number[][] // [lng, lat][]

// Local equirectangular projection scale. At SF's extent (≤2 mi radii) the
// error vs haversine is well under 1% — asserted by the unit test.
const MILES_PER_DEG_LAT = 69.0
const MILES_PER_DEG_LNG_EQUATOR = 69.17

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Min distance in miles from the pin to a ring's boundary segments, on a
 *  local equirectangular projection centered at the pin. */
function ringDistanceMiles(lng: number, lat: number, ring: Ring): number {
  const mx = Math.cos((lat * Math.PI) / 180) * MILES_PER_DEG_LNG_EQUATOR
  const my = MILES_PER_DEG_LAT
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lng) * mx
    const ay = (ring[j][1] - lat) * my
    const bx = (ring[i][0] - lng) * mx
    const by = (ring[i][1] - lat) * my
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq))
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

function outerRings(geometry: BoundaryFeature['geometry']): Ring[] {
  if (geometry.type === 'Polygon') return [(geometry.coordinates as Ring[])[0]]
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as Ring[][]).map((poly) => poly[0])
  return []
}

/** Names (properties.nhood) of every neighborhood whose polygon the pin's
 *  circle overlaps. Nameless features are skipped. */
export function neighborhoodsWithinRadius(
  lng: number,
  lat: number,
  radiusMiles: number,
  boundaries: BoundaryCollection,
): string[] {
  const out: string[] = []
  for (const f of boundaries.features) {
    const name = f.properties?.nhood
    if (!name) continue
    const hit = outerRings(f.geometry).some(
      (ring) =>
        ring != null &&
        ring.length >= 3 &&
        (pointInRing(lng, lat, ring) || ringDistanceMiles(lng, lat, ring) <= radiusMiles),
    )
    if (hit) out.push(name)
  }
  return out
}
