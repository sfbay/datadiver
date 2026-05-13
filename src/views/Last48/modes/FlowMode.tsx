// src/views/Last48/modes/FlowMode.tsx

import { useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import FlowMapLayer from './FlowMapLayer'
import FlowRail from './FlowRail'
import Last48EventCard from '../detail/Last48EventCard'

interface Props {
  window48: Last48WindowResult
  datasets: DatasetId[]
}

export default function FlowMode({ window48, datasets }: Props) {
  const [map, setMap] = useState<mapboxgl.Map | null>(null)

  // Single source of truth for selection.
  // Both the map dot ring and the rail row highlight derive from this.
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)

  const visibleEvents = window48.events.filter((e) => datasets.includes(e.datasetId))

  // ------------------------------------------------------------------
  // Map dot click — toggle: clicking the same dot again deselects
  // ------------------------------------------------------------------
  const handleMapSelect = useCallback((ev: NormalizedEvent) => {
    setSelectedEvent((prev) => (prev?.id === ev.id ? null : ev))
  }, [])

  // ------------------------------------------------------------------
  // Rail row click — select + fly to the event on the map
  // ------------------------------------------------------------------
  const handleRailSelect = useCallback((ev: NormalizedEvent) => {
    // Toggle if already selected
    if (selectedEvent?.id === ev.id) {
      setSelectedEvent(null)
      return
    }
    setSelectedEvent(ev)
    if (map && ev.longitude != null && ev.latitude != null) {
      map.flyTo({
        center: [ev.longitude, ev.latitude],
        zoom: 14,
        duration: 600,
      })
    }
  }, [map, selectedEvent])

  // ------------------------------------------------------------------
  // Close — clears selection entirely
  // ------------------------------------------------------------------
  const handleClose = useCallback(() => setSelectedEvent(null), [])

  return (
    <div className="absolute inset-0 flex">
      {/* Map area */}
      <div className="flex-1 relative">
        <MapView onMapReady={setMap}>
          <FlowMapLayer
            map={map}
            events={visibleEvents}
            selectedId={selectedEvent?.id}
            onSelect={handleMapSelect}
          />
        </MapView>

        {window48.isLoading && (
          <div className="absolute top-3 left-3 font-mono text-[10px] text-paper-500 bg-espresso-900/70 px-2 py-1 rounded">
            loading 48h window…
          </div>
        )}

        {/* Detail panel — top-right, fixed via DetailPanelShell */}
        <Last48EventCard
          event={selectedEvent}
          onClose={handleClose}
        />
      </div>

      {/* Right rail — must stay scrollable at all times */}
      <FlowRail
        events={visibleEvents}
        selectedId={selectedEvent?.id}
        onSelect={handleRailSelect}
      />
    </div>
  )
}
