// src/views/Last48/modes/FlowMode.tsx

import { useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import FlowMapLayer from './FlowMapLayer'
import FlowRail from './FlowRail'
import Last48EventHoverBox from '../detail/Last48EventHoverBox'
import { useHoverBoxTracking } from '../detail/useHoverBoxPlacement'

interface Props {
  window48: Last48WindowResult
  datasets: DatasetId[]
}

export default function FlowMode({ window48, datasets }: Props) {
  const [map, setMap] = useState<mapboxgl.Map | null>(null)

  // Hover state — opened after 350ms dwell; not pinned.
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: NormalizedEvent
    anchor: { x: number; y: number }
  } | null>(null)

  // Pinned state — opened on click; stays until Esc / outside-click.
  const [pinnedEvent, setPinnedEvent] = useState<NormalizedEvent | null>(null)

  // Track the pinned event's screen position as the map pans/zooms.
  const pinnedAnchor = useHoverBoxTracking(map, pinnedEvent)

  const visibleEvents = window48.events.filter((e) => datasets.includes(e.datasetId))

  // ------------------------------------------------------------------
  // Handlers from FlowMapLayer
  // ------------------------------------------------------------------

  const handleHover = (event: NormalizedEvent, anchor: { x: number; y: number }) => {
    // Don't open a hover-box for an event that's already pinned.
    if (pinnedEvent?.id === event.id) return
    setHoveredEvent({ event, anchor })
  }

  const handlePin = (event: NormalizedEvent, anchor: { x: number; y: number }) => {
    setPinnedEvent(event)
    setHoveredEvent(null)  // pin supersedes any active hover
    // Fly to the event so the pinned popover stays near the centre.
    if (map && event.longitude != null && event.latitude != null) {
      map.flyTo({
        center: [event.longitude, event.latitude],
        zoom: 14,
        duration: 600,
      })
    }
    // Suppress unused-variable lint for anchor — it's the initial position
    // before useHoverBoxTracking takes over, kept for API consistency.
    void anchor
  }

  // ------------------------------------------------------------------
  // Rail row select — fly to event; open pinned hover-box
  // ------------------------------------------------------------------
  const handleRailSelect = (ev: NormalizedEvent) => {
    if (map && ev.longitude != null && ev.latitude != null) {
      map.flyTo({
        center: [ev.longitude, ev.latitude],
        zoom: 14,
        duration: 600,
      })
      // Project after flyTo's target (approximate; tracking hook refines it)
      const point = map.project([ev.longitude, ev.latitude])
      handlePin(ev, { x: point.x, y: point.y })
    } else {
      // No geo — open pinned at a sensible default (centre of viewport)
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      handlePin(ev, anchor)
    }
  }

  return (
    <div className="absolute inset-0 flex">
      {/* Map area */}
      <div className="flex-1 relative">
        <MapView onMapReady={setMap}>
          <FlowMapLayer
            map={map}
            events={visibleEvents}
            onHover={handleHover}
            onPin={handlePin}
          />
        </MapView>

        {window48.isLoading && (
          <div className="absolute top-3 left-3 font-mono text-[10px] text-paper-500 bg-espresso-900/70 px-2 py-1 rounded">
            loading 48h window…
          </div>
        )}
      </div>

      {/* Right rail — must stay scrollable at all times */}
      <FlowRail
        events={visibleEvents}
        selectedId={pinnedEvent?.id}
        onSelect={handleRailSelect}
      />

      {/* ------------------------------------------------------------------
          Hover-box — one instance, either pinned or hover mode.
          Pinned wins when both states coexist (rare race condition).
          ------------------------------------------------------------------ */}
      {pinnedEvent && pinnedAnchor && (
        <Last48EventHoverBox
          event={pinnedEvent}
          anchor={pinnedAnchor}
          pinned
          onDismiss={() => setPinnedEvent(null)}
        />
      )}
      {!pinnedEvent && hoveredEvent && (
        <Last48EventHoverBox
          event={hoveredEvent.event}
          anchor={hoveredEvent.anchor}
          pinned={false}
          onDismiss={() => setHoveredEvent(null)}
        />
      )}
    </div>
  )
}
