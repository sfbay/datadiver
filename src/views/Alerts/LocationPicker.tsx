// src/views/Alerts/LocationPicker.tsx
//
// The map half of the Alerts builder. Renders pins for each AlertLocation
// plus a teal radius ring around each one. Clicking the map fires onAdd.
//
// Previously this file owned the search input + the textual pin list too.
// That mixed three responsibilities (search, list, map) in one component
// and gave the map only ~h-72 of vertical space — too small to feel like
// a real place-picker. The 2-col Alerts layout now hosts search + list
// in the form column and lets the map grow to hero scale here.
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import type { AlertLocation } from '@/lib/alerts/types'

// Slightly north of SF_CENTER so the picker frames the full peninsula —
// Twin Peaks roughly center, Golden Gate Bridge visible, down to Daly City.
export const PICKER_CAMERA = { center: { lat: 37.7600, lng: -122.4400 }, zoom: 11.5 }

/** 64-point polygon approximating a circle of `radiusMiles` around center. */
function circlePolygon(center: { lat: number; lng: number }, radiusMiles: number): GeoJSON.Feature {
  const points: [number, number][] = []
  const distKm = radiusMiles * 1.60934
  const dLat = distKm / 110.574
  const dLng = distKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI
    points.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [points] }, properties: {} }
}

interface LocationMapProps {
  locations: AlertLocation[]
  radiusMiles: number
  onAdd: (l: AlertLocation) => void
  /** Tailwind height class (defaults sensible for the right-rail layout). */
  className?: string
}

export function LocationPicker({ locations, radiusMiles, onAdd, className }: LocationMapProps) {
  const mapRef = useRef<MapHandle>(null)
  const markers = useRef<mapboxgl.Marker[]>([])

  function handleReady(map: mapboxgl.Map) {
    map.on('click', (e) => onAdd({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
  }

  // Render markers + radius circles whenever locations/radius change.
  // Returns a cleanup that removes markers on unmount so the next mount
  // doesn't leak a doubled-up pin set.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    markers.current.forEach((m) => m.remove())
    markers.current = locations.map((l) =>
      new mapboxgl.Marker({ color: '#b85a33' }).setLngLat([l.lng, l.lat]).addTo(map),
    )
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: locations.map((l) => circlePolygon(l, radiusMiles)),
    }
    const src = map.getSource('alert-radii') as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(fc)
    } else if (map.isStyleLoaded()) {
      map.addSource('alert-radii', { type: 'geojson', data: fc })
      map.addLayer({
        id: 'alert-radii-fill',
        type: 'fill',
        source: 'alert-radii',
        paint: { 'fill-color': '#5c9693', 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'alert-radii-line',
        type: 'line',
        source: 'alert-radii',
        paint: { 'line-color': '#5c9693', 'line-width': 1.5 },
      })
    }
    return () => {
      markers.current.forEach((m) => m.remove())
      markers.current = []
    }
  }, [locations, radiusMiles])

  return (
    <div className={className ?? 'h-72'}>
      <MapView ref={mapRef} onMapReady={handleReady} className="w-full h-full" camera={PICKER_CAMERA} />
    </div>
  )
}
