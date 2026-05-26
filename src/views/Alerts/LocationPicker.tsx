// src/views/Alerts/LocationPicker.tsx
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import type { AlertLocation } from '@/lib/alerts/types'

// Slightly north of SF_CENTER so the picker frames the full peninsula —
// Twin Peaks roughly center, Golden Gate Bridge visible, down to Daly City.
const PICKER_CAMERA = { center: { lat: 37.7600, lng: -122.4400 }, zoom: 11.5 }

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

export function LocationPicker({
  locations, radiusMiles, onAdd, onRemove,
}: {
  locations: AlertLocation[]
  radiusMiles: number
  onAdd: (l: AlertLocation) => void
  onRemove: (i: number) => void
}) {
  const mapRef = useRef<MapHandle>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([])

  function handleReady(map: mapboxgl.Map) {
    map.on('click', (e) => onAdd({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
  }

  // Render markers + radius circles whenever locations/radius change.
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
      map.addLayer({ id: 'alert-radii-fill', type: 'fill', source: 'alert-radii', paint: { 'fill-color': '#5c9693', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'alert-radii-line', type: 'line', source: 'alert-radii', paint: { 'line-color': '#5c9693', 'line-width': 1.5 } })
    }
    return () => {
      markers.current.forEach((m) => m.remove())
      markers.current = []
    }
  }, [locations, radiusMiles])

  async function search() {
    if (!query.trim()) return
    const token = import.meta.env.VITE_MAPBOX_TOKEN
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
    url.searchParams.set('q', query)
    url.searchParams.set('access_token', token)
    url.searchParams.set('proximity', `${PICKER_CAMERA.center.lng},${PICKER_CAMERA.center.lat}`)
    url.searchParams.set('bbox', '-123.0,37.6,-122.3,37.85')
    url.searchParams.set('limit', '5')
    const res = await fetch(url)
    if (!res.ok) return
    const j = (await res.json()) as { features: { properties: { full_address?: string; name?: string }; geometry: { coordinates: [number, number] } }[] }
    setResults(j.features.map((f) => ({
      name: f.properties.full_address || f.properties.name || 'Result',
      lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    })))
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
          placeholder="Search an address…" aria-label="Search an address" className="flex-1 rounded-md border border-ink/20 dark:border-white/[0.15] bg-paper dark:bg-espresso-800 px-3 py-2 text-sm text-ink dark:text-paper-100" />
        <button type="button" onClick={search} className="rounded-md border border-ink/20 dark:border-white/[0.15] px-3 py-2 text-sm text-ink/70 dark:text-slate-300">Search</button>
      </div>
      {results.length > 0 && (
        <ul className="mt-1 rounded-md border border-ink/15 dark:border-white/[0.10] bg-paper-100 dark:bg-espresso-800 text-sm text-ink dark:text-paper-100">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => { onAdd({ label: r.name, lat: r.lat, lng: r.lng }); setResults([]); setQuery('') }}
                className="block w-full px-3 py-2 text-left hover:bg-ink/5 dark:hover:bg-white/[0.06]">{r.name}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 h-72 overflow-hidden rounded-lg">
        <MapView ref={mapRef} onMapReady={handleReady} className="w-full h-full" camera={PICKER_CAMERA} />
      </div>
      <p className="mt-1 text-xs text-ink/50 dark:text-slate-500">Click the map to drop a pin, or search an address.</p>
      {locations.length > 0 && (
        <ul className="mt-2 space-y-1">
          {locations.map((l, i) => (
            <li key={i} className="flex items-center justify-between rounded-md bg-paper-100 dark:bg-espresso-800 px-3 py-2 text-sm text-ink dark:text-paper-100">
              <span>{l.label || `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}</span>
              <button type="button" onClick={() => onRemove(i)} className="text-ink/50 dark:text-slate-500 hover:text-brick-500">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
