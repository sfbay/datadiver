/** ChainMap — small map showing every location of a chain as a colored
 *  circle (green active, red closed). Auto-fits bounds to the cluster. Lets
 *  the journalist see "where Boudin is" at a glance. */

import { useState, useCallback, useMemo } from 'react'
import type mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { extractCoordinates } from '@/utils/geo'
import type { BusinessLocationRecord } from '@/types/datasets'

interface ChainMapProps {
  locations: BusinessLocationRecord[]
  height?: number
}

export default function ChainMap({ locations, height = 280 }: ChainMapProps) {
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)

  const points = useMemo(() => {
    return locations
      .map((l) => {
        const coords = extractCoordinates(l.location)
        if (!coords) return null
        return {
          uniqueId: l.uniqueid,
          dbaName: l.dba_name || 'Unknown',
          address: l.full_business_address || '',
          isActive: !l.dba_end_date,
          startYear: l.dba_start_date?.split('T')[0]?.slice(0, 4) || '',
          endYear: l.dba_end_date?.split('T')[0]?.slice(0, 4) || null,
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
  }, [locations])

  const handleReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
    if (points.length === 0) return
    if (points.length === 1) {
      map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 15 })
      return
    }
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat
      if (p.lat > maxLat) maxLat = p.lat
      if (p.lng < minLng) minLng = p.lng
      if (p.lng > maxLng) maxLng = p.lng
    }
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: 50, maxZoom: 14, duration: 0,
    })
  }, [points])

  const geojson = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (points.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { ...p },
      })),
    }
  }, [points])

  useMapLayer(mapInstance, 'chain-locations', geojson, [
    {
      id: 'chain-points',
      type: 'circle',
      source: 'chain-locations',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 8, 17, 12],
        'circle-color': [
          'case',
          ['get', 'isActive'], '#10b981',
          '#ef4444',
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.5)',
        'circle-opacity': 0.9,
      },
    } as mapboxgl.AnyLayer,
  ])

  useMapTooltip(mapInstance, 'chain-points', (props) => {
    const status = props.isActive
      ? `<span style="color:#10b981;font-weight:600">Active since ${props.startYear}</span>`
      : `<span style="color:#ef4444;font-weight:600">Closed ${props.endYear}</span>`
    return `
      <div class="tooltip-value">${props.dbaName}</div>
      <div style="margin-top:4px;font-size:10px">${status}</div>
      <div style="color:#94a3b8;font-size:10px;margin-top:2px">${props.address}</div>
    `
  })

  if (points.length === 0) {
    return (
      <div
        className="glass-card rounded-xl flex items-center justify-center text-[11px] text-slate-500"
        style={{ height }}
      >
        No mapped locations available
      </div>
    )
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden" style={{ height }}>
      <MapView onMapReady={handleReady} />
    </div>
  )
}
