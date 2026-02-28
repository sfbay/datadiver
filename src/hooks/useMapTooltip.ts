import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

/**
 * Adds a hover tooltip to a Mapbox layer.
 * Shows a popup with formatted HTML when hovering over features.
 */
export function useMapTooltip(
  map: mapboxgl.Map | null,
  layerId: string,
  formatTooltip: (properties: Record<string, unknown>) => string
) {
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const formatRef = useRef(formatTooltip)
  formatRef.current = formatTooltip

  useEffect(() => {
    if (!map) return

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'datadiver-tooltip',
      maxWidth: '240px',
      offset: 12,
    })
    popupRef.current = popup

    const handleMouseMove = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      map.getCanvas().style.cursor = 'pointer'
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number]
      const html = formatRef.current(e.features[0].properties || {})
      popup.setLngLat(coords).setHTML(html).addTo(map)
    }

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    }

    // Wait a tick for the layer to exist (retry-based addLayer)
    const tryAttach = () => {
      try {
        if (map.getLayer(layerId)) {
          map.on('mousemove', layerId, handleMouseMove)
          map.on('mouseleave', layerId, handleMouseLeave)
          return true
        }
      } catch {
        // Layer doesn't exist yet
      }
      return false
    }

    if (!tryAttach()) {
      // Retry until layer is added
      const interval = setInterval(() => {
        if (tryAttach()) clearInterval(interval)
      }, 500)
      return () => {
        clearInterval(interval)
        popup.remove()
        try {
          map.off('mousemove', layerId, handleMouseMove)
          map.off('mouseleave', layerId, handleMouseLeave)
        } catch {
          // Layer may not exist
        }
      }
    }

    return () => {
      popup.remove()
      try {
        map.off('mousemove', layerId, handleMouseMove)
        map.off('mouseleave', layerId, handleMouseLeave)
      } catch {
        // Layer may not exist
      }
    }
  }, [map, layerId])
}
