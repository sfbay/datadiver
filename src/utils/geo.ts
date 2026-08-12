/** Geographic utility functions */

/** SF_CENTER is the camera target / look-at point — the lat/lng that sits
 *  at the visual center of the map viewport on first render. Not the literal
 *  geographic centroid of San Francisco; chosen visually so the city frames
 *  nicely under the default pitch + bearing. SF_BOUNDS is the city's actual
 *  geographic extent (used for fit-to-city operations). */
export const SF_CENTER = { lat: 37.7377, lng: -122.4472 }
export const SF_BOUNDS = {
  north: 37.8324,
  south: 37.7065,
  east: -122.3279,
  west: -122.5168,
}
export const SF_DEFAULT_ZOOM = 12.11

/** Default 3D camera orientation for all maps. Pitch puts the camera at a
 *  moderate aerial angle so dot density reads well; the positive (clockwise)
 *  bearing aligns SF's NW-SE peninsula axis with the screen diagonal, fitting
 *  more of the city on screen with less wasted ocean in the corners. Users
 *  can still rotate/tilt freely after first render — these are only the
 *  initial values. Tuned visually via the `?debug=map` overlay in MapView. */
export const SF_DEFAULT_PITCH = 48
export const SF_DEFAULT_BEARING = 20.1

/** Per-view camera override for The Last 48 only. A steeper pitch + tighter
 *  zoom frames the event stream more cinematically than the site default,
 *  with a center nudged slightly west/south to sit the densest activity
 *  (Tenderloin/SoMa/Mission) in the upper canvas. Wired into sfCity's
 *  `camera.slots.live` (src/cities/sf/index.ts); Last48Map reads it via
 *  useActiveCity(), never from here. Every other view omits the camera prop
 *  and keeps the SF_DEFAULT_* values above. Tuned via ?debug=map. */
export const LAST48_CAMERA = {
  center: { lat: 37.7322, lng: -122.4603 },
  zoom: 12.55,
  pitch: 63,
  bearing: 27.3,
}

/** Extract lat/lng from a Socrata point field */
export function extractCoordinates(
  point: { type: string; coordinates: [number, number] } | null | undefined
): { lat: number; lng: number } | null {
  if (!point?.coordinates) return null
  const [lng, lat] = point.coordinates // GeoJSON is [lng, lat]
  if (!lat || !lng || lat === 0 || lng === 0) return null
  return { lat, lng }
}

/** Extract coordinates from separate lat/lng fields */
export function coordsFromFields(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined
): { lat: number; lng: number } | null {
  const la = typeof lat === 'string' ? parseFloat(lat) : lat
  const ln = typeof lng === 'string' ? parseFloat(lng) : lng
  if (!la || !ln || isNaN(la) || isNaN(ln)) return null
  return { lat: la, lng: ln }
}

/** SF Neighborhoods list (41 analysis neighborhoods) */
export const SF_NEIGHBORHOODS = [
  'Bayview Hunters Point', 'Bernal Heights', 'Castro/Upper Market',
  'Chinatown', 'Excelsior', 'Financial District/South Beach',
  'Glen Park', 'Golden Gate Park', 'Haight Ashbury', 'Hayes Valley',
  'Inner Richmond', 'Inner Sunset', 'Japantown', 'Lakeshore',
  'Lincoln Park', 'Lone Mountain/USF', 'Marina', 'McLaren Park',
  'Mission', 'Mission Bay', 'Nob Hill', 'Noe Valley', 'North Beach',
  'Oceanview/Merced/Ingleside', 'Outer Mission', 'Outer Richmond',
  'Pacific Heights', 'Portola', 'Potrero Hill', 'Presidio',
  'Presidio Heights', 'Russian Hill', 'Seacliff', 'South of Market',
  'Sunset/Parkside', 'Tenderloin', 'Treasure Island', 'Twin Peaks',
  'Visitacion Valley', 'West of Twin Peaks', 'Western Addition',
] as const

export type SFNeighborhood = (typeof SF_NEIGHBORHOODS)[number]

/** Non-residential areas (parks, military) — exclude from demographic rankings and profiles */
export const NON_RESIDENTIAL_NEIGHBORHOODS = new Set([
  'Golden Gate Park',
  'McLaren Park',
  'Lincoln Park',
  'Presidio',
])

/**
 * Signed-area (shoelace) centroid of a GeoJSON Polygon/MultiPolygon's LARGEST
 * outer ring, in degrees. Deliberately planar — over a single city's span the
 * projection error is far below the precision a Dorling circle needs, and the
 * circle is force-relaxed away from this seed anyway.
 *
 * Only the OUTER ring is read (holes cannot move a positioning seed enough to
 * matter), and for a MultiPolygon the largest part wins so an island never
 * drags the marker off the mainland.
 *
 * Returns null for geometry it cannot read: a missing/non-polygonal geometry,
 * a ring of fewer than three points, or a degenerate ring enclosing no area.
 */
export function featureCentroid(
  feature: GeoJSON.Feature,
): { lat: number; lng: number } | null {
  const geom = feature?.geometry
  if (!geom) return null

  let rings: GeoJSON.Position[][]
  if (geom.type === 'Polygon') {
    rings = geom.coordinates.length > 0 ? [geom.coordinates[0]] : []
  } else if (geom.type === 'MultiPolygon') {
    rings = geom.coordinates.map((p) => p[0]).filter(Boolean)
  } else {
    return null
  }

  let best: { lat: number; lng: number } | null = null
  let bestArea = 0
  for (const ring of rings) {
    const c = ringCentroid(ring)
    if (c && c.area > bestArea) {
      bestArea = c.area
      best = { lat: c.lat, lng: c.lng }
    }
  }
  return best
}

/** Shoelace centroid + absolute area of one ring. Tolerates an unclosed ring
 *  (the closing edge is implied by wrapping the index). */
function ringCentroid(
  ring: GeoJSON.Position[] | undefined,
): { lat: number; lng: number; area: number } | null {
  if (!ring || ring.length < 3) return null

  // Drop an explicit closing vertex — the wrap below supplies that edge.
  const pts =
    ring.length > 3 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring
  if (pts.length < 3) return null

  let twiceArea = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return null
    const cross = x0 * y1 - x1 * y0
    twiceArea += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }

  if (twiceArea === 0) return null
  const factor = 1 / (3 * twiceArea)
  return { lng: cx * factor, lat: cy * factor, area: Math.abs(twiceArea) / 2 }
}
