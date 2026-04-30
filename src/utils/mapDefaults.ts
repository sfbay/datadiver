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
 *  `neighborhoods_analysis_boundaries` text values exactly (case sensitive).
 *  Tuned 2026-04-29 via the ?debug=map overlay. Covers 30 of SF's 41 official
 *  neighborhoods — long-tail districts fall back to centroid-flyTo. */
export const NEIGHBORHOOD_VIEWS: Record<string, CameraView> = {
  'Financial District/South Beach': {
    pitch: 47.5, bearing: 31, zoom: 14.42,
    center: { lat: 37.7845, lng: -122.3968 },
  },
  'Mission': {
    pitch: 57.5, bearing: 40.6, zoom: 14.59,
    center: { lat: 37.7540, lng: -122.4178 },
  },
  'Sunset/Parkside': {
    pitch: 57.5, bearing: 40.6, zoom: 14.1,
    center: { lat: 37.7420, lng: -122.4964 },
  },
  'South of Market': {
    pitch: 62.5, bearing: 14.8, zoom: 15.05,
    center: { lat: 37.7740, lng: -122.4073 },
  },
  'Castro/Upper Market': {
    pitch: 62.5, bearing: 27.9, zoom: 15.45,
    center: { lat: 37.7577, lng: -122.4381 },
  },
  'Outer Richmond': {
    pitch: 54, bearing: 53.5, zoom: 14.77,
    center: { lat: 37.7717, lng: -122.4993 },
  },
  'Tenderloin': {
    pitch: 44.5, bearing: 10.5, zoom: 15.41,
    center: { lat: 37.7787, lng: -122.4153 },
  },
  'Bayview Hunters Point': {
    pitch: 44.5, bearing: 10.5, zoom: 13.62,
    center: { lat: 37.7216, lng: -122.3850 },
  },
  'Marina': {
    pitch: 46.5, bearing: 36.3, zoom: 14.96,
    center: { lat: 37.7971, lng: -122.4377 },
  },
  'Nob Hill': {
    pitch: 49, bearing: 0, zoom: 15.76,
    center: { lat: 37.7894, lng: -122.4144 },
  },
  'West of Twin Peaks': {
    pitch: 49, bearing: 20.8, zoom: 14.16,
    center: { lat: 37.7266, lng: -122.4579 },
  },
  'Pacific Heights': {
    pitch: 52.5, bearing: 36.8, zoom: 15.18,
    center: { lat: 37.7881, lng: -122.4382 },
  },
  'Mission Bay': {
    pitch: 52.5, bearing: 36.8, zoom: 14.83,
    center: { lat: 37.7670, lng: -122.3956 },
  },
  'Inner Sunset': {
    pitch: 52, bearing: 11.2, zoom: 14.86,
    center: { lat: 37.7531, lng: -122.4646 },
  },
  'Chinatown': {
    pitch: 57, bearing: -88, zoom: 16.56,
    center: { lat: 37.7963, lng: -122.4031 },
  },
  'Noe Valley': {
    pitch: 60.8, bearing: 49.8, zoom: 15.25,
    center: { lat: 37.7457, lng: -122.4363 },
  },
  'Western Addition': {
    pitch: 54.9, bearing: 44, zoom: 15.36,
    center: { lat: 37.7775, lng: -122.4346 },
  },
  'Hayes Valley': {
    pitch: 41.8, bearing: 40, zoom: 15.46,
    center: { lat: 37.7723, lng: -122.4334 },
  },
  'Inner Richmond': {
    pitch: 41.8, bearing: 7.2, zoom: 15.1,
    center: { lat: 37.7771, lng: -122.4646 },
  },
  'Potrero Hill': {
    pitch: 42.3, bearing: 12, zoom: 14.96,
    center: { lat: 37.7549, lng: -122.3947 },
  },
  'Excelsior': {
    pitch: 42.3, bearing: 12, zoom: 14.36,
    center: { lat: 37.7126, lng: -122.4324 },
  },
  'Bernal Heights': {
    pitch: 42.3, bearing: 12, zoom: 14.77,
    center: { lat: 37.7356, lng: -122.4145 },
  },
  'North Beach': {
    pitch: 42.3, bearing: 12, zoom: 15.39,
    center: { lat: 37.8023, lng: -122.4091 },
  },
  'Russian Hill': {
    pitch: 56.3, bearing: -34.4, zoom: 15.61,
    center: { lat: 37.7967, lng: -122.4173 },
  },
  'Haight Ashbury': {
    pitch: 49.3, bearing: 35.4, zoom: 15.44,
    center: { lat: 37.7651, lng: -122.4465 },
  },
  'Outer Mission': {
    pitch: 48.8, bearing: 17.6, zoom: 14.5,
    center: { lat: 37.7116, lng: -122.4505 },
  },
  'Lone Mountain/USF': {
    pitch: 48.8, bearing: 17.6, zoom: 15.46,
    center: { lat: 37.7739, lng: -122.4504 },
  },
  'Oceanview/Merced/Ingleside': {
    pitch: 48.8, bearing: 17.6, zoom: 15.36,
    center: { lat: 37.7119, lng: -122.4636 },
  },
  'Presidio Heights': {
    pitch: 48.8, bearing: 17.6, zoom: 15.64,
    center: { lat: 37.7831, lng: -122.4507 },
  },
  'Portola': {
    pitch: 49.3, bearing: -54.7, zoom: 15.35,
    center: { lat: 37.7240, lng: -122.4059 },
  },
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
