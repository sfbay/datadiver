import { useState, useEffect } from 'react'
import { useRouteView } from '@/cities/useActiveCity'
import { getCity, censusCoarseGeojsonPath } from '@/cities/registry'
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

export interface BoundariesResult {
  boundaries: GeoJSON.FeatureCollection | null
  isLoading: boolean
  error: string | null
}

/**
 * Analysis neighborhood boundary polygons for the active city — 41 features
 * for SF, one per neighborhood; Oakland's 59 police beats. Cached per asset
 * URL, so each city's polygons are fetched once per session.
 * `feature.properties.nhood` matches `analysis_neighborhood` in the 311 data.
 */
export function useNeighborhoodBoundaries(cityId?: CityId): BoundariesResult {
  const routeCity = useRouteView().cityId
  return useBoundariesAsset(getCity(cityId ?? routeCity).areas.geojsonPath)
}

/**
 * The COARSE CENSUS tier's polygons for a city — Oakland's 10 planning
 * regions, SF's 41 neighborhoods. Shares the URL-keyed cache with
 * useNeighborhoodBoundaries; on SF both hooks resolve the same asset and
 * therefore hand back the same cached object.
 *
 * Demographics must use this, never the areas hook: Oakland's ACS rows are
 * keyed by region code, and joining them onto the 59 beat polygons matches
 * nothing — a flat ramp Mapbox refuses to paint, with no error anywhere.
 */
export function useCensusCoarseBoundaries(cityId?: CityId): BoundariesResult {
  const routeCity = useRouteView().cityId
  return useBoundariesAsset(censusCoarseGeojsonPath(getCity(cityId ?? routeCity)))
}

/** One asset, one cache entry. Both public hooks are thin URL resolvers over
 *  this — keyed by URL rather than by city so the identity is the file.
 *  `url: null` means "don't fetch yet" (Round B §3's here card: the reader
 *  may never click, so the ~1 MB polygon file must not load at mount) — it
 *  stays idle with `boundaries: null`, `isLoading: false`, no request, and
 *  the SAME cache once a real URL does arrive, so a later click is instant
 *  if some other view already warmed it this session. Exported so a caller
 *  that wants to trigger the fetch on its own condition (rather than route)
 *  can call it directly instead of going through one of the two city hooks
 *  below. */
export function useBoundariesAsset(url: string | null): BoundariesResult {
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection | null>(
    url ? cachedByUrl.get(url) ?? null : null,
  )
  const [isLoading, setIsLoading] = useState(url ? !cachedByUrl.has(url) : false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    if (!url) { setBoundaries(null); setIsLoading(false); return }
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
