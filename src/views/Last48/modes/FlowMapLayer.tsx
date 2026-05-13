// src/views/Last48/modes/FlowMapLayer.tsx
//
// Mapbox layer rendering one circle per NormalizedEvent.
// Older events fade in opacity across the 48h window.
// Click handler delegates to parent via onEventClick.

import { useEffect, useMemo, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import type { NormalizedEvent, DatasetId } from '@/types/last48'

const COLORS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',
  'fire-ems-dispatch': '#b85a33',
  '311-cases':         '#d47149',
  '911-historical':    '#5c9693',
  'parking-revenue':   '#d4a435',
  'police-incidents':  '#963e30',
}

interface Props {
  map: mapboxgl.Map | null
  events: NormalizedEvent[]
  onEventClick?: (event: NormalizedEvent) => void
}

const SOURCE_ID = 'last48-flow-events'
const LAYER_ID = 'last48-flow-events-circles'

export default function FlowMapLayer({ map, events, onEventClick }: Props) {
  const onClickRef = useRef(onEventClick)
  onClickRef.current = onEventClick

  // Build GeoJSON from events that have coordinates
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const now = Date.now()
    const features: GeoJSON.Feature[] = events
      .filter((e) => e.longitude != null && e.latitude != null)
      .map((e) => ({
        type: 'Feature',
        properties: {
          id: e.id,
          datasetId: e.datasetId,
          color: COLORS[e.datasetId],
          age: now - e.receivedAt,
          headline: e.headline ?? '',
        },
        geometry: { type: 'Point', coordinates: [e.longitude!, e.latitude!] },
      }))
    return { type: 'FeatureCollection', features }
  }, [events])

  const layers: mapboxgl.AnyLayer[] = useMemo(() => [
    {
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, 3,
          14, 6,
        ],
        // Fade older events to 40% opacity over the 48h window
        'circle-opacity': [
          'interpolate', ['linear'], ['get', 'age'],
          0, 1.0,
          172800000, 0.4,  // 48h in ms
        ],
        'circle-stroke-color': '#1e140d',
        'circle-stroke-width': 0.5,
      },
    } as mapboxgl.AnyLayer,
  ], [])

  useMapLayer(map, SOURCE_ID, geojson, layers)

  // Click handler — wire once when the map is ready
  useEffect(() => {
    if (!map) return
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const feature = e.features?.[0]
      if (!feature) return
      const id = feature.properties?.id as string | undefined
      if (!id) return
      const ev = events.find((x) => x.id === id)
      if (ev && onClickRef.current) onClickRef.current(ev)
    }
    // Named handlers so we can remove ALL three on cleanup — without this
    // the cursor listeners accumulated on every events update (a slow leak
    // that grew with each 2-minute 911-realtime poll cycle).
    const enterHandler = () => { map.getCanvas().style.cursor = 'pointer' }
    const leaveHandler = () => { map.getCanvas().style.cursor = '' }
    map.on('click', LAYER_ID, handler)
    map.on('mouseenter', LAYER_ID, enterHandler)
    map.on('mouseleave', LAYER_ID, leaveHandler)
    return () => {
      map.off('click', LAYER_ID, handler)
      map.off('mouseenter', LAYER_ID, enterHandler)
      map.off('mouseleave', LAYER_ID, leaveHandler)
    }
  }, [map, events])

  return null
}
