// src/views/Last48/photoreal/immersive/pointInNeighborhood.ts
//
// Which SF Analysis Neighborhood a clicked point is in (Round B §3). A thin
// honest wrapper over the shared ray-cast: the shared helper answers
// 'Unknown' for the ocean, and a reading must not print that word as if it
// were a place — here it is null and the row is omitted.
import { findNeighborhood } from '@/utils/pointInPolygon'

export function pointInNeighborhood(lng: number, lat: number, boundaries: GeoJSON.FeatureCollection | null): string | null {
  if (!boundaries) return null
  const name = findNeighborhood(lng, lat, boundaries)
  return name === 'Unknown' ? null : name
}
