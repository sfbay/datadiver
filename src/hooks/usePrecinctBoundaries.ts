import { useState, useEffect } from 'react'

const PRECINCT_GEOJSON_URL = '/elections/geo/precincts.geojson'
const PRECINCT_NHOOD_MAP_URL = '/elections/geo/precinct_neighborhood_map.json'

let cachedPrecincts: GeoJSON.FeatureCollection | null = null
let cachedPrecinctMap: Record<string, string> | null = null

/** Fetches SF precinct boundary polygons (514 precincts). Module-cached. */
export function usePrecinctBoundaries(): {
  precincts: GeoJSON.FeatureCollection | null
  precinctToNeighborhood: Record<string, string> | null
  isLoading: boolean
} {
  const [precincts, setPrecincts] = useState<GeoJSON.FeatureCollection | null>(cachedPrecincts)
  const [precinctMap, setPrecinctMap] = useState<Record<string, string> | null>(cachedPrecinctMap)
  const [isLoading, setIsLoading] = useState(!cachedPrecincts || !cachedPrecinctMap)

  useEffect(() => {
    if (cachedPrecincts && cachedPrecinctMap) return

    let cancelled = false

    Promise.all([
      cachedPrecincts
        ? Promise.resolve(cachedPrecincts)
        : fetch(PRECINCT_GEOJSON_URL).then((r) => r.json()) as Promise<GeoJSON.FeatureCollection>,
      cachedPrecinctMap
        ? Promise.resolve(cachedPrecinctMap)
        : fetch(PRECINCT_NHOOD_MAP_URL).then((r) => r.json()) as Promise<Record<string, string>>,
    ])
      .then(([geo, map]) => {
        if (cancelled) return
        cachedPrecincts = geo
        cachedPrecinctMap = map
        setPrecincts(geo)
        setPrecinctMap(map)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { precincts, precinctToNeighborhood: precinctMap, isLoading }
}
