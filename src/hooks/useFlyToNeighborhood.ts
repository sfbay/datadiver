/** Fly map to a selected neighborhood's centroid on initial load from URL param */

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

export function useFlyToNeighborhood(
  map: mapboxgl.Map | null,
  neighborhood: string | null,
  boundaries: GeoJSON.FeatureCollection | null,
) {
  const hasFired = useRef(false)

  useEffect(() => {
    if (!map || !neighborhood || !boundaries || hasFired.current) return

    const feature = boundaries.features.find(
      (f) => f.properties?.nhood === neighborhood
    )
    if (!feature) return

    // Compute bounding box of the polygon
    const coords: [number, number][] = []
    const extractCoords = (c: any): void => {
      if (typeof c[0] === 'number') coords.push(c as [number, number])
      else c.forEach(extractCoords)
    }
    extractCoords((feature.geometry as any).coordinates)

    if (coords.length === 0) return

    const lngs = coords.map((c) => c[0])
    const lats = coords.map((c) => c[1])
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 1200 }
    )

    hasFired.current = true
  }, [map, neighborhood, boundaries])

  // Reset when neighborhood changes so next selection triggers a fly-to
  useEffect(() => {
    hasFired.current = false
  }, [neighborhood])
}
