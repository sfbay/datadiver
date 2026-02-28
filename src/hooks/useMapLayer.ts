import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

/** Reactively add/update GeoJSON data + layers on a Mapbox map. */
export function useMapLayer(
  map: mapboxgl.Map | null,
  sourceId: string,
  geojson: GeoJSON.FeatureCollection | null,
  layers: mapboxgl.AnyLayer[]
) {
  const layersRef = useRef(layers)
  layersRef.current = layers

  useEffect(() => {
    if (!map || !geojson || geojson.features.length === 0) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>

    const addOrUpdate = () => {
      if (cancelled) return
      try {
        const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
        if (source) {
          source.setData(geojson)
        } else {
          map.addSource(sourceId, { type: 'geojson', data: geojson })
          for (const layer of layersRef.current) {
            if (!map.getLayer(layer.id)) {
              map.addLayer(layer)
            }
          }
        }
      } catch {
        // Style may not be ready yet — retry
        if (!cancelled) {
          retryTimer = setTimeout(addOrUpdate, 200)
        }
      }
    }

    addOrUpdate()

    // Handle style changes (dark/light toggle) — re-add after style swap
    const handleStyleData = () => {
      if (cancelled) return
      // Small delay to let style settle
      retryTimer = setTimeout(addOrUpdate, 100)
    }

    map.on('style.load', handleStyleData)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      map.off('style.load', handleStyleData)
    }
  }, [map, geojson, sourceId])
}
