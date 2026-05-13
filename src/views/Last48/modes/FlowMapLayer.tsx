// src/views/Last48/modes/FlowMapLayer.tsx
//
// Mapbox layer rendering one circle per NormalizedEvent.
// Older events fade in opacity across the 48h window.
//
// Interaction model (click-driven — no hover dwell):
//   onSelect — fired on click. Caller opens the detail panel with this event.
//              If the same event is clicked again, caller should deselect.
//   mouseenter/mouseleave — ONLY changes the cursor to 'pointer'.
//
// Selected event gets a cream stroke ring rendered via a second Mapbox
// circle layer filtered to the selected event id. No radar sweep yet
// (that arrives in PR 2); just a visible cream border circle.

import { useEffect, useMemo, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import type { NormalizedEvent, DatasetId } from '@/types/last48'

const COLORS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',
  'fire-ems-dispatch': '#b85a33',
  '311-cases':         '#7a9954',
  '911-historical':    '#5c9693',
  'parking-revenue':   '#d4a435',
  'police-incidents':  '#963e30',
}

interface Props {
  map: mapboxgl.Map | null
  events: NormalizedEvent[]
  /** ID of the currently selected event (for the cream ring overlay). */
  selectedId?: string
  /** Called on click — select this event. */
  onSelect?: (event: NormalizedEvent) => void
}

const SOURCE_ID        = 'last48-flow-events'
const LAYER_ID         = 'last48-flow-events-circles'
const SELECTED_RING_ID = 'last48-flow-events-selected-ring'

export default function FlowMapLayer({ map, events, selectedId, onSelect }: Props) {
  // Stable refs so event handlers don't need to re-attach when props change.
  const eventsRef   = useRef(events)
  const onSelectRef = useRef(onSelect)
  const selectedIdRef = useRef(selectedId)
  eventsRef.current    = events
  onSelectRef.current  = onSelect
  selectedIdRef.current = selectedId

  // Build GeoJSON from events that have coordinates.
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

  // Base circles layer + selected-ring overlay.
  // The ring is filtered to the selected id at the Mapbox expression level —
  // no React re-render needed when selection changes (see useEffect below).
  const layers: mapboxgl.AnyLayer[] = useMemo(() => [
    {
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, ['case', ['get', 'isOpen'], 4, 3],
          14, ['case', ['get', 'isOpen'], 7, 6],
        ],
        'circle-opacity': [
          'case',
          ['get', 'isOpen'],
          ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.55],
          ['interpolate', ['linear'], ['get', 'age'], 0, 0.7, 172800000, 0.25],
        ],
        'circle-stroke-color': [
          'case', ['get', 'isOpen'], '#f5ecd9', '#1e140d',
        ],
        'circle-stroke-width': [
          'case', ['get', 'isOpen'], 1, 0.5,
        ],
      },
    } as mapboxgl.AnyLayer,
    {
      // Selected-event ring — cream stroke circle, larger than the base dot.
      // Rendered above the base circles so it acts as a visible selection ring.
      // Filter is set to match no features initially; updated via setFilter below.
      id: SELECTED_RING_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', ['get', 'id'], ''],   // empty string → nothing selected
      paint: {
        'circle-color': 'transparent',
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, 8,
          14, 13,
        ],
        'circle-opacity': 1,
        'circle-stroke-color': '#f5ecd9',  // cream
        'circle-stroke-width': 2,
      },
    } as mapboxgl.AnyLayer,
  ], [])

  useMapLayer(map, SOURCE_ID, geojson, layers)

  // -------------------------------------------------------------------------
  // Sync the selected-ring filter to selectedId without a full layer rebuild.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) return
    // Poll until the layer is available (useMapLayer may still be retrying).
    const trySet = () => {
      try {
        if (map.getLayer(SELECTED_RING_ID)) {
          map.setFilter(SELECTED_RING_ID, [
            '==', ['get', 'id'], selectedId ?? '',
          ])
          return true
        }
      } catch (_err) {
        // Layer not yet registered — retry below.
      }
      return false
    }
    if (!trySet()) {
      const t = setTimeout(trySet, 300)
      return () => clearTimeout(t)
    }
  }, [map, selectedId])

  // -------------------------------------------------------------------------
  // Cursor + click handlers (no hover dwell)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) return

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = ''
    }

    const onClick = (
      e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] },
    ) => {
      const feature = e.features?.[0]
      if (!feature) return
      const id = feature.properties?.id as string | undefined
      if (!id) return
      const ev = eventsRef.current.find((x) => x.id === id)
      if (!ev) return
      onSelectRef.current?.(ev)
    }

    map.on('mouseenter', LAYER_ID, onMouseEnter)
    map.on('mouseleave', LAYER_ID, onMouseLeave)
    map.on('click',      LAYER_ID, onClick)

    return () => {
      map.off('mouseenter', LAYER_ID, onMouseEnter)
      map.off('mouseleave', LAYER_ID, onMouseLeave)
      map.off('click',      LAYER_ID, onClick)
    }
  }, [map])  // intentionally stable — refs handle live props

  return null
}
