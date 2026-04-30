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
 *  `?debug=map` overlay and add entries here as they're dialed in.
 *  Bearings vary widely because SF's commercial corridors run in many
 *  different directions — each preset honors the corridor's natural axis. */
export const CORRIDOR_VIEWS: Record<string, CameraView> = {
  // Tuned 2026-04-29 via the ?debug=map overlay.
  'Central Market': {
    pitch: 59,
    bearing: 16.8,
    zoom: 15.72,
    center: { lat: 37.7773, lng: -122.4132 },
  },
  'Chinatown': {
    pitch: 63,
    bearing: -35.2,
    zoom: 16.55,
    center: { lat: 37.7932, lng: -122.4053 },
  },
  'Castro': {
    pitch: 64.5,
    bearing: 25.6,
    zoom: 15.76,
    center: { lat: 37.7629, lng: -122.4312 },
  },
  'Market/Castro': {
    pitch: 51,
    bearing: 12.9,
    zoom: 15.51,
    center: { lat: 37.7620, lng: -122.4302 },
  },
  'Union Street': {
    pitch: 53.1,
    bearing: 49.7,
    zoom: 16.38,
    center: { lat: 37.7962, lng: -122.4334 },
  },
  'Mission Street': {
    pitch: 65,
    bearing: 12,
    zoom: 15.56,
    center: { lat: 37.7200, lng: -122.4348 },
  },
  'North Beach': {
    pitch: 56,
    bearing: 0,
    zoom: 16.62,
    center: { lat: 37.7990, lng: -122.4080 },
  },
  'Parkside Taraval': {
    pitch: 55,
    bearing: 57.8,
    zoom: 15.22,
    center: { lat: 37.7393, lng: -122.4976 },
  },
  '24th Street': {
    pitch: 54.5,
    bearing: 63.3,
    zoom: 16.09,
    center: { lat: 37.7494, lng: -122.4344 },
  },
  'West Portal': {
    pitch: 50,
    bearing: 8,
    zoom: 16.38,
    center: { lat: 37.7378, lng: -122.4673 },
  },
  'Geary Boulevard': {
    pitch: 58.5,
    bearing: 56,
    zoom: 15.72,
    center: { lat: 37.7787, lng: -122.4832 },
  },
  'Noriega': {
    pitch: 57.5,
    bearing: 70.4,
    zoom: 15.2,
    center: { lat: 37.7512, lng: -122.5002 },
  },
  'Fillmore Street (Lower)': {
    pitch: 59,
    bearing: -31.2,
    zoom: 16.58,
    center: { lat: 37.7809, lng: -122.4314 },
  },
  'Lombard Street': {
    pitch: 54.6,
    bearing: 53.8,
    zoom: 15.63,
    center: { lat: 37.7978, lng: -122.4402 },
  },
  'Ocean Ave': {
    pitch: 50,
    bearing: 83.2,
    zoom: 15.98,
    center: { lat: 37.7240, lng: -122.4624 },
  },
  'Third Street': {
    pitch: 57.5,
    bearing: 0,
    zoom: 15.72,
    center: { lat: 37.7273, lng: -122.3912 },
  },
  'Lower Polk': {
    pitch: 44.6,
    bearing: -36.7,
    zoom: 16.15,
    center: { lat: 37.7844, lng: -122.4183 },
  },
  'Lower 24th': {
    pitch: 58,
    bearing: 68.6,
    zoom: 16.65,
    center: { lat: 37.7513, lng: -122.4152 },
  },
  'Outer Irving': {
    pitch: 56.5,
    bearing: 65.1,
    zoom: 17.11,
    center: { lat: 37.7624, lng: -122.4832 },
  },
  'San Bruno Ave': {
    pitch: 63.5,
    bearing: -38.3,
    zoom: 16.57,
    center: { lat: 37.7246, lng: -122.4012 },
  },
  'Middle Polk': {
    pitch: 50,
    bearing: -32,
    zoom: 17.01,
    center: { lat: 37.7923, lng: -122.4202 },
  },
  'Japantown': {
    pitch: 35.2,
    bearing: 49.9,
    zoom: 17.74,
    center: { lat: 37.7851, lng: -122.4302 },
  },
  'Larkin Street': {
    pitch: 46,
    bearing: -33.6,
    zoom: 17.03,
    center: { lat: 37.7824, lng: -122.4164 },
  },
  'Leland Ave': {
    pitch: 60.5,
    bearing: 99.7,
    zoom: 17.61,
    center: { lat: 37.7123, lng: -122.4075 },
  },
  'Brotherhood Way': {
    pitch: 45.7,
    bearing: 56.7,
    zoom: 16.2,
    center: { lat: 37.7126, lng: -122.4625 },
  },
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
