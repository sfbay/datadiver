/** useMapCameraPresets — shared camera-animation logic for any map view that
 *  responds to corridor / neighborhood selection.
 *
 *  Handles:
 *    1. Corridor selection — apply CORRIDOR_VIEWS preset, else fit-bounds
 *    2. Neighborhood selection — apply NEIGHBORHOOD_VIEWS preset, else
 *       centroid-flyTo at zoom 14
 *    3. Reset to SF_DEFAULT_VIEW when both selections clear
 *
 *  The lookup tables in `src/utils/mapDefaults.ts` are global, so a preset
 *  tuned in any view applies in every view that calls this hook with the
 *  same selection string. SF's 37 official neighborhood names are
 *  cross-dataset — same string in Crime, 311, Emergency Response, etc.
 *
 *  Each view passes its own `fallbackPoints` (typically the points already
 *  filtered to the current selection) so the auto-fit can produce a frame
 *  that matches the view's data scope. When no preset matches, the hook
 *  falls back to fit-bounds (corridor) or centroid-flyTo (neighborhood).
 */

import { useEffect, useRef } from 'react'
import type mapboxgl from 'mapbox-gl'
import {
  getCorridorView,
  getNeighborhoodView,
  applyCameraView,
  SF_DEFAULT_VIEW,
} from '@/utils/mapDefaults'

export interface CameraPresetPoint {
  lat: number
  lng: number
}

export interface UseMapCameraPresetsOptions {
  selectedCorridor?: string | null
  selectedNeighborhood?: string | null
  /** For corridor fallback when no preset exists: points filtered to the
   *  active corridor selection. The hook fit-bounds over them. */
  fallbackPoints?: CameraPresetPoint[]
  /** For neighborhood fallback when no preset exists: the SF neighborhood
   *  polygon GeoJSON. The hook locates the matching feature by `nhood`
   *  property and fit-bounds the polygon — gives a much tighter, more
   *  accurate frame than centroid-flyTo. Preferred over `fallbackPoints`
   *  for neighborhood selections when both are provided. */
  neighborhoodBoundaries?: GeoJSON.FeatureCollection | null
  /** Viewport chrome the camera should dodge (px): a view whose map is
   *  partly covered by overlays (CardTray across the top, legends at the
   *  bottom) passes the covered depths so flights center content in the
   *  VISIBLE well, not the geometric viewport. Applied to every camera op
   *  in the hook — including the reset flight, because Mapbox camera
   *  padding persists once set and an unpadded reset would inherit a stale
   *  offset. Memoize in the caller. */
  viewportPadding?: { top?: number; bottom?: number; left?: number; right?: number }
}

export function useMapCameraPresets(
  map: mapboxgl.Map | null,
  options: UseMapCameraPresetsOptions,
) {
  const { selectedCorridor, selectedNeighborhood, fallbackPoints, neighborhoodBoundaries, viewportPadding } = options

  // Full PaddingOptions (Mapbox wants all four sides) with a base breathing
  // margin for the fitBounds paths; undefined when the caller passes nothing
  // so views that never set padding are untouched.
  const pad = viewportPadding
    ? {
        top: viewportPadding.top ?? 0,
        bottom: viewportPadding.bottom ?? 0,
        left: viewportPadding.left ?? 0,
        right: viewportPadding.right ?? 0,
      }
    : undefined
  const fitPad = (base: number) =>
    pad
      ? { top: base + pad.top, bottom: base + pad.bottom, left: base + pad.left, right: base + pad.right }
      : base

  // Corridor preset — applies on selection or falls back to fit-bounds.
  // Note: the deps include fallbackPoints; if the upstream view passes a
  // fresh array on every render, the effect would loop. Views should
  // memoize fallbackPoints (with `useMemo`) keyed on their data + selection.
  useEffect(() => {
    if (!map || !selectedCorridor) return

    const preset = getCorridorView(selectedCorridor)
    if (preset) {
      applyCameraView(map, preset, { duration: 1000, padding: pad })
      return
    }

    if (fallbackPoints && fallbackPoints.length > 0) {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
      for (const p of fallbackPoints) {
        if (p.lat < minLat) minLat = p.lat
        if (p.lat > maxLat) maxLat = p.lat
        if (p.lng < minLng) minLng = p.lng
        if (p.lng > maxLng) maxLng = p.lng
      }
      if (minLat === maxLat && minLng === maxLng) {
        map.flyTo({ center: [minLng, minLat], zoom: 16, duration: 1000, ...(pad ? { padding: pad } : {}) })
      } else {
        map.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: fitPad(80), maxZoom: 16, duration: 1000 },
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedCorridor, fallbackPoints, viewportPadding])

  // Neighborhood preset — applies on selection. Falls back (in priority order)
  // to: 1) polygon-based fitBounds over the matching feature in
  // `neighborhoodBoundaries`, 2) centroid-flyTo over `fallbackPoints`,
  // 3) nothing if neither is available.
  useEffect(() => {
    if (!map || !selectedNeighborhood) return

    const preset = getNeighborhoodView(selectedNeighborhood)
    if (preset) {
      applyCameraView(map, preset, { duration: 1000, padding: pad })
      return
    }

    // Fallback A: polygon fitBounds (more accurate frame than centroid-fly).
    if (neighborhoodBoundaries) {
      const feature = neighborhoodBoundaries.features.find(
        (f) => f.properties?.nhood === selectedNeighborhood,
      )
      if (feature) {
        const coords: [number, number][] = []
        const collect = (c: unknown): void => {
          if (Array.isArray(c) && typeof c[0] === 'number') {
            coords.push(c as [number, number])
          } else if (Array.isArray(c)) {
            c.forEach(collect)
          }
        }
        // GeoJSON geometry coordinates structure varies by type; recurse safely
        collect((feature.geometry as { coordinates: unknown }).coordinates)
        if (coords.length > 0) {
          const lngs = coords.map((c) => c[0])
          const lats = coords.map((c) => c[1])
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: fitPad(80), duration: 1200 },
          )
          return
        }
      }
    }

    // Fallback B: centroid-flyTo over filtered points.
    if (fallbackPoints && fallbackPoints.length > 0) {
      const avgLat = fallbackPoints.reduce((s, d) => s + d.lat, 0) / fallbackPoints.length
      const avgLng = fallbackPoints.reduce((s, d) => s + d.lng, 0) / fallbackPoints.length
      map.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200, ...(pad ? { padding: pad } : {}) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedNeighborhood, fallbackPoints, neighborhoodBoundaries, viewportPadding])

  // Reset to global default on falling-edge clear (set → null transition for
  // both selections). Tracked via ref so we don't fire on every mount where
  // both happen to be null.
  const prev = useRef<{ corridor: string | null; neighborhood: string | null }>({
    corridor: null,
    neighborhood: null,
  })
  useEffect(() => {
    if (!map) return
    const hadAny = prev.current.corridor !== null || prev.current.neighborhood !== null
    const justCleared = hadAny && !selectedCorridor && !selectedNeighborhood
    prev.current = {
      corridor: selectedCorridor ?? null,
      neighborhood: selectedNeighborhood ?? null,
    }
    if (justCleared) {
      // Same padding on reset: flight padding persists on the map, so an
      // unpadded reset after a padded selection flight would re-center the
      // citywide view under the overlay chrome.
      applyCameraView(map, SF_DEFAULT_VIEW, { duration: 1200, padding: pad })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedCorridor, selectedNeighborhood, viewportPadding])
}
