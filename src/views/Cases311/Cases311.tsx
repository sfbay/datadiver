import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { use311HourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { use311ComparisonData } from '@/hooks/useComparisonDataFactory'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useAppStore } from '@/stores/appStore'
import type { Cases311Record, ServiceCategoryAggRow, NeighborhoodAggRow311 } from '@/types/datasets'
import { diffHours, formatResolution, formatDelta, formatNumber, formatHour } from '@/utils/time'
import { coordsFromFields, extractCoordinates } from '@/utils/geo'
import { resolutionTimeColor } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import StatCard from '@/components/ui/StatCard'
import ResolutionHistogram from '@/components/charts/ResolutionHistogram'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import ServiceCategoryFilter from '@/components/filters/ServiceCategoryFilter'
import CaseDetailPanel from '@/components/ui/CaseDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { SkeletonStatCards, SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'categories' | 'neighborhoods'

const SELECT_FIELDS = 'service_request_id,requested_datetime,closed_date,status_description,service_name,service_subtype,address,lat,long,analysis_neighborhood,supervisor_district,source,point'

export default function Cases311() {
  const { dateRange, timeOfDayFilter, comparisonPeriod, selected311Case, setSelected311Case } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('categories')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel from URL on mount
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelected311Case(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync detail selection → URL param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selected311Case) next.set('detail', selected311Case)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selected311Case, setSearchParams])

  // View-local state from URL params
  const mapMode = (searchParams.get('map_mode') as MapMode) || 'heatmap'
  const selectedCategories = useMemo(() => {
    const param = searchParams.get('categories')
    if (!param) return new Set<string>()
    return new Set(param.split(',').map(decodeURIComponent))
  }, [searchParams])
  const selectedNeighborhood = searchParams.get('neighborhood') || null

  const setMapMode = useCallback((mode: MapMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === 'heatmap') next.delete('map_mode')
      else next.set('map_mode', mode)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedCategories = useCallback((cats: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (cats.size === 0) next.delete('categories')
      else next.set('categories', Array.from(cats).map(encodeURIComponent).join(','))
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedNeighborhood = useCallback((n: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!n) next.delete('neighborhood')
      else next.set('neighborhood', n)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // --- WHERE clause construction ---
  const categoryClause = useMemo(() => {
    if (selectedCategories.size === 0) return ''
    const escaped = Array.from(selectedCategories).map((c) => `'${c.replace(/'/g, "''")}'`)
    return `service_name IN (${escaped.join(',')})`
  }, [selectedCategories])

  const whereClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`requested_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`requested_datetime <= '${dateRange.end}T23:59:59'`)
    if (categoryClause) conditions.push(categoryClause)
    if (selectedNeighborhood) {
      conditions.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    }
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(requested_datetime) >= ${startHour} AND date_extract_hh(requested_datetime) <= ${endHour}`)
      } else {
        conditions.push(`(date_extract_hh(requested_datetime) >= ${startHour} OR date_extract_hh(requested_datetime) <= ${endHour})`)
      }
    }
    return conditions.join(' AND ')
  }, [dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter])

  // Date-only clause (for category aggregation — excludes category filter)
  const dateOnlyClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`requested_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`requested_datetime <= '${dateRange.end}T23:59:59'`)
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(requested_datetime) >= ${startHour} AND date_extract_hh(requested_datetime) <= ${endHour}`)
      } else {
        conditions.push(`(date_extract_hh(requested_datetime) >= ${startHour} OR date_extract_hh(requested_datetime) <= ${endHour})`)
      }
    }
    return conditions.join(' AND ')
  }, [dateRange, timeOfDayFilter])

  const freshness = useDataFreshness('cases311', 'requested_datetime', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'cases311',
    dateField: 'requested_datetime',
    neighborhoodField: 'analysis_neighborhood',
  }), [])
  const trendExtraWhere = useMemo(() => {
    const parts: string[] = []
    if (categoryClause) parts.push(categoryClause)
    if (selectedNeighborhood) parts.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [categoryClause, selectedNeighborhood])
  const trend = useTrendBaseline(trendConfig, dateRange, trendExtraWhere)

  // --- Data queries ---
  const { data: rawData, isLoading, error, hitLimit } = useDataset<Cases311Record>(
    'cases311',
    { $where: whereClause, $limit: 5000, $select: SELECT_FIELDS },
    [whereClause]
  )

  // Total count query (lightweight, for truncation indicator)
  const { data: countRows } = useDataset<{ count: string }>(
    'cases311',
    { $select: 'count(*) as count', $where: whereClause },
    [whereClause]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

  const { data: categoryRows } = useDataset<ServiceCategoryAggRow>(
    'cases311',
    {
      $select: 'service_name, count(*) as case_count',
      $group: 'service_name',
      $where: dateOnlyClause,
      $order: 'case_count DESC',
      $limit: 50,
    },
    [dateOnlyClause]
  )

  const { data: neighborhoodRows } = useDataset<NeighborhoodAggRow311>(
    'cases311',
    {
      $select: 'analysis_neighborhood, count(*) as case_count',
      $group: 'analysis_neighborhood',
      $where: whereClause,
      $order: 'case_count DESC',
      $limit: 50,
    },
    [whereClause]
  )

  // Hourly pattern
  const extraWhere = useMemo(() => {
    const parts: string[] = []
    if (categoryClause) parts.push(categoryClause)
    if (selectedNeighborhood) parts.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [categoryClause, selectedNeighborhood])

  const hourlyPattern = use311HourlyPattern(dateRange, extraWhere)

  // Comparison data
  const comparison = use311ComparisonData(dateRange, whereClause, comparisonPeriod, rawData)
  const compLabel = comparisonPeriod ? `vs ${comparisonPeriod >= 360 ? '1yr' : `${comparisonPeriod}d`} ago` : ''

  // Neighborhood boundaries for anomaly mode
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

  // --- Computed data ---
  const caseData = useMemo(() => {
    return rawData
      .map((record) => {
        const coords = coordsFromFields(record.lat, record.long) || extractCoordinates(record.point)
        if (!coords) return null
        const resolutionHours = record.closed_date
          ? diffHours(record.requested_datetime, record.closed_date)
          : null
        if (resolutionHours !== null && (resolutionHours < 0 || resolutionHours > 720)) return null
        return {
          requestId: record.service_request_id,
          requestedAt: record.requested_datetime,
          closedAt: record.closed_date || null,
          status: record.status_description || 'Unknown',
          serviceName: record.service_name || 'Unknown',
          serviceSubtype: record.service_subtype || '',
          neighborhood: record.analysis_neighborhood || 'Unknown',
          source: record.source || 'Unknown',
          resolutionHours,
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData])

  const stats = useMemo(() => {
    if (caseData.length === 0) return { totalCases: 0, avgResolution: 0, openCases: 0, peakHour: 0 }
    const closedTimes = caseData.filter((c) => c.resolutionHours !== null).map((c) => c.resolutionHours!)
    const avgResolution = closedTimes.length > 0 ? closedTimes.reduce((a, b) => a + b, 0) / closedTimes.length : 0
    const openCases = caseData.filter((c) => c.status === 'Open').length
    return { totalCases: caseData.length, avgResolution, openCases, peakHour: hourlyPattern.peakHour }
  }, [caseData, hourlyPattern.peakHour])

  const histogramData = useMemo(
    () => caseData.filter((c) => c.resolutionHours !== null).map((c) => c.resolutionHours!),
    [caseData]
  )

  const chartTiles = useMemo((): ChartTileDef[] => {
    const tiles: ChartTileDef[] = []
    if (histogramData.length > 0) {
      tiles.push({
        id: 'resolution-histogram',
        label: 'Resolution Time Distribution',
        shortLabel: 'Resolution',
        color: '#10b981',
        defaultExpanded: true,
        render: () => (
          <ResolutionHistogram data={histogramData} width={320} height={100} />
        ),
      })
    }
    if (comparisonPeriod !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend${comparison.isLoading ? ' (loading…)' : ''}`,
        shortLabel: 'Trend',
        color: '#60a5fa',
        defaultExpanded: true,
        render: () => (
          <TrendChart
            current={comparison.currentTrend}
            comparison={comparison.comparisonTrend.length > 0 ? comparison.comparisonTrend : undefined}
            width={320}
            height={110}
          />
        ),
      })
    }
    return tiles
  }, [histogramData, comparisonPeriod, comparison.currentTrend, comparison.comparisonTrend, comparison.isLoading])

  // Sidebar data
  const categoryEntries = useMemo(
    () => categoryRows.map((r) => ({ serviceName: r.service_name, count: parseInt(r.case_count, 10) || 0 })),
    [categoryRows]
  )

  const neighborhoodEntries = useMemo(() => {
    return neighborhoodRows
      .map((r) => ({
        neighborhood: r.analysis_neighborhood,
        caseCount: parseInt(r.case_count, 10) || 0,
      }))
      .filter((r) => r.neighborhood)
  }, [neighborhoodRows])

  // Z-score computation for anomaly mode
  const neighborhoodAnomalies = useMemo(() => {
    if (neighborhoodEntries.length === 0) return new Map<string, number>()
    const counts = neighborhoodEntries.map((n) => n.caseCount)
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length)
    if (stdDev === 0) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const n of neighborhoodEntries) {
      map.set(n.neighborhood, (n.caseCount - mean) / stdDev)
    }
    return map
  }, [neighborhoodEntries])

  // --- Map layers ---
  // Heatmap GeoJSON (point data)
  const heatmapGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || caseData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: caseData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          requestId: r.requestId,
          serviceName: r.serviceName,
          neighborhood: r.neighborhood,
          status: r.status,
          requestedAt: r.requestedAt,
          resolutionHours: r.resolutionHours,
        },
      })),
    }
  }, [caseData, mapMode])

  const heatmapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'cases-heat',
      type: 'heatmap',
      source: 'cases-heatmap-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(16, 185, 129, 0.2)',
          0.25, 'rgba(16, 185, 129, 0.4)',
          0.4, 'rgba(45, 212, 168, 0.55)',
          0.6, 'rgba(251, 191, 36, 0.6)',
          0.8, 'rgba(245, 158, 11, 0.7)',
          1, 'rgba(239, 68, 68, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'cases-points',
      type: 'circle',
      source: 'cases-heatmap-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
        'circle-color': '#10b981',
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.15)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Anomaly choropleth GeoJSON (neighborhood polygons with z-scores)
  const anomalyGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'anomaly' || !neighborhoodBoundaries || neighborhoodAnomalies.size === 0) return null
    return {
      type: 'FeatureCollection',
      features: neighborhoodBoundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          zScore: neighborhoodAnomalies.get(f.properties?.nhood ?? '') ?? 0,
          caseCount: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.caseCount ?? 0,
        },
      })),
    }
  }, [mapMode, neighborhoodBoundaries, neighborhoodAnomalies, neighborhoodEntries])

  const anomalyLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'neighborhood-fill',
      type: 'fill',
      source: 'neighborhood-anomaly',
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['get', 'zScore'],
          -2, '#3b82f6',
          -1, '#93c5fd',
          0, '#e2e8f0',
          1, '#fbbf24',
          2, '#ef4444',
          3, '#7f1d1d',
        ],
        'fill-opacity': 0.55,
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'neighborhood-outline',
      type: 'line',
      source: 'neighborhood-anomaly',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1,
        'line-opacity': 0.4,
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Bind layers reactively
  useMapLayer(mapInstance, 'cases-heatmap-data', heatmapGeojson, heatmapLayers)
  useMapLayer(mapInstance, 'neighborhood-anomaly', anomalyGeojson, anomalyLayers)

  // Heatmap tooltip
  useMapTooltip(mapInstance, 'cases-points', (props) => {
    const filedDate = props.requestedAt
      ? new Date(String(props.requestedAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const filedTime = props.requestedAt
      ? new Date(String(props.requestedAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    const resHours = props.resolutionHours ? Number(props.resolutionHours) : null
    const resLabel = resHours !== null ? formatResolution(resHours) : null
    return `
      ${filedDate ? `<div class="tooltip-label">Filed</div><div style="color:#e2e8f0">${filedDate} · ${filedTime}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Service</div>
      <div style="color:#e2e8f0">${props.serviceName || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Status</div>
      <div style="color:#94a3b8">${props.status || 'Unknown'}${resLabel ? ` · Resolved in ${resLabel}` : ''}</div>
    `
  })

  // Anomaly tooltip
  useMapTooltip(mapInstance, 'neighborhood-fill', (props) => {
    const zScore = Number(props.zScore).toFixed(1)
    const sign = Number(props.zScore) >= 0 ? '+' : ''
    return `
      <div class="tooltip-label">Neighborhood</div>
      <div class="tooltip-value">${props.nhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Complaint Anomaly</div>
      <div class="tooltip-value">${sign}${zScore}σ</div>
      <div class="tooltip-label" style="margin-top:6px">Cases</div>
      <div style="color:#94a3b8">${Number(props.caseCount).toLocaleString()}</div>
    `
  })

  // Neighborhood click in anomaly mode → filter
  useEffect(() => {
    if (!mapInstance || mapMode !== 'anomaly') return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const nhood = e.features[0].properties?.nhood
      if (nhood) {
        setSelectedNeighborhood(selectedNeighborhood === nhood ? null : nhood)
      }
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('neighborhood-fill')) {
          mapInstance.on('click', 'neighborhood-fill', handleClick)
          return true
        }
      } catch { /* layer not ready */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => {
        if (tryAttach()) clearInterval(interval)
      }, 500)
      return () => {
        clearInterval(interval)
        try { mapInstance.off('click', 'neighborhood-fill', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'neighborhood-fill', handleClick) } catch { /* */ }
    }
  }, [mapInstance, mapMode, selectedNeighborhood, setSelectedNeighborhood])

  // Click handler on case points for detail panel
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const feature = e.features[0]
      const requestId = feature.properties?.requestId
      if (!requestId) return
      setSelected311Case(String(requestId))
      const coords = (feature.geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800 })
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('cases-points')) {
          mapInstance.on('click', 'cases-points', handleClick)
          return true
        }
      } catch { /* layer not ready */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => {
        if (tryAttach()) clearInterval(interval)
      }, 500)
      return () => {
        clearInterval(interval)
        try { mapInstance.off('click', 'cases-points', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'cases-points', handleClick) } catch { /* */ }
    }
  }, [mapInstance, setSelected311Case])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === neighborhood ? null : neighborhood)
    // Fly to neighborhood center (compute from case data)
    const nhoodCases = caseData.filter((c) => c.neighborhood === neighborhood)
    if (nhoodCases.length > 0 && mapInstance) {
      const avgLat = nhoodCases.reduce((s, c) => s + c.lat, 0) / nhoodCases.length
      const avgLng = nhoodCases.reduce((s, c) => s + c.lng, 0) / nhoodCases.length
      mapInstance.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [caseData, mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                311 Cases
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SF311 &middot; Civic Complaint Analysis
              </p>
            </div>
            {!isLoading && caseData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-500/80 bg-emerald-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 pulse-live" />
                  {formatNumber(caseData.length)} records
                </span>
                {hitLimit && totalCount !== null && (
                  <span className="text-[10px] font-mono text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded-full">
                    of {formatNumber(totalCount)} total
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Map mode toggle */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['heatmap', 'anomaly'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMapMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    mapMode === mode
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {mode === 'heatmap' ? 'Heatmap' : 'Anomaly'}
                </button>
              ))}
            </div>
            <ComparisonToggle />
            <ExportButton targetSelector="#c311-capture" filename="311-cases" />
          </div>
        </div>
      </header>

      {/* Time-of-day filter sub-header */}
      {!hourlyPattern.isLoading && hourlyPattern.hourTotals.some((t) => t > 0) && (
        <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-2 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 whitespace-nowrap">
              Time of Day
            </p>
            <div className="flex-1">
              <TimeOfDayFilter hourTotals={hourlyPattern.hourTotals} />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div id="c311-capture" className="flex-1 overflow-hidden flex">
        {/* Map hero */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning 311 cases" color="#34d399" />}
            <MapProgressBar color="#34d399" />

            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="glass-card rounded-xl p-6 max-w-sm">
                  <p className="text-sm font-medium text-signal-red mb-1">Data Error</p>
                  <p className="text-xs text-slate-400">{error}</p>
                </div>
              </div>
            )}

            {!isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#10b981"
              />
            )}

            {/* Stat cards — top left */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && caseData.length > 0 && (
              <div className="absolute top-5 left-5 z-10 flex gap-2.5">
                <StatCard
                  label="Total Cases" info="total-cases" value={formatNumber(stats.totalCases)} color="#10b981" delay={0}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined}
                  yoyDelta={!comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null}
                />
                <StatCard
                  label="Avg Resolution" info="avg-resolution" value={formatResolution(stats.avgResolution)} color={resolutionTimeColor(stats.avgResolution)} delay={80}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.avgResolution)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.avgResolution > 0 ? 'up' : comparison.deltas.avgResolution < 0 ? 'down' : 'neutral') : undefined}
                />
                <StatCard
                  label="Open Cases" info="open-cases" value={formatNumber(stats.openCases)} color="#f59e0b" delay={160}
                />
                <StatCard
                  label="Peak Hour" info="peak-hour" value={formatHour(stats.peakHour)} color="#60a5fa" delay={240}
                />
              </div>
            )}

            {/* Charts — bottom left */}
            {!isLoading && chartTiles.length > 0 && (
              <ChartTray viewId="cases311" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Complaint Anomaly
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-blue-400">−2σ</span>
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                    {['#3b82f6', '#93c5fd', '#e2e8f0', '#fbbf24', '#ef4444', '#7f1d1d'].map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-red-400">+3σ</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">below avg → above avg</p>
              </div>
            )}

            {/* Case detail panel */}
            <CaseDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['categories', 'Categories'], ['neighborhoods', 'Neighborhoods']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-emerald-500'
                    : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {sidebarTab === 'categories' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Service Categories
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                <ServiceCategoryFilter
                  categories={categoryEntries}
                  selected={selectedCategories}
                  onChange={setSelectedCategories}
                />
              </>
            )}

            {sidebarTab === 'neighborhoods' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    By Neighborhood
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>

                {selectedNeighborhood && (
                  <button
                    onClick={() => setSelectedNeighborhood(null)}
                    className="mb-3 text-[10px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
                  >
                    ← Clear filter: {selectedNeighborhood}
                  </button>
                )}

                {/* Heatgrid in sidebar */}
                {!hourlyPattern.isLoading && hourlyPattern.grid.some((row) => row.some((v) => v > 0)) && (
                  <div className="mb-4">
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={264} height={160} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">
                      Peak: <span className="text-emerald-500">{formatHour(hourlyPattern.peakHour)}</span>
                      {' · '}Quiet: <span className="text-slate-500">{formatHour(hourlyPattern.quietestHour)}</span>
                    </p>
                  </div>
                )}

                {!trend.isLoading && trend.currentPeriods.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-2">
                      Volume Trend
                    </p>
                    <PeriodBreakdownChart
                      current={trend.currentPeriods}
                      priorYear={trend.priorYearPeriods}
                      granularity={trend.granularity}
                      accentColor="#10b981"
                      width={264}
                      height={130}
                    />
                  </div>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodEntries.slice(0, 30).map((ns) => {
                    const maxCount = neighborhoodEntries[0]?.caseCount || 1
                    const barWidth = (ns.caseCount / maxCount) * 100
                    const isActive = selectedNeighborhood === ns.neighborhood
                    const zScore = neighborhoodAnomalies.get(ns.neighborhood)
                    return (
                      <div
                        key={ns.neighborhood}
                        onClick={() => handleNeighborhoodClick(ns.neighborhood)}
                        className={`relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                          isActive
                            ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
                            : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                          style={{ width: `${barWidth}%`, backgroundColor: '#10b981' }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                              {ns.neighborhood}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                              {(() => {
                                const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                                if (nhTrend?.priorYearCount) {
                                  return (
                                    <span className={nhTrend.yoyPct > 0 ? 'text-red-400' : nhTrend.yoyPct < 0 ? 'text-emerald-400' : ''}>
                                      {nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}%{' · '}
                                    </span>
                                  )
                                }
                                return null
                              })()}
                              {ns.caseCount.toLocaleString()} cases
                              {zScore !== undefined && (
                                <span className={zScore > 1 ? 'text-red-400' : zScore < -1 ? 'text-blue-400' : ''}>
                                  {' · '}{zScore >= 0 ? '+' : ''}{zScore.toFixed(1)}σ
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
