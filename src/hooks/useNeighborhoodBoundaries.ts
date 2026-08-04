import { useState, useEffect } from 'react'
import { useRouteView } from '@/cities/useActiveCity'
import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'

/**
 * Same-origin. This used to fetch from a raw GitHub URL on a volunteer brigade
 * repo (sfbrigade/data-science-wg, unpinned `master`) at runtime — a single point
 * of failure for the twelve views that need these polygons, and the app's last
 * third-party origin after Google Fonts was removed for the same reasons.
 * Vendored by scripts/build-neighborhood-boundaries.py, which also dissolves the
 * source's 195 census-tract fragments into 41 neighborhoods (2065 KB → 979 KB).
 */

// One entry per boundary asset. Keyed by URL, not city, so the identity is the
// file itself — a module singleton would serve one city's polygons to another
// after cross-city navigation.
const cachedByUrl = new Map<string, GeoJSON.FeatureCollection>()

/**
 * Analysis neighborhood boundary polygons for the active city — 41 features
 * for SF, one per neighborhood. Cached per asset URL, so each city's polygons
 * are fetched once per session. `feature.properties.nhood` matches
 * `analysis_neighborhood` in the 311 data.
 */
export function useNeighborhoodBoundaries(cityId?: CityId): {
  boundaries: GeoJSON.FeatureCollection | null
  isLoading: boolean
  error: string | null
} {
  const routeCity = useRouteView().cityId
  const url = getCity(cityId ?? routeCity).areas.geojsonPath
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection | null>(
    cachedByUrl.get(url) ?? null,
  )
  const [isLoading, setIsLoading] = useState(!cachedByUrl.has(url))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    const cached = cachedByUrl.get(url)
    if (cached) { setBoundaries(cached); setIsLoading(false); return }
    let cancelled = false
    setBoundaries(null)
    setIsLoading(true)
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: GeoJSON.FeatureCollection) => {
        if (cancelled) return
        cachedByUrl.set(url, data)
        setBoundaries(data)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [url])

  return { boundaries, isLoading, error }
}
