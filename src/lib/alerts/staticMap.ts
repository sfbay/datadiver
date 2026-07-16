// src/lib/alerts/staticMap.ts
// Pure builder for a Mapbox Static Images API URL — the digest email's map
// hero. No network: it only assembles a URL string, so Vitest tests it
// directly. Dependency-free (takes plain {lat,lng}) so it stays trivial to
// reuse from the future in-builder live preview.

const MAPBOX_STATIC_BASE = 'https://api.mapbox.com/styles/v1/mapbox'
// Defensive: well below Mapbox's ~8192-byte request-URL ceiling. Over this we
// drop the map entirely rather than risk a truncated request — the text part
// already carries every fact.
const URL_BUDGET = 7500

/** Google "Encoded Polyline Algorithm Format", precision 5 — the compact
 *  string Mapbox `path` overlays expect. */
export function encodePolyline(coords: Array<[number, number]>): string {
  let lastLat = 0
  let lastLng = 0
  let out = ''
  const encodeDelta = (delta: number): string => {
    let v = delta < 0 ? ~(delta << 1) : delta << 1
    let chunk = ''
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    return chunk + String.fromCharCode(v + 63)
  }
  for (const [lat, lng] of coords) {
    const latE5 = Math.round(lat * 1e5)
    const lngE5 = Math.round(lng * 1e5)
    out += encodeDelta(latE5 - lastLat)
    out += encodeDelta(lngE5 - lastLng)
    lastLat = latE5
    lastLng = lngE5
  }
  return out
}

/** A closed ring of `points`+1 vertices approximating a circle of
 *  `radiusMiles` around (lat,lng). Longitude degrees are scaled by cos(lat)
 *  so the ring is round on the map, not an ellipse. */
export function circleRing(
  lat: number,
  lng: number,
  radiusMiles: number,
  points = 32,
): Array<[number, number]> {
  const milesPerDegLat = 69.0
  const milesPerDegLng = 69.0 * Math.cos((lat * Math.PI) / 180)
  const dLat = radiusMiles / milesPerDegLat
  const dLng = radiusMiles / milesPerDegLng
  const ring: Array<[number, number]> = []
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI
    ring.push([lat + dLat * Math.sin(theta), lng + dLng * Math.cos(theta)])
  }
  return ring
}

export function circlePolyline(
  lat: number,
  lng: number,
  radiusMiles: number,
  points = 32,
): string {
  return encodePolyline(circleRing(lat, lng, radiusMiles, points))
}

export interface StaticMapDot {
  lat: number
  lng: number
}

export interface StaticMapOptions {
  center: { lat: number; lng: number }
  radiusMiles: number
  dots: StaticMapDot[]
  token: string
  style?: string
  width?: number
  height?: number
  maxDots?: number
  /** Camera pitch in degrees (0–60). The tilt is the email map's whole personality. */
  pitch?: number
}

/** Mapbox GL zoom at which a circle of `radiusMiles` around `lat` fills
 *  `fillFrac` of a `heightPx`-tall frame. 512px-tile zoom semantics:
 *  metersPerPixel = 78271.517 · cos(lat) / 2^zoom. Needed because a PITCHED
 *  static map can't use the API's `auto` positioning — pitch requires the
 *  explicit center/zoom form. Clamped to sane city zooms. */
export function zoomForRadius(
  radiusMiles: number,
  lat: number,
  heightPx = 280,
  fillFrac = 0.55,
): number {
  const diameterM = radiusMiles * 1609.344 * 2
  const targetMpp = diameterM / (fillFrac * heightPx)
  const z = Math.log2((78271.517 * Math.cos((lat * Math.PI) / 180)) / targetMpp)
  return Math.round(Math.min(15.5, Math.max(11.5, z)) * 100) / 100
}

/** Build the Mapbox Static Images URL, or null if it can't be built safely
 *  (no token, or the assembled URL would exceed the defensive length budget).
 *  Callers treat null as "omit the <img>; the text carries everything." */
export function buildStaticMapUrl(opts: StaticMapOptions): string | null {
  const { center, radiusMiles, dots, token } = opts
  if (!token) return null
  const style = opts.style ?? 'light-v11'
  const width = opts.width ?? 560
  const height = opts.height ?? 280
  const maxDots = opts.maxDots ?? 20
  const pitch = opts.pitch ?? 30
  const zoom = zoomForRadius(radiusMiles, center.lat, height)

  const ring = circlePolyline(center.lat, center.lng, radiusMiles)
  const ringOverlay = `path-2+963e30-0.9+963e30-0.12(${encodeURIComponent(ring)})`
  const homeOverlay = `pin-l+1e140d(${center.lng.toFixed(5)},${center.lat.toFixed(5)})`
  const dotOverlays = dots
    .slice(0, maxDots)
    .map((d) => `pin-s+963e30(${d.lng.toFixed(5)},${d.lat.toFixed(5)})`)
  const overlays = [ringOverlay, homeOverlay, ...dotOverlays].join(',')

  const url =
    `${MAPBOX_STATIC_BASE}/${style}/static/${overlays}/` +
    `${center.lng.toFixed(5)},${center.lat.toFixed(5)},${zoom},0,${pitch}/${width}x${height}@2x` +
    `?access_token=${token}`
  return url.length > URL_BUDGET ? null : url
}
