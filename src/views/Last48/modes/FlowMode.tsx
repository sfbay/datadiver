// src/views/Last48/modes/FlowMode.tsx

import { useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import FlowMapLayer from './FlowMapLayer'
import FlowRail from './FlowRail'
import Last48EventPeek from '../detail/Last48EventPeek'

interface Props {
  window48: Last48WindowResult
  datasets: DatasetId[]
}

export default function FlowMode({ window48, datasets }: Props) {
  const [map, setMap] = useState<mapboxgl.Map | null>(null)
  const [selected, setSelected] = useState<NormalizedEvent | null>(null)

  const visibleEvents = window48.events.filter((e) => datasets.includes(e.datasetId))

  const handleEventSelect = (ev: NormalizedEvent) => {
    setSelected(ev)
    if (map && ev.longitude != null && ev.latitude != null) {
      map.flyTo({
        center: [ev.longitude, ev.latitude],
        zoom: 14,
        duration: 800,
      })
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
            onEventClick={handleEventSelect}
          />
        </MapView>

        {window48.isLoading && (
          <div className="absolute top-3 left-3 font-mono text-[10px] text-paper-500 bg-espresso-900/70 px-2 py-1 rounded">
            loading 48h window…
          </div>
        )}
      </div>

      {/* Right rail */}
      <FlowRail
        events={visibleEvents}
        selectedId={selected?.id}
        onSelect={handleEventSelect}
      />

      {/* Detail panel */}
      {selected && (
        <Last48EventPeek
          event={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
