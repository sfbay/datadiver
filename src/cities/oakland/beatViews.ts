/**
 * Hand-tuned camera presets for Oakland police beats — the Oakland analogue
 * of SF's NEIGHBORHOOD_VIEWS (src/utils/mapDefaults.ts), living city-side
 * per the geography spine. Consulted by useMapCameraPresets via
 * `city.camera.areaViews` BEFORE the polygon-fitBounds fallback.
 *
 * PARTIAL BY DESIGN — unlike beatNames.ts (a complete editorial vocabulary,
 * byte-pinned bijective), this table grows one beat at a time as frames get
 * dialed in. A beat without an entry falls back to fitBounds over its
 * polygon, which is always a sane frame. beatViews.test.ts pins keys as a
 * SUBSET of OAKLAND_BEATS plus value sanity (Oakland bbox, zoom/pitch
 * ranges) — a typo'd code or SF coordinate can't slip in, but adding a
 * tuning is a one-row edit here and nothing else.
 *
 * Tuning workflow (same recipe as SF's presets, PRs #20/#24):
 *   1. Open the beat on any Oakland map view with `?debug=map`
 *   2. Tilt / pan / zoom until the framing reads right
 *   3. Read the four paste-ready values off the debug overlay
 *   4. Add the row below (keys are canonical beat CODES, never names)
 *
 * Padding note: preset flights apply the view's viewportPadding, and the
 * debug overlay reads the camera in the same padded state — read-then-apply
 * round-trips consistently as long as the same panels are open when tuning
 * as when flying (tune with detail panels CLOSED; the CardTray is constant).
 */

import type { CameraView } from '@/utils/mapDefaults'

export const OAKLAND_BEAT_VIEWS: Record<string, CameraView> = {
  // Tuned 2026-08-07 via the ?debug=map overlay (Jesse).
  '23X': {
    pitch: 49,
    bearing: 0,
    zoom: 15.15,
    center: { lat: 37.7729, lng: -122.2197 },
  },
}
