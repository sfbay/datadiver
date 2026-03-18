// src/views/Demographics/useDemographicsData.ts
// Data transformation hook for the Demographics Explorer view.
// Follows existing pattern: useBusinessActivityData.ts, useTrafficSafetyData.ts

import { useMemo } from 'react'
import type { CensusVariable, NeighborhoodCensusData } from '../../types/census'
import { getVariableConfig, CENSUS_VARIABLES } from '../../utils/censusVariables'

// ---------------------------------------------------------------------------
// Approximate neighborhood centroids (lat, lng) for cartogram positioning
// Derived from SF Analysis Neighborhoods GeoJSON polygon centroids.
// ---------------------------------------------------------------------------
const NEIGHBORHOOD_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Bayview Hunters Point': { lat: 37.7286, lng: -122.3861 },
  'Bernal Heights': { lat: 37.7388, lng: -122.4155 },
  'Castro/Upper Market': { lat: 37.7609, lng: -122.4350 },
  'Chinatown': { lat: 37.7941, lng: -122.4078 },
  'Excelsior': { lat: 37.7251, lng: -122.4255 },
  'Financial District/South Beach': { lat: 37.7879, lng: -122.3934 },
  'Glen Park': { lat: 37.7340, lng: -122.4333 },
  'Golden Gate Park': { lat: 37.7694, lng: -122.4862 },
  'Haight Ashbury': { lat: 37.7692, lng: -122.4481 },
  'Hayes Valley': { lat: 37.7760, lng: -122.4239 },
  'Inner Richmond': { lat: 37.7789, lng: -122.4644 },
  'Inner Sunset': { lat: 37.7596, lng: -122.4648 },
  'Japantown': { lat: 37.7856, lng: -122.4297 },
  'Lakeshore': { lat: 37.7186, lng: -122.4865 },
  'Lincoln Park': { lat: 37.7849, lng: -122.5069 },
  'Lone Mountain/USF': { lat: 37.7774, lng: -122.4512 },
  'Marina': { lat: 37.8006, lng: -122.4362 },
  'McLaren Park': { lat: 37.7186, lng: -122.4180 },
  'Mission': { lat: 37.7599, lng: -122.4148 },
  'Mission Bay': { lat: 37.7677, lng: -122.3932 },
  'Nob Hill': { lat: 37.7930, lng: -122.4161 },
  'Noe Valley': { lat: 37.7502, lng: -122.4337 },
  'North Beach': { lat: 37.8007, lng: -122.4091 },
  'Oceanview/Merced/Ingleside': { lat: 37.7181, lng: -122.4559 },
  'Outer Mission': { lat: 37.7233, lng: -122.4433 },
  'Outer Richmond': { lat: 37.7790, lng: -122.4953 },
  'Pacific Heights': { lat: 37.7925, lng: -122.4367 },
  'Portola': { lat: 37.7246, lng: -122.4062 },
  'Potrero Hill': { lat: 37.7582, lng: -122.3929 },
  'Presidio': { lat: 37.7989, lng: -122.4662 },
  'Presidio Heights': { lat: 37.7879, lng: -122.4513 },
  'Russian Hill': { lat: 37.8011, lng: -122.4194 },
  'Seacliff': { lat: 37.7873, lng: -122.4924 },
  'South of Market': { lat: 37.7785, lng: -122.4006 },
  'Sunset/Parkside': { lat: 37.7531, lng: -122.4938 },
  'Tenderloin': { lat: 37.7838, lng: -122.4130 },
  'Treasure Island': { lat: 37.8235, lng: -122.3707 },
  'Twin Peaks': { lat: 37.7544, lng: -122.4477 },
  'Visitacion Valley': { lat: 37.7137, lng: -122.4033 },
  'West of Twin Peaks': { lat: 37.7383, lng: -122.4574 },
  'Western Addition': { lat: 37.7812, lng: -122.4363 },
}

// ---------------------------------------------------------------------------
// Pearson correlation
// ---------------------------------------------------------------------------
function computePearsonR(pairs: { x: number; y: number }[]): number {
  const n = pairs.length
  if (n < 2) return 0

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0
  for (const { x, y } of pairs) {
    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
    sumYY += y * y
  }

  const denom = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY))
  if (denom === 0) return 0
  return (n * sumXY - sumX * sumY) / denom
}

// ---------------------------------------------------------------------------
// Interpolate color from a ramp
// ---------------------------------------------------------------------------
function interpolateColor(value: number, min: number, max: number, ramp: string[]): string {
  if (ramp.length === 0) return '#7c3aed'
  if (max === min) return ramp[Math.floor(ramp.length / 2)]
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const idx = t * (ramp.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, ramp.length - 1)
  // Simple: just return the nearest ramp color (no sub-pixel interpolation needed for map)
  return Math.round(idx) <= lo ? ramp[lo] : ramp[hi]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export interface DemographicsDataResult {
  cityAverages: Record<string, number | null>
  scatterData: { name: string; x: number; y: number; population: number; color: string }[]
  pearsonR: number
  rankedNeighborhoods: NeighborhoodCensusData[]
  cartogramData: { name: string; value: number; population: number; lat: number; lng: number }[]
  choroplethGeoJSON: GeoJSON.FeatureCollection | null
}

export function useDemographicsData(
  neighborhoods: NeighborhoodCensusData[],
  activeVariable: CensusVariable,
  selectedNeighborhood: string | null,
  scatterYData: Map<string, number>,
  boundaries: GeoJSON.FeatureCollection | null,
): DemographicsDataResult {
  // -- City averages (population-weighted for rates, sum for population) --
  const cityAverages = useMemo(() => {
    const keys: CensusVariable[] = ['medianIncome', 'rentBurden', 'lepRate', 'totalPopulation']
    const result: Record<string, number | null> = {}

    for (const key of keys) {
      const valid = neighborhoods.filter(n => {
        const v = n[key]
        return v !== undefined && v !== null && isFinite(v as number)
      })
      if (valid.length === 0) {
        result[key] = null
        continue
      }
      if (key === 'totalPopulation') {
        result[key] = valid.reduce((sum, n) => sum + (n[key] as number), 0)
      } else {
        let wSum = 0, wTotal = 0
        for (const n of valid) {
          const w = n.population > 0 ? n.population : 1
          wSum += (n[key] as number) * w
          wTotal += w
        }
        result[key] = wTotal > 0 ? wSum / wTotal : null
      }
    }
    return result
  }, [neighborhoods])

  // -- Active variable config --
  const activeConfig = useMemo(() => getVariableConfig(activeVariable), [activeVariable])

  // -- Ranked neighborhoods (sorted by active variable descending) --
  const rankedNeighborhoods = useMemo(() => {
    return [...neighborhoods]
      .filter(n => {
        const v = n[activeVariable]
        return v !== undefined && v !== null && isFinite(v as number)
      })
      .sort((a, b) => ((b[activeVariable] as number) ?? 0) - ((a[activeVariable] as number) ?? 0))
  }, [neighborhoods, activeVariable])

  // -- Value extent for active variable (for color) --
  const valueExtent = useMemo(() => {
    const vals = rankedNeighborhoods.map(n => n[activeVariable] as number)
    if (vals.length === 0) return { min: 0, max: 1 }
    return { min: Math.min(...vals), max: Math.max(...vals) }
  }, [rankedNeighborhoods, activeVariable])

  // -- Scatter data --
  const scatterData = useMemo(() => {
    if (scatterYData.size === 0) return []
    const ramp = activeConfig?.colorRamp ?? ['#7c3aed']
    return neighborhoods
      .filter(n => {
        const xVal = n[activeVariable]
        return xVal !== undefined && xVal !== null && isFinite(xVal as number) && scatterYData.has(n.name)
      })
      .map(n => ({
        name: n.name,
        x: n[activeVariable] as number,
        y: scatterYData.get(n.name)!,
        population: n.population,
        color: interpolateColor(
          n[activeVariable] as number,
          valueExtent.min,
          valueExtent.max,
          ramp,
        ),
      }))
  }, [neighborhoods, activeVariable, scatterYData, activeConfig, valueExtent])

  // -- Pearson R --
  const pearsonR = useMemo(() => {
    return computePearsonR(scatterData.map(d => ({ x: d.x, y: d.y })))
  }, [scatterData])

  // -- Cartogram data --
  const cartogramData = useMemo(() => {
    return rankedNeighborhoods
      .map(n => {
        const center = NEIGHBORHOOD_CENTERS[n.name]
        if (!center) return null
        return {
          name: n.name,
          value: n[activeVariable] as number,
          population: n.population,
          lat: center.lat,
          lng: center.lng,
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
  }, [rankedNeighborhoods, activeVariable])

  // -- Choropleth GeoJSON --
  const choroplethGeoJSON = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!boundaries || neighborhoods.length === 0) return null

    // Build lookup: neighborhood name → Census data
    const lookup = new Map<string, NeighborhoodCensusData>()
    for (const n of neighborhoods) {
      lookup.set(n.name, n)
    }

    // Enrich each boundary feature with Census variable values
    const features = boundaries.features.map(f => {
      const nhood = f.properties?.nhood as string | undefined
      const censusData = nhood ? lookup.get(nhood) : undefined

      // Add all numeric Census variables as properties
      const extraProps: Record<string, number | string | undefined> = {}
      if (censusData) {
        for (const v of CENSUS_VARIABLES) {
          const val = censusData[v.key]
          if (val !== undefined && val !== null && isFinite(val as number)) {
            extraProps[v.key] = val as number
          }
        }
        extraProps['population'] = censusData.population
      }

      return {
        ...f,
        properties: {
          ...f.properties,
          ...extraProps,
        },
      }
    })

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [boundaries, neighborhoods])

  return {
    cityAverages,
    scatterData,
    pearsonR,
    rankedNeighborhoods,
    cartogramData,
    choroplethGeoJSON,
  }
}
