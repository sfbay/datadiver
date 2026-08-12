// src/hooks/useCensusData.ts
// Provides Census data at 3 resolution levels, per city. The neighborhood tier
// loads instantly from static JSON; tracts and block groups are lazy (see the
// loaders at the bottom). Optionally refreshes SF from the Census API in the
// background.

import { useState, useEffect, useRef } from 'react'
import type { CensusData, CensusDataResult, NeighborhoodCensusData } from '../types/census'
import { fetchSFTracts } from '../api/censusClient'
import { aggregateToNeighborhoods } from '../utils/censusAggregator'
import { useRouteView } from '../cities/useActiveCity'
import type { CityId } from '../cities/routing'

// Neighborhood rows are the ONLY tier every live consumer reads, and they are
// small (SF 33 KB + Oakland 10 KB), so they stay static — that is what keeps
// this file's promise of data on the first render with no loading state.
import neighborhoodData from '../data/census-neighborhoods.json'
import oaklandNeighborhoodData from '../data/census-oakland-neighborhoods.json'

// ---------------------------------------------------------------------------
// Per-city payload selection
//
// Every per-city table below is an EXHAUSTIVE Record<CityId, …> (the
// CITY_SELECTION_FIELDS idiom): a third city that forgets to register its
// payload is a compile error, not a silent fall-through that would serve San
// Francisco's rows under another city's name.
// ---------------------------------------------------------------------------

const NEIGHBORHOOD_JSON: Record<CityId, NeighborhoodCensusData[]> = {
  sf: neighborhoodData as NeighborhoodCensusData[],
  oakland: oaklandNeighborhoodData as NeighborhoodCensusData[],
}

// Tracts + block groups are lazy: 369 KB and 807 KB of JSON that NO live view
// reads (all 11 live callers destructure `neighborhoods` only; the sole
// `.tracts` reader is the consumer-less useCensusResolution). Shipping them in
// the shared census chunk taxed every map view in both cities for nothing.
// Literal import paths — Vite can only pre-bundle a static specifier.
const TRACT_JSON: Record<CityId, () => Promise<{ default: unknown }>> = {
  sf: () => import('../data/census-tracts.json'),
  oakland: () => import('../data/census-oakland-tracts.json'),
}

const BLOCK_GROUP_JSON: Record<CityId, () => Promise<{ default: unknown }>> = {
  sf: () => import('../data/census-blockgroups.json'),
  oakland: () => import('../data/census-oakland-blockgroups.json'),
}

/** The committed neighborhood-tier ACS payload for a city. Pure + synchronous —
 *  the app ships static JSON and never fetches census data at runtime.
 *
 *  SF's rows are keyed by the 41 Analysis Neighborhood NAMES; Oakland's are
 *  keyed by the 10 planning-region CODES ('C', 'NW', …) — a different
 *  geography from its 59 police beats, which is why area-keyed census
 *  affordances stand down there (see censusMatchesAreas in cities/registry).
 *
 *  Tracts and block groups are NOT here: they load on demand via loadTracts()
 *  / loadBlockGroups(), so this stays the one synchronous tier. */
export function selectCensusJson(cityId: CityId): {
  neighborhoods: NeighborhoodCensusData[]
} {
  return { neighborhoods: NEIGHBORHOOD_JSON[cityId] }
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
  tractsLoaded: boolean
  blockGroupsLoaded: boolean
}

const caches = new Map<CityId, CityCensusCache>()

function cacheFor(cityId: CityId): CityCensusCache {
  let cache = caches.get(cityId)
  if (!cache) {
    cache = {
      neighborhoods: selectCensusJson(cityId).neighborhoods,
      tracts: [],
      blockGroups: [],
      lastFetchTime: 0,
      isLiveData: false,
      tractsLoaded: false,
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
 * Returns the neighborhood tier immediately on first call — no loading state
 * for initial render. `tracts` and `blockGroups` start EMPTY and fill only
 * after loadTracts(cityId) / loadBlockGroups(cityId); no live view reads
 * either today. If VITE_CENSUS_API_KEY is set and the SF cache is stale
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

        // Update the SF cache. tractsLoaded is set so a later loadTracts()
        // cannot overwrite live rows with the committed JSON.
        sfCache.tracts = liveTracts
        sfCache.tractsLoaded = true
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
// Lazy finer-resolution loaders
//
// Neither tier is in any live view today. Both are one dynamic import per city
// per session; the per-city flag makes a repeat call free, and the cache they
// fill is the same one useCensusData reads, so a loaded tier is visible to the
// next render of any consumer.
// ---------------------------------------------------------------------------

/**
 * Lazy-load a city's tract data. Call before reading `tracts` off the hook —
 * it is `[]` until something asks. On SF, a completed live refresh wins: this
 * returns the live rows rather than re-reading the committed JSON.
 */
export async function loadTracts(cityId: CityId): Promise<CensusData[]> {
  const cache = cacheFor(cityId)
  if (cache.tractsLoaded) return cache.tracts

  const mod = await TRACT_JSON[cityId]()
  // A live refresh may have landed while the import was in flight — it is the
  // fresher source, so it keeps the slot.
  if (!cache.tractsLoaded) {
    cache.tracts = mod.default as CensusData[]
    cache.tractsLoaded = true
  }

  return cache.tracts
}

/**
 * Lazy-load a city's block group data. Call when user zooms to z14+.
 */
export async function loadBlockGroups(cityId: CityId): Promise<CensusData[]> {
  const cache = cacheFor(cityId)
  if (cache.blockGroupsLoaded) return cache.blockGroups

  const mod = await BLOCK_GROUP_JSON[cityId]()
  cache.blockGroups = mod.default as CensusData[]
  cache.blockGroupsLoaded = true

  return cache.blockGroups
}
