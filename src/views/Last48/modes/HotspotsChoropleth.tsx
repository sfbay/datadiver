// src/views/Last48/modes/HotspotsChoropleth.tsx
//
// Neighborhood polygon Mapbox layer for HOTSPOTS mode. Fills neighborhoods
// by z-score relative to the 12-week baseline:
//   - |z| < 0.5 → transparent (no editorial story)
//   - z >= 0.5 → escalating ochre → terracotta → brick
//   - z <= -0.5 → faint paper with dashed outline ("unusually quiet")

import { useEffect, useMemo, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'

const SOURCE_ID = 'last48-hotspots-source'
const FILL_LAYER_ID = 'last48-hotspots-fill'
const OUTLINE_LAYER_ID = 'last48-hotspots-outline'

interface Props {
  map: mapboxgl.Map | null
  /** Combined per-neighborhood z-score (averaged across selected datasets) */
  combinedAnomalies: Record<string, number>
  onNeighborhoodClick?: (neighborhood: string) => void
}

export default function HotspotsChoropleth({ map, combinedAnomalies, onNeighborhoodClick }: Props) {
  const { boundaries } = useNeighborhoodBoundaries()
  const onClickRef = useRef(onNeighborhoodClick)
  onClickRef.current = onNeighborhoodClick

  // Build choropleth GeoJSON: copy each boundary feature, attach the
  // current z-score for the neighborhood it belongs to. Neighborhood
  // name lives in feature.properties.nhood.
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
          properties: { ...props, nhood: nhName, zScore: z },
        }
      }),
    }
  }, [boundaries, combinedAnomalies])

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
          0.65,
        ],
      },
    } as mapboxgl.AnyLayer,
  ], [])

  const outlineLayers: mapboxgl.AnyLayer[] = useMemo(() => [
    {
      id: OUTLINE_LAYER_ID,
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

  // Two separate useMapLayer calls — one source, two layers (fill + outline).
  // We use the same SOURCE_ID for both so the source is shared.
  useMapLayer(map, SOURCE_ID, geojson, fillLayers)
  useMapLayer(map, SOURCE_ID, geojson, outlineLayers)

  // Click handler — wire on the fill layer only.
  useEffect(() => {
    if (!map) return
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
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
