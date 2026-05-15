// src/views/Last48/modes/FlowMode.tsx

import { useState, useCallback, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import FlowMapLayer from './FlowMapLayer'
import FlowRail from './FlowRail'
import FlowSelectedRadar from './FlowSelectedRadar'
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
  // Rail row click — select + fly to the event on the map.
  //
  // Clicking an already-selected row is a no-op (NOT a toggle-off).
  // Rationale: when the selected event is out-of-sequence (older than
  // the top 50, appended below a divider), a toggle-off click would
  // make the row vanish from the rail — surprising. Deselection is
  // reserved for Esc, the X on the detail card, or an empty-area map
  // click via `handleMapSelect` (which DOES toggle, since clicking
  // the same dot is the natural "deselect" gesture there).
  // ------------------------------------------------------------------
  const handleRailSelect = useCallback((ev: NormalizedEvent) => {
    if (selectedEvent?.id === ev.id) return
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

  // ------------------------------------------------------------------
  // Page-level Esc handler — deselects from anywhere on the page,
  // regardless of where focus currently sits. Coexists with
  // DetailPanelShell's own Esc handler (both call setSelectedEvent(null),
  // which is idempotent). Only active when there is a selection to clear.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!selectedEvent) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedEvent(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedEvent])

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

        {/* Radar sweep overlay — tracks selected dot's screen position via map.project */}
        <FlowSelectedRadar map={map} event={selectedEvent} />

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
