// src/components/maps/DemographicUnderlay.ts
// React hook that manages a Mapbox GeoJSON source + fill layer for Census choropleth data.

import { useEffect, useRef } from 'react'
import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl'
import type { CensusVariable, CensusData } from '../../types/census'
import { getVariableConfig } from '../../utils/censusVariables'

// ---------------------------------------------------------------------------
// Curatorial exclusion list — neighborhoods that should NEVER count for
// demographic shading because they're non-residential (parks, large open
// space). They typically carry near-zero population, which means:
//
//   • ACS estimates for these zones have huge margins of error
//   • Any rate-based variable (rent burden, % under 18, % over 65, etc.)
//     can become a meaningless outlier (e.g., "5 residents in GGP, 4 of
//     them rent-burdened = 80%") that distorts the citywide scale
//
// These zones are rendered with a diagonal-hatch pattern instead of the
// color ramp, marking them as "data not applicable" rather than hiding
// them entirely (transparent reads as "no data"; hatched reads as "we
// know this zone isn't comparable to residential ones").
//
// Exposed for consumers (e.g., UnderlayLegend) so the legend can filter
// these values from its min/max display.
// ---------------------------------------------------------------------------
export const DEFAULT_EXCLUDED_NEIGHBORHOODS: readonly string[] = [
  'Golden Gate Park',
  'McLaren Park',
  // Add other non-residential SF zones here as they emerge as outliers.
] as const

interface UseDemographicUnderlayOptions {
  map: MapboxMap | null
  variable: CensusVariable | null
  censusData: CensusData[]
  boundaries: GeoJSON.FeatureCollection | null
  geoIdProperty: string     // property in GeoJSON features matching census geoId
  opacity?: number          // default 0.2 for underlays, 0.7 for Explorer
  beforeLayerId?: string    // insert below this layer for z-ordering
  layerPrefix?: string      // unique prefix for layer IDs (default: 'census-underlay')
  /** Neighborhoods to hatch instead of color-ramp. Defaults to non-residential
   *  zones (Golden Gate Park, McLaren Park). Pass `[]` to disable exclusion. */
  excludedGeoIds?: readonly string[]
}

// ---------------------------------------------------------------------------
// Hatch pattern — registered once per map, lazily on first use.
// Diagonal stripes on a faint paper wash. Reads as "this zone is invalid
// for demographic comparison" without screaming for attention.
// ---------------------------------------------------------------------------

const HATCH_IMAGE_ID = 'demographic-hatch'

function ensureHatchPattern(map: MapboxMap): void {
  if (map.hasImage(HATCH_IMAGE_ID)) return

  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Faint warm wash so the zone is visible against the dark basemap even
  // when no hatch line is over a given pixel.
  ctx.fillStyle = 'rgba(168, 146, 106, 0.10)'   // paper-500 @ ~10%
  ctx.fillRect(0, 0, size, size)

  // Diagonal stripes — multiple parallel lines stepping every 6px so the
  // pattern wraps cleanly when tiled.
  ctx.strokeStyle = 'rgba(168, 146, 106, 0.55)' // paper-500 @ ~55%
  ctx.lineWidth   = 1.4
  ctx.lineCap     = 'square'
  for (let i = -size; i < size * 2; i += 6) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + size, size)
    ctx.stroke()
  }

  const imgData = ctx.getImageData(0, 0, size, size)
  map.addImage(
    HATCH_IMAGE_ID,
    {
      width:  size,
      height: size,
      data:   new Uint8Array(imgData.data.buffer),
    },
    { pixelRatio: 2 },
  )
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
    excludedGeoIds = DEFAULT_EXCLUDED_NEIGHBORHOODS,
  } = options

  // Keep a ref so cleanup always has access to the latest prefix/layer IDs
  const sourceId = `${layerPrefix}-source`
  const fillLayerId = `${layerPrefix}-fill`
  const hatchLayerId = `${layerPrefix}-hatch`
  const lineLayerId = `${layerPrefix}-line`
  const layerPrefixRef = useRef(layerPrefix)
  layerPrefixRef.current = layerPrefix

  useEffect(() => {
    if (!map) return

    // If no variable or no boundaries, remove any existing layers and bail
    if (!variable || !boundaries) {
      removeLayers(map, sourceId, fillLayerId, hatchLayerId, lineLayerId)
      return
    }

    const config = getVariableConfig(variable)
    if (!config) return

    const excludedSet = new Set<string>(excludedGeoIds)

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

    // Collect all numeric values for percentile calculation — but only
    // from non-excluded features. Excluding parks here is what recalibrates
    // the color scale: instead of stretching from a park-distorted extreme
    // (e.g., 82.9% rent burden in GGP) to a low extreme, the scale now
    // reflects the distribution across SF's actually-residential
    // neighborhoods.
    const allValues: number[] = []
    for (const feature of boundaries.features) {
      const featureId = feature.properties?.[geoIdProperty] as string | undefined
      if (featureId !== undefined && !excludedSet.has(featureId)) {
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

    // Enrich features with _censusValue and _excluded. Excluded features
    // get _censusValue = null so the color-ramp expression renders them
    // transparent; the hatch fill layer paints over them with the diagonal
    // pattern.
    const enrichedFeatures = boundaries.features.map((feature) => {
      const featureId = feature.properties?.[geoIdProperty] as string | undefined
      const isExcluded = featureId !== undefined && excludedSet.has(featureId)
      const censusValue = !isExcluded && featureId !== undefined
        ? (valueByGeoId.get(featureId) ?? null)
        : null
      return {
        ...feature,
        properties: {
          ...feature.properties,
          _censusValue: censusValue,
          _excluded: isExcluded,
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
        // Register the hatch pattern image lazily on first use. Idempotent —
        // checks map.hasImage internally.
        ensureHatchPattern(map)

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

          // Hatch fill for excluded (non-residential) features. Filtered
          // to _excluded = true so it only paints parks. Slightly higher
          // opacity than the color-ramp fill because the hatch pattern
          // itself is sparse, and we want the zone to read as deliberately
          // marked, not accidentally dimmed.
          const hatchFillSpec: mapboxgl.FillLayer = {
            id: hatchLayerId,
            type: 'fill',
            source: sourceId,
            filter: ['==', ['get', '_excluded'], true] as unknown as mapboxgl.FilterSpecification,
            paint: {
              'fill-pattern': HATCH_IMAGE_ID,
              'fill-opacity': Math.min(1, opacity * 2.5),
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
            map.addLayer(fillLayerSpec,  beforeLayerId)
            map.addLayer(hatchFillSpec,  beforeLayerId)
            map.addLayer(lineLayerSpec,  beforeLayerId)
          } else {
            map.addLayer(fillLayerSpec)
            map.addLayer(hatchFillSpec)
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
  }, [map, variable, censusData, boundaries, geoIdProperty, opacity, beforeLayerId, layerPrefix, excludedGeoIds])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map) {
        removeLayers(map, sourceId, fillLayerId, hatchLayerId, lineLayerId)
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
  hatchLayerId: string,
  lineLayerId: string,
): void {
  try {
    if (map.getLayer(lineLayerId))  map.removeLayer(lineLayerId)
    if (map.getLayer(hatchLayerId)) map.removeLayer(hatchLayerId)
    if (map.getLayer(fillLayerId))  map.removeLayer(fillLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  } catch {
    // Style may be mid-mutation — safe to ignore during cleanup
  }
}
