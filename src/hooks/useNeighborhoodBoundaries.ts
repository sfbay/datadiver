import { useState, useEffect } from 'react'

const GEOJSON_URL = 'https://raw.githubusercontent.com/sfbrigade/data-science-wg/master/projects-in-this-repo/SF_311_Data-Analysis/data/GeoJSON/city_analysis_neighbor.geojson'

let cachedBoundaries: GeoJSON.FeatureCollection | null = null

/**
 * Fetches SF Analysis Neighborhood boundary polygons (census tracts grouped by nhood).
 * 195 features, 41 unique neighborhoods. Cached in module-level variable — fetched once per session.
 * Property: feature.properties.nhood matches analysis_neighborhood from 311 data.
 */
export function useNeighborhoodBoundaries(): {
  boundaries: GeoJSON.FeatureCollection | null
  isLoading: boolean
  error: string | null
} {
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection | null>(cachedBoundaries)
  const [isLoading, setIsLoading] = useState(!cachedBoundaries)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedBoundaries) return

    let cancelled = false
    fetch(GEOJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: GeoJSON.FeatureCollection) => {
        if (cancelled) return
        cachedBoundaries = data
        setBoundaries(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { boundaries, isLoading, error }
}
