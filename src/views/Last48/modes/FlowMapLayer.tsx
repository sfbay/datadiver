// src/views/Last48/modes/FlowMapLayer.tsx
//
// Mapbox layer rendering one circle per NormalizedEvent.
// Older events fade in opacity across the 48h window.
//
// Interaction model:
//   onHover — fired after 350ms dwell on a dot (avoids flicker on dense pan).
//             Caller should open the hover-box in non-pinned mode.
//   onPin   — fired on click. Caller should open the hover-box in pinned mode.
//
// The mouseleave handler on the map cancels any pending dwell timer but does
// NOT dismiss the popover — the popover manages its own dismissal via its
// internal exit-timer (hover-box) or Esc / outside-click (pinned).

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
  /** Called after 350ms hover dwell — open the hover-box (not pinned). */
  onHover?: (event: NormalizedEvent, anchor: { x: number; y: number }) => void
  /** Called on click — open the hover-box pinned. */
  onPin?: (event: NormalizedEvent, anchor: { x: number; y: number }) => void
}

const SOURCE_ID = 'last48-flow-events'
const LAYER_ID  = 'last48-flow-events-circles'

export default function FlowMapLayer({ map, events, onHover, onPin }: Props) {
  // Stable refs so event handlers don't need to re-attach when props change.
  const eventsRef  = useRef(events)
  const onHoverRef = useRef(onHover)
  const onPinRef   = useRef(onPin)
  eventsRef.current  = events
  onHoverRef.current = onHover
  onPinRef.current   = onPin

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

  // -------------------------------------------------------------------------
  // Interaction handlers — dwell timer for hover; immediate for click
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) return

    const dwellTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null }
    const lastHoverIdRef: { current: string | null } = { current: null }

    const onMouseEnter = (
      e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] },
    ) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = e.features?.[0]
      if (!feature) return
      const id = feature.properties?.id as string | undefined
      if (!id) return
      if (lastHoverIdRef.current === id) return  // already dwelling on this one

      lastHoverIdRef.current = id
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current)

      dwellTimerRef.current = setTimeout(() => {
        const ev = eventsRef.current.find((x) => x.id === id)
        if (!ev || ev.longitude == null || ev.latitude == null) return
        const point = map.project([ev.longitude, ev.latitude])
        onHoverRef.current?.(ev, { x: point.x, y: point.y })
      }, 350)
    }

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      lastHoverIdRef.current = null
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
      }
      // NOTE: we do NOT dismiss the popover here. The popover's own internal
      // exit-timer (100ms) handles the dot→popover gap traversal gracefully.
    }

    const onClick = (
      e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] },
    ) => {
      const feature = e.features?.[0]
      if (!feature) return
      const id = feature.properties?.id as string | undefined
      if (!id) return
      const ev = eventsRef.current.find((x) => x.id === id)
      if (!ev || ev.longitude == null || ev.latitude == null) return
      const point = map.project([ev.longitude, ev.latitude])
      onPinRef.current?.(ev, { x: point.x, y: point.y })
    }

    map.on('mouseenter', LAYER_ID, onMouseEnter)
    map.on('mouseleave', LAYER_ID, onMouseLeave)
    map.on('click',      LAYER_ID, onClick)

    return () => {
      map.off('mouseenter', LAYER_ID, onMouseEnter)
      map.off('mouseleave', LAYER_ID, onMouseLeave)
      map.off('click',      LAYER_ID, onClick)
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current)
    }
  }, [map])  // intentionally stable — refs handle live props

  return null
}
