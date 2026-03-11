/**
 * Ray-casting point-in-polygon test.
 * Returns true if [lng, lat] is inside the polygon ring.
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
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

/**
 * Test if a point is inside a GeoJSON Polygon or MultiPolygon geometry.
 */
function pointInGeometry(lng: number, lat: number, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInRing(lng, lat, geometry.coordinates[0])
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInRing(lng, lat, poly[0]))
  }
  return false
}

/**
 * Find the neighborhood name for a given coordinate.
 * Returns the `nhood` property from the matching feature, or 'Unknown'.
 */
export function findNeighborhood(
  lng: number,
  lat: number,
  boundaries: GeoJSON.FeatureCollection
): string {
  for (const feature of boundaries.features) {
    if (pointInGeometry(lng, lat, feature.geometry)) {
      return (feature.properties?.nhood as string) || 'Unknown'
    }
  }
  return 'Unknown'
}

/**
 * Batch-assign neighborhoods to an array of items with lat/lng.
 * Uses a simple cache to avoid re-testing duplicate coordinates.
 */
export function assignNeighborhoods<T extends { lat: number; lng: number }>(
  items: T[],
  boundaries: GeoJSON.FeatureCollection
): (T & { neighborhood: string })[] {
  const cache = new Map<string, string>()
  return items.map((item) => {
    const key = `${item.lng.toFixed(5)},${item.lat.toFixed(5)}`
    let neighborhood = cache.get(key)
    if (!neighborhood) {
      neighborhood = findNeighborhood(item.lng, item.lat, boundaries)
      cache.set(key, neighborhood)
    }
    return { ...item, neighborhood }
  })
}
