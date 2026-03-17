// src/hooks/useCensusResolution.ts
// Listens to Mapbox zoom and returns the appropriate census resolution + data.

import { useState, useEffect } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import type { CensusData } from '../types/census'
import { useCensusData, loadBlockGroups } from './useCensusData'

type Resolution = 'neighborhood' | 'tract' | 'blockgroup'

interface CensusResolutionResult {
  resolution: Resolution
  censusData: CensusData[]
  boundaries: GeoJSON.FeatureCollection | null
  geoIdProperty: string
}

function getResolutionForZoom(zoom: number): Resolution {
  if (zoom < 12) return 'neighborhood'
  if (zoom < 14) return 'tract'
  return 'blockgroup'
}

export function useCensusResolution(
  map: MapboxMap | null,
  neighborhoodBoundaries: GeoJSON.FeatureCollection | null,
  tractBoundaries: GeoJSON.FeatureCollection | null,
  blockGroupBoundaries: GeoJSON.FeatureCollection | null,
): CensusResolutionResult {
  const [resolution, setResolution] = useState<Resolution>(() => {
    if (!map) return 'neighborhood'
    return getResolutionForZoom(map.getZoom())
  })

  const { neighborhoods, tracts, blockGroups } = useCensusData()

  // Listen to zoom events and update resolution
  useEffect(() => {
    if (!map) return

    // Set initial resolution from current zoom
    setResolution(getResolutionForZoom(map.getZoom()))

    const handleZoom = () => {
      setResolution(getResolutionForZoom(map.getZoom()))
    }

    map.on('zoom', handleZoom)
    return () => {
      map.off('zoom', handleZoom)
    }
  }, [map])

  // Lazy-load block groups when resolution reaches blockgroup level
  useEffect(() => {
    if (resolution === 'blockgroup') {
      // loadBlockGroups() is idempotent — module-level flag prevents re-importing
      loadBlockGroups().catch((err) => {
        console.warn('[useCensusResolution] Failed to load block groups:', err)
      })
    }
  }, [resolution])

  // Return the data + boundaries + geoIdProperty appropriate for the current resolution
  switch (resolution) {
    case 'neighborhood':
      return {
        resolution,
        censusData: neighborhoods as CensusData[],
        boundaries: neighborhoodBoundaries,
        // Neighborhood boundary GeoJSON uses 'nhood' property (e.g., "Tenderloin")
        // CensusData uses geoId === name for neighborhoods, so name-matching applies
        geoIdProperty: 'nhood',
      }
    case 'tract':
      return {
        resolution,
        censusData: tracts,
        boundaries: tractBoundaries,
        // Tract GeoJSON uses GEOID (11-digit, e.g., "06075010100")
        geoIdProperty: 'GEOID',
      }
    case 'blockgroup':
      return {
        resolution,
        censusData: blockGroups,
        boundaries: blockGroupBoundaries,
        // Block group GeoJSON uses GEOID (12-digit)
        geoIdProperty: 'GEOID',
      }
  }
}
