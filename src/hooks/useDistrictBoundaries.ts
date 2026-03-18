import { useState, useEffect } from 'react'

// Module-level cache — survives component remounts
let cachedDistricts: GeoJSON.FeatureCollection | null = null

const SFPD_DISTRICTS_URL = 'https://data.sfgov.org/api/geospatial/d4vc-q76h?method=export&type=GeoJSON&format=GeoJSON'

/**
 * Fetches SFPD district boundary polygons from data.sfgov.org.
 * Cached in module-level variable — fetched once per session.
 * Property: feature.properties.district uses UPPERCASE values (SOUTHERN, BAYVIEW, MISSION, etc.)
 * Consumers must handle case normalization when matching against title-case district names.
 * Note: No SFFD battalion GeoJSON exists — only police districts are fetched here.
 */
export function useDistrictBoundaries(): {
  districts: GeoJSON.FeatureCollection | null
  isLoading: boolean
  error: string | null
} {
  const [districts, setDistricts] = useState<GeoJSON.FeatureCollection | null>(cachedDistricts)
  const [isLoading, setIsLoading] = useState(!cachedDistricts)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedDistricts) return
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(SFPD_DISTRICTS_URL)
        if (!res.ok) throw new Error(`SFPD districts: ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        cachedDistricts = data
        setDistricts(cachedDistricts)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load boundary data')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { districts, isLoading, error }
}
