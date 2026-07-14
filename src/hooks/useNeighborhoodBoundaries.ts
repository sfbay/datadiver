import { useState, useEffect } from 'react'

/**
 * Same-origin. This used to fetch from a raw GitHub URL on a volunteer brigade
 * repo (sfbrigade/data-science-wg, unpinned `master`) at runtime — a single point
 * of failure for the twelve views that need these polygons, and the app's last
 * third-party origin after Google Fonts was removed for the same reasons.
 * Vendored by scripts/build-neighborhood-boundaries.py, which also dissolves the
 * source's 195 census-tract fragments into 41 neighborhoods (2065 KB → 979 KB).
 */
const GEOJSON_URL = '/data/geo/sf-analysis-neighborhoods.geojson'

let cachedBoundaries: GeoJSON.FeatureCollection | null = null

/**
 * SF Analysis Neighborhood boundary polygons — 41 features, one per neighborhood.
 * Cached in a module-level variable, so it is fetched once per session.
 * `feature.properties.nhood` matches `analysis_neighborhood` in the 311 data.
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
