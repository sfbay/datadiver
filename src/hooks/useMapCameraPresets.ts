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
  /** Points to compute fallback framing from — typically the view's
   *  current data filtered to the active selection. Used for fit-bounds
   *  (corridor) and centroid-flyTo (neighborhood) when no preset exists. */
  fallbackPoints?: CameraPresetPoint[]
}

export function useMapCameraPresets(
  map: mapboxgl.Map | null,
  options: UseMapCameraPresetsOptions,
) {
  const { selectedCorridor, selectedNeighborhood, fallbackPoints } = options

  // Corridor preset — applies on selection or falls back to fit-bounds.
  // Note: the deps include fallbackPoints; if the upstream view passes a
  // fresh array on every render, the effect would loop. Views should
  // memoize fallbackPoints (with `useMemo`) keyed on their data + selection.
  useEffect(() => {
    if (!map || !selectedCorridor) return

    const preset = getCorridorView(selectedCorridor)
    if (preset) {
      applyCameraView(map, preset, { duration: 1000 })
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
        map.flyTo({ center: [minLng, minLat], zoom: 16, duration: 1000 })
      } else {
        map.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 80, maxZoom: 16, duration: 1000 },
        )
      }
    }
  }, [map, selectedCorridor, fallbackPoints])

  // Neighborhood preset — applies on selection or centroid-flies as fallback.
  useEffect(() => {
    if (!map || !selectedNeighborhood) return

    const preset = getNeighborhoodView(selectedNeighborhood)
    if (preset) {
      applyCameraView(map, preset, { duration: 1000 })
      return
    }

    if (fallbackPoints && fallbackPoints.length > 0) {
      const avgLat = fallbackPoints.reduce((s, d) => s + d.lat, 0) / fallbackPoints.length
      const avgLng = fallbackPoints.reduce((s, d) => s + d.lng, 0) / fallbackPoints.length
      map.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [map, selectedNeighborhood, fallbackPoints])

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
      applyCameraView(map, SF_DEFAULT_VIEW, { duration: 1200 })
    }
  }, [map, selectedCorridor, selectedNeighborhood])
}
