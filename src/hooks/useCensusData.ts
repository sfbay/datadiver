// src/hooks/useCensusData.ts
// Provides Census data at 3 resolution levels, per city.
// Loads instantly from static JSON; optionally refreshes from Census API in the background.

import { useState, useEffect, useRef } from 'react'
import type { CensusData, CensusDataResult, NeighborhoodCensusData } from '../types/census'
import { fetchSFTracts } from '../api/censusClient'
import { aggregateToNeighborhoods } from '../utils/censusAggregator'
import { useRouteView } from '../cities/useActiveCity'
import type { CityId } from '../cities/routing'

// Static imports for neighborhood + tract data — available on first render, no async needed.
// Both cities' payloads are small; keeping them static preserves the
// no-loading-state property this file promises.
import neighborhoodData from '../data/census-neighborhoods.json'
import tractData from '../data/census-tracts.json'
import oaklandNeighborhoodData from '../data/census-oakland-neighborhoods.json'
import oaklandTractData from '../data/census-oakland-tracts.json'

// ---------------------------------------------------------------------------
// Per-city payload selection
// ---------------------------------------------------------------------------

/** The committed ACS payload for a city. Pure + synchronous — the app ships
 *  static JSON and never fetches census data at runtime.
 *
 *  SF's rows are keyed by the 41 Analysis Neighborhood NAMES; Oakland's are
 *  keyed by the 10 planning-region CODES ('C', 'NW', …) — a different
 *  geography from its 59 police beats, which is why area-keyed census
 *  affordances stand down there (see censusMatchesAreas in cities/registry). */
export function selectCensusJson(cityId: CityId): {
  neighborhoods: NeighborhoodCensusData[]
  tracts: CensusData[]
} {
  return cityId === 'oakland'
    ? {
        neighborhoods: oaklandNeighborhoodData as NeighborhoodCensusData[],
        tracts: oaklandTractData as CensusData[],
      }
    : { neighborhoods: neighborhoodData as NeighborhoodCensusData[], tracts: tractData as CensusData[] }
}

// ---------------------------------------------------------------------------
// Module-level cache, PER CITY (like useNeighborhoodBoundaries, which keys by
// asset URL for the same reason). A single set of singletons would serve one
// city's rows to another after a cross-city navigation.
// ---------------------------------------------------------------------------

interface CityCensusCache {
  neighborhoods: NeighborhoodCensusData[]
  tracts: CensusData[]
  blockGroups: CensusData[]
  lastFetchTime: number
  isLiveData: boolean
  blockGroupsLoaded: boolean
}

const caches = new Map<CityId, CityCensusCache>()

function cacheFor(cityId: CityId): CityCensusCache {
  let cache = caches.get(cityId)
  if (!cache) {
    const { neighborhoods, tracts } = selectCensusJson(cityId)
    cache = {
      neighborhoods,
      tracts,
      blockGroups: [],
      lastFetchTime: 0,
      isLiveData: false,
      blockGroupsLoaded: false,
    }
    caches.set(cityId, cache)
  }
  return cache
}

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides Census data at 3 resolution levels for a city — the ROUTE's city by
 * default (same idiom as useNeighborhoodBoundaries), so the 11 zero-arg call
 * sites stay correct on both portals. Pass `cityId` only for a deliberate
 * cross-city read.
 *
 * Returns static JSON data immediately on first call — no loading state for
 * initial render. If VITE_CENSUS_API_KEY is set and the SF cache is stale
 * (>24hr), fetches live data from the Census API in the background and updates
 * the module-level cache on success.
 *
 * ⚠ DO NOT set VITE_CENSUS_API_KEY until the live path is fixed: the live
 * refresh re-aggregates through TRACT_MAPPINGS, which covers only 161 of 244
 * SF tracts — it silently REPLACES the correct committed JSONs (built from
 * complete data) with partial-coverage aggregates. Count variables like
 * renterHouseholds lose ~70% of their mass (July 2026, caught live when the
 * eviction-rate card read 5,216 per 1K). Fix = aggregate via DataSF's
 * official whole-tract assignment (sevw-6tgi) instead of the fractional
 * crosswalk, then re-enable.
 */
export function useCensusData(cityId?: CityId): CensusDataResult {
  const routeCity = useRouteView().cityId
  const city = cityId ?? routeCity
  const cache = cacheFor(city)

  // State counter used only to trigger re-renders when background fetch completes
  const [, setRefreshCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    // The live path re-aggregates through SF's PARTIAL 161/244-tract crosswalk
    // and silently replaces the correct committed JSONs (the July 2026
    // eviction-rate bug). It is already inert (VITE_CENSUS_API_KEY is unset
    // everywhere by standing rule); pinning it to SF keeps a second city out of
    // that blast radius if the key is ever set by accident.
    if (city !== 'sf') return

    const apiKey = import.meta.env.VITE_CENSUS_API_KEY as string | undefined
    if (!apiKey) return

    const sfCache = cacheFor('sf')
    const now = Date.now()
    const cacheStale = now - sfCache.lastFetchTime > CACHE_TTL

    if (!cacheStale && sfCache.isLiveData) return

    let cancelled = false

    const refresh = async () => {
      if (!mountedRef.current) return
      setIsLoading(true)

      try {
        const liveTracts = await fetchSFTracts()

        if (cancelled || !mountedRef.current) return

        const liveNeighborhoods = aggregateToNeighborhoods(liveTracts)

        // Update the SF cache
        sfCache.tracts = liveTracts
        sfCache.neighborhoods = liveNeighborhoods
        sfCache.lastFetchTime = Date.now()
        sfCache.isLiveData = true

        setRefreshCount((c) => c + 1)
      } catch (err) {
        if (!cancelled) {
          console.warn('[useCensusData] Background refresh failed; using static data.', err)
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsLoading(false)
        }
      }
    }

    refresh()

    return () => {
      cancelled = true
    }
  }, [city]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    neighborhoods: cache.neighborhoods,
    tracts: cache.tracts,
    blockGroups: cache.blockGroups,
    isLive: cache.isLiveData,
    isLoading,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Lazy block group loader
// ---------------------------------------------------------------------------

/**
 * Lazy-load a city's block group data. Call when user zooms to z14+.
 * Dynamic import of the census-blockgroups JSON — avoids inflating the initial
 * bundle. The per-city flag prevents re-importing on subsequent calls.
 */
export async function loadBlockGroups(cityId: CityId): Promise<CensusData[]> {
  const cache = cacheFor(cityId)
  if (cache.blockGroupsLoaded) return cache.blockGroups

  const mod = cityId === 'oakland'
    ? await import('../data/census-oakland-blockgroups.json')
    : await import('../data/census-blockgroups.json')
  cache.blockGroups = mod.default as CensusData[]
  cache.blockGroupsLoaded = true

  return cache.blockGroups
}
