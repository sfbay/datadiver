// src/components/maps/DemographicUnderlay.ts
// React hook that manages a Mapbox GeoJSON source + fill layer for Census choropleth data.

import { useEffect, useRef } from 'react'
import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl'
import type { CensusVariable, CensusData } from '../../types/census'
import { getVariableConfig } from '../../utils/censusVariables'

interface UseDemographicUnderlayOptions {
  map: MapboxMap | null
  variable: CensusVariable | null
  censusData: CensusData[]
  boundaries: GeoJSON.FeatureCollection | null
  geoIdProperty: string     // property in GeoJSON features matching census geoId
  opacity?: number          // default 0.2 for underlays, 0.7 for Explorer
  beforeLayerId?: string    // insert below this layer for z-ordering
  layerPrefix?: string      // unique prefix for layer IDs (default: 'census-underlay')
}

// ---------------------------------------------------------------------------
// Percentile helpers
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDemographicUnderlay(options: UseDemographicUnderlayOptions): void {
  const {
    map,
    variable,
    censusData,
    boundaries,
    geoIdProperty,
    opacity = 0.2,
    beforeLayerId,
    layerPrefix = 'census-underlay',
  } = options

  // Keep a ref so cleanup always has access to the latest prefix/layer IDs
  const sourceId = `${layerPrefix}-source`
  const fillLayerId = `${layerPrefix}-fill`
  const lineLayerId = `${layerPrefix}-line`
  const layerPrefixRef = useRef(layerPrefix)
  layerPrefixRef.current = layerPrefix

  useEffect(() => {
    if (!map) return

    // If no variable or no boundaries, remove any existing layers and bail
    if (!variable || !boundaries) {
      removeLayers(map, sourceId, fillLayerId, lineLayerId)
      return
    }

    const config = getVariableConfig(variable)
    if (!config) return

    // Build a lookup: geoId → value
    const valueByGeoId = new Map<string, number>()
    for (const d of censusData) {
      const val = d[variable]
      if (val !== undefined && val !== null) {
        // Neighborhoods can be matched by geoId or name
        valueByGeoId.set(d.geoId, val as number)
        if (d.name && d.name !== d.geoId) {
          valueByGeoId.set(d.name, val as number)
        }
      }
    }

    // Collect all numeric values for percentile calculation
    const allValues: number[] = []
    for (const feature of boundaries.features) {
      const featureId = feature.properties?.[geoIdProperty] as string | undefined
      if (featureId !== undefined) {
        const val = valueByGeoId.get(featureId)
        if (val !== undefined) allValues.push(val)
      }
    }

    // Compute stop values at 0th, 33rd, 66th, and 100th percentiles
    const p0  = percentile(allValues, 0)
    const p33 = percentile(allValues, 33)
    const p66 = percentile(allValues, 66)
    const p100 = percentile(allValues, 100)

    const ramp = config.colorRamp
    // Guard against ramps with fewer than 4 entries
    const c0  = ramp[0] ?? '#1e293b'
    const c1  = ramp[1] ?? ramp[0] ?? '#475569'
    const c2  = ramp[2] ?? ramp[1] ?? '#7c3aed'
    const c3  = ramp[3] ?? ramp[2] ?? '#8b6282'

    // Enrich features with _censusValue
    const enrichedFeatures = boundaries.features.map((feature) => {
      const featureId = feature.properties?.[geoIdProperty] as string | undefined
      const censusValue = featureId !== undefined ? (valueByGeoId.get(featureId) ?? null) : null
      return {
        ...feature,
        properties: {
          ...feature.properties,
          _censusValue: censusValue,
        },
      }
    })

    const enrichedGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: enrichedFeatures,
    }

    // Mapbox fill-color expression using interpolate on _censusValue
    // Features with null values get a transparent fallback
    // Cast to unknown first to satisfy the strict Mapbox expression type
    const fillColorExpression = [
      'case',
      ['==', ['get', '_censusValue'], null],
      'rgba(0,0,0,0)',
      [
        'interpolate',
        ['linear'],
        ['get', '_censusValue'],
        p0,   c0,
        p33,  c1,
        p66,  c2,
        p100, c3,
      ],
    ] as unknown as mapboxgl.Expression

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>

    const addOrUpdate = () => {
      if (cancelled) return
      try {
        const existingSource = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
        if (existingSource) {
          existingSource.setData(enrichedGeoJSON)
          // Update paint properties in case variable changed
          if (map.getLayer(fillLayerId)) {
            map.setPaintProperty(fillLayerId, 'fill-color', fillColorExpression)
            map.setPaintProperty(fillLayerId, 'fill-opacity', opacity)
          }
        } else {
          map.addSource(sourceId, { type: 'geojson', data: enrichedGeoJSON })

          const fillLayerSpec: mapboxgl.FillLayer = {
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': fillColorExpression,
              'fill-opacity': opacity,
              'fill-opacity-transition': { duration: 300 },
            },
          }

          const lineLayerSpec: mapboxgl.LineLayer = {
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': 'rgba(255,255,255,0.12)',
              'line-width': 0.5,
            },
          }

          if (beforeLayerId) {
            map.addLayer(fillLayerSpec, beforeLayerId)
            map.addLayer(lineLayerSpec, beforeLayerId)
          } else {
            map.addLayer(fillLayerSpec)
            map.addLayer(lineLayerSpec)
          }
        }
      } catch {
        // Style may not be ready yet — retry (the only reliable approach with Mapbox GL v3 + React)
        if (!cancelled) {
          retryTimer = setTimeout(addOrUpdate, 200)
        }
      }
    }

    addOrUpdate()

    // Re-add after theme style swap
    const handleStyleData = () => {
      if (cancelled) return
      retryTimer = setTimeout(addOrUpdate, 100)
    }
    map.on('style.load', handleStyleData)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      map.off('style.load', handleStyleData)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, variable, censusData, boundaries, geoIdProperty, opacity, beforeLayerId, layerPrefix])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map) {
        removeLayers(map, sourceId, fillLayerId, lineLayerId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function removeLayers(
  map: MapboxMap,
  sourceId: string,
  fillLayerId: string,
  lineLayerId: string,
): void {
  try {
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
    if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  } catch {
    // Style may be mid-mutation — safe to ignore during cleanup
  }
}
