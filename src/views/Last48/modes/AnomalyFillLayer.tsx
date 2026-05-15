// src/views/Last48/modes/AnomalyFillLayer.tsx
//
// Composable Mapbox layer: neighborhood z-score choropleth.
// Extracted from HotspotsChoropleth so it can be mounted alongside
// FlowMapLayer in the single-MapView composable-layers architecture
// (Phase 5). Accepts a click handler for neighborhood selection.
//
// Color ramp:
//   |z| < 0.5              → transparent (no editorial story)
//   z ∈ [0.5, 1.0)         → ochre (mild elevation)
//   z ∈ [1.0, 2.0)         → terracotta (notable)
//   z ≥ 2.0                → brick (standout)
//   z < -0.5               → paper-300 (unusually quiet)

import { useEffect, useMemo, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'

const SOURCE_ID      = 'last48-anomaly-fill'
const FILL_LAYER_ID  = 'last48-anomaly-fill-poly'
const LINE_LAYER_ID  = 'last48-anomaly-fill-outline'

interface Props {
  map: mapboxgl.Map | null
  /** Combined per-neighborhood z-score (averaged across selected datasets) */
  combinedAnomalies: Record<string, number>
  selectedNeighborhood?: string
  onNeighborhoodClick?: (neighborhood: string) => void
}

export default function AnomalyFillLayer({
  map,
  combinedAnomalies,
  selectedNeighborhood,
  onNeighborhoodClick,
}: Props) {
  const { boundaries } = useNeighborhoodBoundaries()
  const onClickRef = useRef(onNeighborhoodClick)
  onClickRef.current = onNeighborhoodClick

  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!boundaries) return { type: 'FeatureCollection', features: [] }
    return {
      type: 'FeatureCollection',
      features: boundaries.features.map((f) => {
        const props = (f.properties ?? {}) as { nhood?: string }
        const nhName = props.nhood ?? ''
        const z = combinedAnomalies[nhName] ?? 0
        return {
          ...f,
          properties: {
            ...props,
            nhood: nhName,
            zScore: z,
            selected: selectedNeighborhood === nhName,
          },
        }
      }),
    }
  }, [boundaries, combinedAnomalies, selectedNeighborhood])

  // Fill layer — z-score → color expression lifted verbatim from HotspotsChoropleth.
  const fillLayers: mapboxgl.AnyLayer[] = useMemo(() => [
    {
      id: FILL_LAYER_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': [
          'case',
          ['<', ['get', 'zScore'], -0.5], '#bda37d',           // below baseline — faint paper
          ['<', ['get', 'zScore'],  0.5], 'rgba(0,0,0,0)',     // within ±0.5σ — transparent
          ['<', ['get', 'zScore'],  1.0], '#d4a435',           // ochre (0.5 to 1.0)
          ['<', ['get', 'zScore'],  2.0], '#d47149',           // terracotta (1.0 to 2.0)
          '#963e30',                                            // brick (>+2σ)
        ],
        'fill-opacity': [
          'case',
          ['<', ['abs', ['get', 'zScore']], 0.5], 0,
          0.55,
        ],
        'fill-opacity-transition': { duration: 300 },
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Outline layer — dashed on quiet neighborhoods, solid on elevated.
  const lineLayers: mapboxgl.AnyLayer[] = useMemo(() => [
    {
      id: LINE_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': [
          'case',
          ['<', ['get', 'zScore'], -0.5], '#a8926a',
          ['>', ['get', 'zScore'],  0.5], '#1e140d',
          'rgba(0,0,0,0)',
        ],
        'line-width': [
          'case',
          ['<', ['abs', ['get', 'zScore']], 0.5], 0,
          1,
        ],
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Both calls share the same SOURCE_ID — useMapLayer coalesces the source.
  useMapLayer(map, SOURCE_ID, geojson, fillLayers)
  useMapLayer(map, SOURCE_ID, geojson, lineLayers)

  // Click + cursor handlers on the fill layer.
  useEffect(() => {
    if (!map) return
    const handler = (
      e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] },
    ) => {
      const feature = e.features?.[0]
      const nh = feature?.properties?.nhood as string | undefined
      if (nh && onClickRef.current) onClickRef.current(nh)
    }
    const enterHandler = () => { map.getCanvas().style.cursor = 'pointer' }
    const leaveHandler = () => { map.getCanvas().style.cursor = '' }
    map.on('click', FILL_LAYER_ID, handler)
    map.on('mouseenter', FILL_LAYER_ID, enterHandler)
    map.on('mouseleave', FILL_LAYER_ID, leaveHandler)
    return () => {
      map.off('click', FILL_LAYER_ID, handler)
      map.off('mouseenter', FILL_LAYER_ID, enterHandler)
      map.off('mouseleave', FILL_LAYER_ID, leaveHandler)
    }
  }, [map])

  return null
}
