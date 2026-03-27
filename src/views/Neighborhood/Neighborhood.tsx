/** Neighborhood Profiles — cross-dataset civic pulse for 41 SF neighborhoods */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useAppStore } from '@/stores/appStore'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { MapLoadingIndicator } from '@/components/ui/Skeleton'
import { useNeighborhoodProfiles } from './useNeighborhoodProfiles'
import NeighborhoodSidebar from './NeighborhoodSidebar'
import {
  NEIGHBORHOOD_CHOROPLETH_LAYERS,
  NEIGHBORHOOD_SELECTION_LAYERS,
  buildZScoreColorExpression,
} from './neighborhoodMapLayers'

export default function Neighborhood() {
  const dateRange = useAppStore((s) => s.dateRange)
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapRef = useRef<MapHandle>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNeighborhood = searchParams.get('nh') || null

  const { profiles, profileMap, isLoading } = useNeighborhoodProfiles(dateRange)
  const { boundaries } = useNeighborhoodBoundaries()

  const setSelectedNeighborhood = useCallback(
    (name: string | null) => {
      setSearchParams((prev) => {
        if (name) prev.set('nh', name)
        else prev.delete('nh')
        return prev
      }, { replace: true })
    },
    [setSearchParams]
  )

  // Fly to selected neighborhood
  useEffect(() => {
    if (!mapInstance || !selectedNeighborhood) return
    const profile = profileMap.get(selectedNeighborhood)
    if (profile) {
      mapInstance.flyTo({
        center: [profile.centerLng, profile.centerLat],
        zoom: 14,
        duration: 1200,
        essential: true,
      })
    }
  }, [mapInstance, selectedNeighborhood, profileMap])

  // Reset map when deselecting
  useEffect(() => {
    if (!mapInstance || selectedNeighborhood) return
    mapInstance.flyTo({
      center: [-122.4394, 37.7549],
      zoom: 11.8,
      duration: 800,
    })
  }, [mapInstance, selectedNeighborhood])

  // Update choropleth colors when data loads
  useEffect(() => {
    if (!mapInstance || profileMap.size === 0) return
    const expr = buildZScoreColorExpression(profileMap)
    try {
      mapInstance.setPaintProperty('nh-choropleth-fill', 'fill-color', expr)
    } catch { /* layer not ready */ }
  }, [mapInstance, profileMap])

  // Update selection highlight
  useEffect(() => {
    if (!mapInstance) return
    const filter: any = selectedNeighborhood
      ? ['==', 'nhood', selectedNeighborhood]
      : ['==', 'nhood', '']
    try {
      mapInstance.setFilter('nh-selection-fill', filter)
      mapInstance.setFilter('nh-selection-outline', filter)
    } catch { /* layers not ready */ }
  }, [mapInstance, selectedNeighborhood])

  // Map layers
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, NEIGHBORHOOD_CHOROPLETH_LAYERS)
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, NEIGHBORHOOD_SELECTION_LAYERS)

  // Click handler
  useEffect(() => {
    if (!mapInstance) return
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const name = e.features?.[0]?.properties?.nhood as string | undefined
      if (name) setSelectedNeighborhood(selectedNeighborhood === name ? null : name)
    }
    mapInstance.on('click', 'nh-choropleth-fill', handler)

    // Cursor
    const enter = () => { mapInstance.getCanvas().style.cursor = 'pointer' }
    const leave = () => { mapInstance.getCanvas().style.cursor = '' }
    mapInstance.on('mouseenter', 'nh-choropleth-fill', enter)
    mapInstance.on('mouseleave', 'nh-choropleth-fill', leave)

    return () => {
      mapInstance.off('click', 'nh-choropleth-fill', handler)
      mapInstance.off('mouseenter', 'nh-choropleth-fill', enter)
      mapInstance.off('mouseleave', 'nh-choropleth-fill', leave)
    }
  }, [mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  // Tooltip
  useMapTooltip(mapInstance, 'nh-choropleth-fill', (props) => {
    const profile = profileMap.get(props.nhood as string)
    if (!profile) return `<div class="tooltip-value">${props.nhood}</div>`
    const zColor = profile.compositeZScore > 1 ? '#ef4444' : profile.compositeZScore < -1 ? '#60a5fa' : '#94a3b8'
    return `
      <div class="tooltip-value" style="font-size:13px">${props.nhood}</div>
      <div style="display:flex;gap:12px;margin-top:6px;font-size:10px;font-family:Space Mono,monospace">
        <span style="color:#94a3b8">${profile.totalEvents.toLocaleString()} events</span>
        <span style="color:${zColor}">${profile.compositeZScore >= 0 ? '+' : ''}${profile.compositeZScore.toFixed(1)}σ</span>
        ${profile.anomalyCount > 0 ? `<span style="color:#fbbf24">${profile.anomalyCount} anomal${profile.anomalyCount === 1 ? 'y' : 'ies'}</span>` : ''}
      </div>
    `
  })

  return (
    <div className="flex h-full">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          ref={mapRef}
          onMapReady={(map) => {
            setMapInstance(map)
            // Zoom out to show all neighborhoods
            map.flyTo({ center: [-122.4394, 37.7549], zoom: 11.8, duration: 0 })
          }}
        />
        {isLoading && <MapLoadingIndicator label="Loading 5 datasets..." />}

        {/* Title overlay */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h1 className="text-[28px] font-display italic text-white drop-shadow-lg leading-none">
            Neighborhoods
          </h1>
          <p className="text-[11px] font-mono text-slate-400/80 mt-1">
            Cross-dataset civic pulse across 41 neighborhoods
          </p>
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 left-4 z-10 glass-card rounded-xl px-3 py-2">
          <p className="text-[8px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-1.5">
            Composite Z-Score
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono text-blue-400">Low</span>
            <div className="flex h-2 rounded-full overflow-hidden">
              {['#3b82f6', '#60a5fa', '#475569', '#475569', '#fbbf24', '#f97316', '#ef4444'].map((c, i) => (
                <div key={i} className="w-4 h-full" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="text-[8px] font-mono text-red-400">High</span>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <NeighborhoodSidebar
        profiles={profiles}
        selectedNeighborhood={selectedNeighborhood}
        onSelectNeighborhood={setSelectedNeighborhood}
        isLoading={isLoading}
      />
    </div>
  )
}
