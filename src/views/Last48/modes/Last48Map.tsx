// src/views/Last48/modes/Last48Map.tsx
//
// Single persistent MapView host for The Last 48. Both FLOW points and the
// base-fill layers (Anomaly, Demographic) mount via mapOverlay. This replaces
// the previous one-MapView-per-mode architecture and is the prerequisite
// for composable layers (Phase 5).
//
// Layout note: two render-prop slots keep the map-relative overlay plane
// (mapOverlay) separate from the flex-sibling rail (rail). A single
// render-prop spanning both DOM locations is not possible — the overlay
// layer lives inside `flex-1 relative` so that `absolute right-5` on
// DetailPanelShell is clipped to the map area, not the full viewport.
// Both slots receive the same live map instance.

import { useState, useCallback, type ReactNode } from 'react'
import mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import { LAST48_CAMERA } from '@/utils/geo'

interface Props {
  /** Render-prop for map layers + overlay components (loading pill,
   *  selected-event ring, detail panel). Receives the live map instance.
   *  Rendered inside `<MapView>` so absolute positioning is relative to
   *  the map canvas, matching the pre-refactor behaviour.
   *  Named `mapOverlay` (not `children`) to make the render-prop contract
   *  explicit — passing ReactNode children would hit a runtime "is not a
   *  function" error with no TypeScript warning. */
  mapOverlay: (map: mapboxgl.Map | null) => ReactNode
  /** Render-prop for the right-rail sidebar. Receives the same live map
   *  instance so rail rows can call map.flyTo. Rendered as a flex sibling
   *  of the map area so the sidebar keeps its natural width and the map
   *  canvas is correctly inset. */
  rail?: (map: mapboxgl.Map | null) => ReactNode
}

export default function Last48Map({ mapOverlay, rail }: Props) {
  const [map, setMap] = useState<mapboxgl.Map | null>(null)
  const handleReady = useCallback((m: mapboxgl.Map) => setMap(m), [])

  return (
    <div className="absolute inset-0 flex">
      <div className="flex-1 relative">
        {/* Last48-only camera framing (steeper pitch, tighter zoom) — every
            other view omits `camera` and keeps the global SF_DEFAULT_*. */}
        <MapView onMapReady={handleReady} camera={LAST48_CAMERA}>
          {mapOverlay(map)}
        </MapView>
      </div>
      {rail?.(map)}
    </div>
  )
}
