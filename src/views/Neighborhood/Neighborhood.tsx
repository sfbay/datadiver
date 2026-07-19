/** Neighborhood Profiles — cross-dataset civic pulse for 41 SF neighborhoods */

import { useState, useEffect, useCallback, useRef, useMemo, type SetStateAction } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
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
import { DOMAINS, SLOT_COLORS, DOMAIN_ROUTES } from './types'
import type { MetricDomain } from './types'
import type { PortraitPoint } from './useNeighborhoodPortrait'

export default function Neighborhood() {
  const navigate = useNavigate()
  const dateRange = useAppStore((s) => s.dateRange)
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapRef = useRef<MapHandle>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNeighborhood = searchParams.get('nh') || null

  // Comparison state
  const [compareMode, setCompareMode] = useState(() => searchParams.has('nhcmp'))
  const [compareSet, setCompareSet] = useState<string[]>(() => {
    const param = searchParams.get('nhcmp')
    return param ? param.split(',').map(decodeURIComponent).filter(Boolean).slice(0, 3) : []
  })

  const { profiles, profileMap, isLoading } = useNeighborhoodProfiles(dateRange)
  const { boundaries } = useNeighborhoodBoundaries()
  const portrait = useNeighborhoodPortrait(selectedNeighborhood, dateRange)

  // Selected portrait point (click-to-inspect)
  const [selectedPoint, setSelectedPoint] = useState<PortraitPoint | null>(null)
  const portraitClickConsumed = useRef(false)  // prevents choropleth handler from firing on portrait dot clicks

  // Domain visibility toggle (controls which portrait layers show on map)
  const [visibleDomains, setVisibleDomains] = useState<Set<MetricDomain>>(() => new Set(DOMAINS.map((d) => d.key)))
  const toggleDomain = useCallback((domain: MetricDomain) => {
    setVisibleDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }, [])

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
        prev.set('nhcmp', compareSet.map(encodeURIComponent).join(','))
        prev.delete('nh')
      } else {
        prev.delete('nhcmp')
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

  const focusNeighborhood = useCallback((name: string) => {
    const profile = profileMap.get(name)
    if (profile && mapInstance) {
      mapInstance.flyTo({ center: [profile.centerLng, profile.centerLat], zoom: 14, duration: 1200 })
    }
    // Set as selected so portrait can load for it
    setSearchParams((prev) => {
      prev.set('nh', name)
      return prev
    }, { replace: true })
  }, [profileMap, mapInstance, setSearchParams])

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

  // Update selection highlight + dim layer (only when NOT in compare mode)
  useEffect(() => {
    if (!mapInstance) return
    const hasSelection = !compareMode && !!selectedNeighborhood
    const selFilter: any = hasSelection
      ? ['==', 'nhood', selectedNeighborhood]
      : ['==', 'nhood', '']
    // Dim filter: darken everything EXCEPT selected (or nothing when no selection)
    const dimFilter: any = hasSelection
      ? ['!=', 'nhood', selectedNeighborhood]
      : ['==', 'nhood', '__none__']  // match nothing
    try {
      mapInstance.setFilter('nh-selection-fill', selFilter)
      mapInstance.setFilter('nh-selection-glow', selFilter)
      mapInstance.setFilter('nh-selection-outline', selFilter)
      mapInstance.setFilter('nh-dim-fill', dimFilter)
      mapInstance.setPaintProperty('nh-dim-fill', 'fill-opacity', hasSelection ? 0.45 : 0)
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
  const erGeojson = portrait.isActive && visibleDomains.has('emergency') ? portraitGeojsonByDomain.get('emergency') ?? null : null
  const crimeGeojson = portrait.isActive && visibleDomains.has('crime') ? portraitGeojsonByDomain.get('crime') ?? null : null
  const cases311Geojson = portrait.isActive && visibleDomains.has('cases311') ? portraitGeojsonByDomain.get('cases311') ?? null : null
  const crashesGeojson = portrait.isActive && visibleDomains.has('crashes') ? portraitGeojsonByDomain.get('crashes') ?? null : null
  const citationsGeojson = portrait.isActive && visibleDomains.has('citations') ? portraitGeojsonByDomain.get('citations') ?? null : null

  const erLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-emergency', type: 'circle', source: 'portrait-emergency', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8], 'circle-color': '#b85545', 'circle-opacity': 0.75, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const crimeLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-crime', type: 'circle', source: 'portrait-crime', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8], 'circle-color': '#d47149', 'circle-opacity': 0.75, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const cases311MapLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-cases311', type: 'circle', source: 'portrait-cases311', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8], 'circle-color': '#3f7573', 'circle-opacity': 0.75, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const crashesMapLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-crashes', type: 'circle', source: 'portrait-crashes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 10], 'circle-color': '#eab308', 'circle-opacity': 0.8, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])
  const citationsMapLayers = useMemo((): mapboxgl.AnyLayer[] => [{ id: 'portrait-citations', type: 'circle', source: 'portrait-citations', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 6], 'circle-color': '#5c9693', 'circle-opacity': 0.65, 'circle-stroke-color': 'rgba(0,0,0,0.5)', 'circle-stroke-width': 1 } } as mapboxgl.AnyLayer], [])

  useMapLayer(mapInstance, 'portrait-emergency', erGeojson, erLayers)
  useMapLayer(mapInstance, 'portrait-crime', crimeGeojson, crimeLayers)
  useMapLayer(mapInstance, 'portrait-cases311', cases311Geojson, cases311MapLayers)
  useMapLayer(mapInstance, 'portrait-crashes', crashesGeojson, crashesMapLayers)
  useMapLayer(mapInstance, 'portrait-citations', citationsGeojson, citationsMapLayers)

  // Update comparison slot filters + dim layer
  useEffect(() => {
    if (!mapInstance) return
    const hasCompare = compareMode && compareSet.length > 0
    for (let i = 0; i < 3; i++) {
      const name = compareMode ? (compareSet[i] || '') : ''
      const filter: any = ['==', 'nhood', name]
      try {
        mapInstance.setFilter(`nh-compare-fill-${i}`, filter)
        mapInstance.setFilter(`nh-compare-glow-${i}`, filter)
        mapInstance.setFilter(`nh-compare-outline-${i}`, filter)
      } catch { /* layers not ready */ }
    }
    // Dim non-compared neighborhoods
    try {
      const dimFilter: any = hasCompare
        ? ['!', ['in', ['get', 'nhood'], ['literal', compareSet]]]
        : ['==', 'nhood', '__none__']
      mapInstance.setFilter('nh-dim-fill', dimFilter)
      mapInstance.setPaintProperty('nh-dim-fill', 'fill-opacity', hasCompare ? 0.45 : 0)
    } catch { /* layers not ready */ }
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

  // Click handler (choropleth)
  useEffect(() => {
    if (!mapInstance) return
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      // Skip if a portrait dot click already consumed this event
      if (portraitClickConsumed.current) return
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
    const zColor = profile.compositeZScore > 1 ? '#b85545' : profile.compositeZScore < -1 ? '#5c9693' : '#94a3b8'
    return `
      <div class="tooltip-value" style="font-size:13px">${props.nhood}</div>
      <div style="display:flex;gap:12px;margin-top:6px;font-size:10px;font-family:Space Mono,monospace">
        <span style="color:#94a3b8">${profile.totalEvents.toLocaleString()} events</span>
        <span style="color:${zColor}">${profile.compositeZScore >= 0 ? '+' : ''}${profile.compositeZScore.toFixed(1)}σ</span>
        ${profile.anomalyCount > 0 ? `<span style="color:#e8c06b">${profile.anomalyCount} anomal${profile.anomalyCount === 1 ? 'y' : 'ies'}</span>` : ''}
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

  // Portrait point click → select for detail card
  useEffect(() => {
    if (!mapInstance) return
    const layerIds = ['portrait-emergency', 'portrait-crime', 'portrait-cases311', 'portrait-crashes', 'portrait-citations']
    const handler = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const props = e.features?.[0]?.properties
      if (!props) return
      // Mark click as consumed so choropleth handler doesn't deselect the neighborhood
      portraitClickConsumed.current = true
      setTimeout(() => { portraitClickConsumed.current = false }, 50)
      const point: PortraitPoint = {
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
        domain: props.domain as MetricDomain,
        label: props.label as string,
        detail: props.detail as string,
        value: (props.value as string) || undefined,
      }
      setSelectedPoint((prev) => prev?.lat === point.lat && prev?.lng === point.lng ? null : point)
    }
    for (const id of layerIds) {
      try { mapInstance.on('click', id, handler) } catch { /* layer not ready */ }
    }
    return () => {
      for (const id of layerIds) {
        try { mapInstance.off('click', id, handler) } catch { /* ok */ }
      }
    }
  }, [mapInstance])

  // Clear selected point when portrait deactivates
  useEffect(() => {
    if (!portrait.isActive) setSelectedPoint(null)
  }, [portrait.isActive])

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

        {/* Portrait point detail card */}
        {selectedPoint && (() => {
          const domainConfig = DOMAINS.find((d) => d.key === selectedPoint.domain)
          const color = domainConfig?.color || '#94a3b8'
          return (
            <div className="absolute bottom-20 left-4 z-20 glass-card rounded-xl px-4 py-3 max-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-nano font-mono uppercase tracking-wider" style={{ color }}>
                      {domainConfig?.label}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-ink dark:text-white leading-tight">{selectedPoint.label}</p>
                  {selectedPoint.detail && (
                    <p className="text-micro text-slate-400 font-mono italic mt-1">{selectedPoint.detail}</p>
                  )}
                  {selectedPoint.value && (
                    <p className="text-[12px] font-mono font-semibold mt-1" style={{ color }}>
                      {selectedPoint.value}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedPoint(null)}
                  className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0 mt-0.5"
                >
                  ✕
                </button>
              </div>
              {domainConfig && selectedNeighborhood && (
                <button
                  onClick={() => navigate(`${DOMAIN_ROUTES[selectedPoint.domain]}?neighborhood=${encodeURIComponent(selectedNeighborhood)}`)}
                  className="mt-2 text-nano font-mono hover:brightness-125 transition-all"
                  style={{ color }}
                >
                  Open in {domainConfig.label} →
                </button>
              )}
            </div>
          )
        })()}

        {/* Title overlay */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h1 className="text-[28px] font-display italic text-white drop-shadow-lg leading-none">
            Neighborhoods
          </h1>
          <p className="text-label font-mono text-slate-400/80 mt-1">
            Cross-dataset civic pulse across {profiles.length} neighborhoods
          </p>
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 left-4 z-10 glass-card rounded-xl px-3 py-2">
          <p className="text-[8px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-1.5">
            Composite Z-Score
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono text-teal-500">Low</span>
            <div className="flex h-2 rounded-full overflow-hidden">
              {['#3f7573', '#5c9693', '#475569', '#475569', '#e8c06b', '#d47149', '#b85545'].map((c, i) => (
                <div key={i} className="w-4 h-full" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="text-[8px] font-mono text-brick-400">High</span>
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
        onFocusNeighborhood={focusNeighborhood}
        visibleDomains={visibleDomains}
        onToggleDomain={toggleDomain}
      />
    </div>
  )
}
