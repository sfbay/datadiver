/** Per-corridor and per-neighborhood camera presets.
 *
 *  When a user selects a corridor or neighborhood, the map can either:
 *    1. Apply a hand-tuned preset (pitch / bearing / zoom / center) from the
 *       lookup tables below — best when the geography has a strong axis or
 *       a particular frame that reads well, and
 *    2. Fall back to auto-`fitBounds` over the matching markers when no
 *       preset exists.
 *
 *  Presets are populated iteratively. Workflow:
 *    1. Visit any map view with `?debug=map` appended
 *    2. Pick a corridor / neighborhood to filter
 *    3. Tilt / pan / zoom until the framing reads right
 *    4. Read the four paste-ready values off the debug overlay
 *    5. Add a new entry to the appropriate map below
 *
 *  Empty lookup is fine — auto-fit-bounds is a sensible default. We only
 *  add presets when a corridor / neighborhood benefits from custom framing
 *  (e.g., elongated corridors that need a specific bearing rotation).
 */

import type mapboxgl from 'mapbox-gl'
import { SF_CENTER, SF_DEFAULT_PITCH, SF_DEFAULT_BEARING, SF_DEFAULT_ZOOM } from '@/utils/geo'

export interface CameraView {
  pitch: number
  bearing: number
  zoom: number
  center: { lat: number; lng: number }
}

/** Global default — camera config used on map mount and when filters clear. */
export const SF_DEFAULT_VIEW: CameraView = {
  pitch: SF_DEFAULT_PITCH,
  bearing: SF_DEFAULT_BEARING,
  zoom: SF_DEFAULT_ZOOM,
  center: SF_CENTER,
}

/** Per-corridor presets. Keys must exactly match the `business_corridor`
 *  field's free-text values from Socrata (case sensitive). Tune via the
 *  `?debug=map` overlay and add entries here as they're dialed in. */
export const CORRIDOR_VIEWS: Record<string, CameraView> = {
  // Example shape — kept commented for reference; remove once a real entry lands.
  // 'Mission Street': {
  //   pitch: 50,
  //   bearing: 25,
  //   zoom: 14.5,
  //   center: { lat: 37.7596, lng: -122.4194 },
  // },
}

/** Per-neighborhood presets. Keys must match
 *  `neighborhoods_analysis_boundaries` text values. */
export const NEIGHBORHOOD_VIEWS: Record<string, CameraView> = {
  // Same iterative-population pattern as CORRIDOR_VIEWS.
}

/** Look up a corridor's camera preset. Returns null if no preset exists —
 *  caller should fall back to auto-fit-bounds. */
export function getCorridorView(name: string | null | undefined): CameraView | null {
  if (!name) return null
  return CORRIDOR_VIEWS[name] ?? null
}

export function getNeighborhoodView(name: string | null | undefined): CameraView | null {
  if (!name) return null
  return NEIGHBORHOOD_VIEWS[name] ?? null
}

/** Apply a CameraView to a Mapbox map instance via flyTo for smooth
 *  animation. Works for both first-load presets and reset-to-default. */
export function applyCameraView(
  map: mapboxgl.Map,
  view: CameraView,
  options: { duration?: number } = {},
) {
  const { duration = 1000 } = options
  map.flyTo({
    center: [view.center.lng, view.center.lat],
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    duration,
    essential: true, // honors prefers-reduced-motion automatically
  })
}
