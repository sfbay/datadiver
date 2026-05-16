import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

/** Reactively add/update GeoJSON data + layers on a Mapbox map.
 *
 *  Lifecycle is split into three effects:
 *
 *  1. Mount/unmount — runs only when `map` or `sourceId` changes. Adds the
 *     source + layers when the consumer mounts, removes them when it
 *     unmounts. Critical for consumers that conditionally mount/unmount
 *     (e.g., Last 48's FLOW toggle); without explicit cleanup, removed
 *     consumers leave their layers stuck on the map forever.
 *
 *  2. Data updates — runs whenever `geojson` changes. Calls `setData` on
 *     the existing source. Decoupled from the mount effect so polling
 *     doesn't tear down + re-add the entire layer.
 *
 *  3. Paint/layout updates — when the `layers` config object changes,
 *     pushes the new paint/layout properties to the already-mounted layer.
 */
export function useMapLayer(
  map: mapboxgl.Map | null,
  sourceId: string,
  geojson: GeoJSON.FeatureCollection | null,
  layers: mapboxgl.AnyLayer[]
) {
  const layersRef = useRef(layers)
  layersRef.current = layers
  const geojsonRef = useRef(geojson)
  geojsonRef.current = geojson

  // ── Mount/unmount: add source + layers, clean up on unmount ──────────────
  useEffect(() => {
    if (!map) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>

    const ensureAdded = () => {
      if (cancelled) return
      try {
        const initialData =
          geojsonRef.current ?? { type: 'FeatureCollection' as const, features: [] }
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: 'geojson', data: initialData })
        }
        for (const layer of layersRef.current) {
          if (!map.getLayer(layer.id)) map.addLayer(layer)
        }
      } catch {
        // Style may not be ready yet — retry
        if (!cancelled) retryTimer = setTimeout(ensureAdded, 200)
      }
    }

    ensureAdded()

    // Re-add after style changes (light/dark toggle clears layers)
    const handleStyleData = () => {
      if (cancelled) return
      retryTimer = setTimeout(ensureAdded, 100)
    }
    map.on('style.load', handleStyleData)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      map.off('style.load', handleStyleData)
      // Clean up this consumer's layers + source. Without this, conditionally-
      // mounted consumers (FLOW toggle) leave their dots/fills stuck on the
      // map forever.
      try {
        for (const layer of layersRef.current) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id)
        }
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      } catch {
        // Map may already be disposed
      }
    }
  }, [map, sourceId])

  // ── Data updates: setData when geojson changes ────────────────────────────
  useEffect(() => {
    if (!map || !geojson) return
    try {
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      if (source) source.setData(geojson)
    } catch {
      // Source not yet ready; the mount effect will retry
    }
  }, [map, geojson, sourceId])

  // ── Paint/layout updates when layer config changes ────────────────────────
  useEffect(() => {
    if (!map) return
    for (const layer of layers) {
      try {
        if (!map.getLayer(layer.id)) continue
        const spec = layer as any
        if (spec.paint) {
          for (const [prop, value] of Object.entries(spec.paint)) {
            map.setPaintProperty(layer.id, prop as any, value)
          }
        }
        if (spec.layout) {
          for (const [prop, value] of Object.entries(spec.layout)) {
            map.setLayoutProperty(layer.id, prop as any, value)
          }
        }
      } catch {
        // Layer not ready yet
      }
    }
  }, [map, layers])
}
