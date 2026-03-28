/** Neighborhood Profiles — cross-dataset civic pulse for 41 SF neighborhoods */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useAppStore } from '@/stores/appStore'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { MapLoadingIndicator } from '@/components/ui/Skeleton'
import { useNeighborhoodProfiles } from './useNeighborhoodProfiles'
import { useNeighborhoodPortrait } from './useNeighborhoodPortrait'
import DiveInOverlay from './DiveInOverlay'
import NeighborhoodSidebar from './NeighborhoodSidebar'
import {
  NEIGHBORHOOD_CHOROPLETH_LAYERS,
  NEIGHBORHOOD_SELECTION_LAYERS,
  buildZScoreColorExpression,
  makeSlotLayers,
} from './neighborhoodMapLayers'
import { DOMAINS, SLOT_COLORS } from './types'

export default function Neighborhood() {
  const dateRange = useAppStore((s) => s.dateRange)
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapRef = useRef<MapHandle>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNeighborhood = searchParams.get('nh') || null

  // Comparison state
  const [compareMode, setCompareMode] = useState(() => searchParams.has('compare'))
  const [compareSet, setCompareSet] = useState<string[]>(() => {
    const param = searchParams.get('compare')
    return param ? param.split(',').map(decodeURIComponent).filter(Boolean).slice(0, 3) : []
  })

  const { profiles, profileMap, isLoading } = useNeighborhoodProfiles(dateRange)
  const { boundaries } = useNeighborhoodBoundaries()
  const portrait = useNeighborhoodPortrait(selectedNeighborhood, dateRange)

  // Portrait points → GeoJSON per domain for map layers
  const portraitGeojsonByDomain = useMemo(() => {
    const map = new Map<string, GeoJSON.FeatureCollection>()
    for (const domain of DOMAINS) {
      const features = portrait.points
        .filter((p) => p.domain === domain.key)
        .map((p) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
          properties: { label: p.label, detail: p.detail, value: p.value || '', domain: p.domain },
        }))
      map.set(domain.key, { type: 'FeatureCollection' as const, features })
    }
    return map
  }, [portrait.points])

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

  // URL sync for compareSet
  useEffect(() => {
    setSearchParams((prev) => {
      if (compareMode && compareSet.length > 0) {
        prev.set('compare', compareSet.map(encodeURIComponent).join(','))
        prev.delete('nh')
      } else {
        prev.delete('compare')
      }
      return prev
    }, { replace: true })
  }, [compareMode, compareSet, setSearchParams])

  // Comparison callbacks
  const toggleCompare = useCallback(() => {
    setCompareMode((prev) => {
      if (prev) setCompareSet([])
      return !prev
    })
  }, [])

  const addToCompare = useCallback((name: string) => {
    setCompareSet((prev) => {
      if (prev.includes(name) || prev.length >= 3) return prev
      return [...prev, name]
    })
  }, [])

  const removeFromCompare = useCallback((name: string) => {
    setCompareSet((prev) => prev.filter((n) => n !== name))
  }, [])

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

  // Update selection highlight (only when NOT in compare mode)
  useEffect(() => {
    if (!mapInstance) return
    const filter: any = !compareMode && selectedNeighborhood
      ? ['==', 'nhood', selectedNeighborhood]
      : ['==', 'nhood', '']
    try {
      mapInstance.setFilter('nh-selection-fill', filter)
      mapInstance.setFilter('nh-selection-outline', filter)
    } catch { /* layers not ready */ }
  }, [mapInstance, selectedNeighborhood, compareMode])

  // Map layers
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, NEIGHBORHOOD_CHOROPLETH_LAYERS)
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, NEIGHBORHOOD_SELECTION_LAYERS)

  // Comparison slot layers
  const slot0Layers = useMemo(() => makeSlotLayers(0, SLOT_COLORS[0].hex), [])
  const slot1Layers = useMemo(() => makeSlotLayers(1, SLOT_COLORS[1].hex), [])
  const slot2Layers = useMemo(() => makeSlotLayers(2, SLOT_COLORS[2].hex), [])
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, slot0Layers)
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, slot1Layers)
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, slot2Layers)

  // Portrait circle layers — one per domain with domain color
  const erGeojson = portrait.isActive ? portraitGeojsonByDomain.get('emergency') ?? null : null
  const crimeGeojson = portrait.isActive ? portraitGeojsonByDomain.get('crime') ?? null : null
  const cases311Geojson = portrait.isActive ? portraitGeojsonByDomain.get('cases311') ?? null : null
  const crashesGeojson = portrait.isActive ? portraitGeojsonByDomain.get('crashes') ?? null : null
  const citationsGeojson = portrait.isActive ? portraitGeojsonByDomain.get('citations') ?? null : null

  const erLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-emergency', type: 'circle', source: 'portrait-emergency', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8], 'circle-color': '#ef4444', 'circle-opacity': 0.75, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const crimeLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-crime', type: 'circle', source: 'portrait-crime', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8], 'circle-color': '#f97316', 'circle-opacity': 0.75, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const cases311MapLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-cases311', type: 'circle', source: 'portrait-cases311', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8], 'circle-color': '#3b82f6', 'circle-opacity': 0.75, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const crashesMapLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-crashes', type: 'circle', source: 'portrait-crashes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 10], 'circle-color': '#eab308', 'circle-opacity': 0.8, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const citationsMapLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-citations', type: 'circle', source: 'portrait-citations', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 6], 'circle-color': '#06b6d4', 'circle-opacity': 0.65, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])

  useMapLayer(mapInstance, 'portrait-emergency', erGeojson, erLayers)
  useMapLayer(mapInstance, 'portrait-crime', crimeGeojson, crimeLayers)
  useMapLayer(mapInstance, 'portrait-cases311', cases311Geojson, cases311MapLayers)
  useMapLayer(mapInstance, 'portrait-crashes', crashesGeojson, crashesMapLayers)
  useMapLayer(mapInstance, 'portrait-citations', citationsGeojson, citationsMapLayers)

  // Update comparison slot filters
  useEffect(() => {
    if (!mapInstance) return
    for (let i = 0; i < 3; i++) {
      const name = compareMode ? (compareSet[i] || '') : ''
      const filter: any = ['==', 'nhood', name]
      try {
        mapInstance.setFilter(`nh-compare-fill-${i}`, filter)
        mapInstance.setFilter(`nh-compare-outline-${i}`, filter)
      } catch { /* layers not ready */ }
    }
  }, [mapInstance, compareMode, compareSet])

  // Fit bounds to compared neighborhoods
  useEffect(() => {
    if (!mapInstance || !compareMode || compareSet.length < 2 || !boundaries) return
    const coords: [number, number][] = []
    for (const feature of boundaries.features) {
      const name = feature.properties?.nhood
      if (!compareSet.includes(name)) continue
      const geom = feature.geometry as any
      const extractCoords = (c: any): void => {
        if (typeof c[0] === 'number') coords.push(c as [number, number])
        else c.forEach(extractCoords)
      }
      extractCoords(geom.coordinates)
    }
    if (coords.length === 0) return
    const lngs = coords.map((c) => c[0])
    const lats = coords.map((c) => c[1])
    mapInstance.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 800 }
    )
  }, [mapInstance, compareMode, compareSet, boundaries])

  // Click handler
  useEffect(() => {
    if (!mapInstance) return
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const name = e.features?.[0]?.properties?.nhood as string | undefined
      if (!name) return
      if (compareMode) {
        if (compareSet.includes(name)) removeFromCompare(name)
        else if (compareSet.length < 3) addToCompare(name)
      } else {
        setSelectedNeighborhood(selectedNeighborhood === name ? null : name)
      }
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
  }, [mapInstance, selectedNeighborhood, setSelectedNeighborhood, compareMode, compareSet, addToCompare, removeFromCompare])

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

  // Portrait point tooltips
  const portraitTooltipFn = useCallback((props: Record<string, unknown>) => {
    const domainConfig = DOMAINS.find((d) => d.key === props.domain)
    const color = domainConfig?.color || '#94a3b8'
    return `
      <div class="tooltip-value" style="color:${color}">${props.label}</div>
      ${props.detail ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px">${props.detail}</div>` : ''}
      ${props.value ? `<div style="color:${color};font-size:11px;font-weight:600;margin-top:2px">${props.value}</div>` : ''}
    `
  }, [])

  useMapTooltip(mapInstance, 'portrait-emergency', portraitTooltipFn)
  useMapTooltip(mapInstance, 'portrait-crime', portraitTooltipFn)
  useMapTooltip(mapInstance, 'portrait-cases311', portraitTooltipFn)
  useMapTooltip(mapInstance, 'portrait-crashes', portraitTooltipFn)
  useMapTooltip(mapInstance, 'portrait-citations', portraitTooltipFn)

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
        {portrait.loading && (
          <DiveInOverlay loadedDomains={portrait.loadedDomains} loading={portrait.loading} />
        )}

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
        profileMap={profileMap}
        selectedNeighborhood={selectedNeighborhood}
        onSelectNeighborhood={setSelectedNeighborhood}
        isLoading={isLoading}
        compareMode={compareMode}
        onToggleCompare={toggleCompare}
        compareSet={compareSet}
        onAddToCompare={addToCompare}
        onRemoveFromCompare={removeFromCompare}
        onDiveIn={portrait.diveIn}
        isDiveInActive={portrait.isActive}
        isDiveInLoading={portrait.loading}
      />
    </div>
  )
}
