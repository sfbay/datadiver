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
  '311-cases':         '#7a9954',  // moss — civic upkeep, clearly distinct from terracotta Fire/EMS
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

  // Build GeoJSON from events that have coordinates.
  //
  // The `isOpen` property drives the open-vs-closed visual treatment:
  // events with `state === 'open'` (911 calls without a disposition yet)
  // render larger, with a cream stroke and slower age fade — they "pop."
  // Closed events render smaller, with the standard dark stroke and a
  // more aggressive age fade — they recede into the background.
  // For datasets without a lifecycle concept (`state === undefined`,
  // like 311 or Parking Revenue), default to the "open" treatment so
  // they retain visual presence.
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
          isOpen: e.state === undefined || e.state === 'open',
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
        // Open events are 1px larger at each zoom level — subtle visual
        // hierarchy that lets the eye land on active situations first.
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, ['case', ['get', 'isOpen'], 4, 3],
          14, ['case', ['get', 'isOpen'], 7, 6],
        ],
        // Open events fade gently (1.0 → 0.55 over 48h), keeping presence.
        // Closed events start pre-faded and decay further (0.7 → 0.25).
        'circle-opacity': [
          'case',
          ['get', 'isOpen'],
          ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.55],
          ['interpolate', ['linear'], ['get', 'age'], 0, 0.7, 172800000, 0.25],
        ],
        // Cream stroke on open events makes them "punch through" the dense
        // basemap; closed events keep the original dark espresso stroke and
        // recede.
        'circle-stroke-color': [
          'case', ['get', 'isOpen'], '#f5ecd9', '#1e140d',
        ],
        'circle-stroke-width': [
          'case', ['get', 'isOpen'], 1, 0.5,
        ],
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
