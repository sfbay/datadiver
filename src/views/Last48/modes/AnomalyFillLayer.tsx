// src/views/Last48/modes/AnomalyFillLayer.tsx
//
// Composable Mapbox layer: neighborhood z-score choropleth.
// Extracted from HotspotsChoropleth so it can be mounted alongside
// FlowMapLayer in the single-MapView composable-layers architecture
// (Phase 5). Accepts a click handler for neighborhood selection.
//
// Paint (roadmap item 6 rework): a CONTINUOUS ['interpolate'] ramp over the
// combined z-score, borrowing the demographic underlay's recipe — blended
// color instead of the old 5-bucket case (which snapped nearly every
// neighborhood into one flat patch), translucent enough for the basemap to
// read through, hairline neighborhood outlines. Ramp presets + the combine
// math live in anomalyRamp.ts (pure, tested). The selected neighborhood —
// the one a Pulse card lands on — gets a visible frame: a stroke ring plus
// a fill-opacity lift.

import { useEffect, useMemo, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useAppStore } from '@/stores/appStore'
import { getRampPreset, rampFillColor } from './anomalyRamp'

const SOURCE_ID      = 'last48-anomaly-fill'
const FILL_LAYER_ID  = 'last48-anomaly-fill-poly'
const LINE_LAYER_ID  = 'last48-anomaly-fill-outline'
const SELECT_LAYER_ID = 'last48-anomaly-fill-selected'

interface Props {
  map: mapboxgl.Map | null
  /** Combined per-neighborhood z-score (Stouffer-combined across selected datasets) */
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
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const onClickRef = useRef(onNeighborhoodClick)
  // Pattern: stable ref updated each render; accessed only in effects/handlers, not during render.
  // eslint-disable-next-line react-hooks/refs
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

  // Fill + outline layers — combined into a single useMapLayer call so both
  // layers are registered when the source is first added. Two separate calls
  // with the same SOURCE_ID caused the outline layer to silently never render
  // because useMapLayer only calls addLayer on the first (source-creation) pass.
  const choroplethLayers: mapboxgl.AnyLayer[] = useMemo(() => {
    const preset = getRampPreset()
    const selectedIsBoolean = ['boolean', ['get', 'selected'], false]
    return [
      // Fill layer — continuous ramp; the transparent band around "typical"
      // is baked into the preset's same-hue zero-alpha stops.
      {
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': rampFillColor(preset),
          'fill-opacity': [
            'case',
            selectedIsBoolean,
            Math.min(preset.fillOpacity + 0.15, 1),
            preset.fillOpacity,
          ],
          'fill-opacity-transition': { duration: 300 },
        },
        // Two-step cast: rampFillColor returns a plain unknown[] (the ramp
        // module stays mapbox-free), which isn't directly comparable to
        // ExpressionSpecification.
      } as unknown as mapboxgl.AnyLayer,
      // Hairline neighborhood outline — the underlay's engraving line, not a
      // border. Theme-aware: white over dark-v11, espresso over light-v11.
      {
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(30,20,13,0.18)',
          'line-width': 0.5,
        },
      } as unknown as mapboxgl.AnyLayer,
      // Selected-neighborhood frame — the map-side answer to a Pulse card's
      // claim ("this neighborhood"). Paper ring on espresso, espresso ring
      // on cream.
      {
        id: SELECT_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        filter: ['==', ['get', 'selected'], true],
        paint: {
          'line-color': isDarkMode ? '#f5ecd9' : '#1e140d',
          'line-width': 2,
          'line-opacity': 0.9,
        },
      } as unknown as mapboxgl.AnyLayer,
    ]
  }, [isDarkMode])

  useMapLayer(map, SOURCE_ID, geojson, choroplethLayers)

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
