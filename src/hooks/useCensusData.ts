// src/hooks/useCensusData.ts
// Provides Census data at 3 resolution levels.
// Loads instantly from static JSON; optionally refreshes from Census API in the background.

import { useState, useEffect, useRef } from 'react'
import type { CensusData, CensusDataResult, NeighborhoodCensusData } from '../types/census'
import { fetchSFTracts } from '../api/censusClient'
import { aggregateToNeighborhoods } from '../utils/censusAggregator'

// Static imports for neighborhood + tract data — available on first render, no async needed
import neighborhoodData from '../data/census-neighborhoods.json'
import tractData from '../data/census-tracts.json'

// ---------------------------------------------------------------------------
// Module-level cache (like useNeighborhoodBoundaries)
// ---------------------------------------------------------------------------

let cachedNeighborhoods: NeighborhoodCensusData[] = neighborhoodData as NeighborhoodCensusData[]
let cachedTracts: CensusData[] = tractData as CensusData[]
let cachedBlockGroups: CensusData[] = []
let lastFetchTime = 0
let isLiveData = false
let blockGroupsLoaded = false

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides Census data at 3 resolution levels.
 * Returns static JSON data immediately on first call — no loading state for initial render.
 * If VITE_CENSUS_API_KEY is set and cache is stale (>24hr), fetches live data from the
 * Census API in the background and updates the module-level cache on success.
 */
export function useCensusData(): CensusDataResult {
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
    const apiKey = import.meta.env.VITE_CENSUS_API_KEY as string | undefined
    if (!apiKey) return

    const now = Date.now()
    const cacheStale = now - lastFetchTime > CACHE_TTL

    if (!cacheStale && isLiveData) return

    let cancelled = false

    const refresh = async () => {
      if (!mountedRef.current) return
      setIsLoading(true)

      try {
        const liveTracts = await fetchSFTracts()

        if (cancelled || !mountedRef.current) return

        const liveNeighborhoods = aggregateToNeighborhoods(liveTracts)

        // Update module-level cache
        cachedTracts = liveTracts
        cachedNeighborhoods = liveNeighborhoods
        lastFetchTime = Date.now()
        isLiveData = true

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    neighborhoods: cachedNeighborhoods,
    tracts: cachedTracts,
    blockGroups: cachedBlockGroups,
    isLive: isLiveData,
    isLoading,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Lazy block group loader
// ---------------------------------------------------------------------------

/**
 * Lazy-load block group data. Call when user zooms to z14+.
 * Dynamic import of census-blockgroups.json — avoids inflating the initial bundle.
 * Module-level flag prevents re-importing on subsequent calls.
 */
export async function loadBlockGroups(): Promise<CensusData[]> {
  if (blockGroupsLoaded) return cachedBlockGroups

  const mod = await import('../data/census-blockgroups.json')
  cachedBlockGroups = mod.default as CensusData[]
  blockGroupsLoaded = true

  return cachedBlockGroups
}
