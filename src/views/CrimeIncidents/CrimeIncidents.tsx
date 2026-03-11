import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { usePoliceHourlyPattern } from '@/hooks/usePoliceHourlyPattern'
import { usePoliceComparisonData } from '@/hooks/usePoliceComparisonData'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useAppStore } from '@/stores/appStore'
import type { PoliceIncident, IncidentCategoryAggRow, NeighborhoodAggRowPolice, ResolutionAggRow } from '@/types/datasets'
import { formatDelta, formatNumber, formatHour } from '@/utils/time'
import { coordsFromFields, extractCoordinates } from '@/utils/geo'
import { resolutionColor } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import HorizontalBarChart, { type BarDatum } from '@/components/charts/HorizontalBarChart'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import IncidentCategoryFilter from '@/components/filters/IncidentCategoryFilter'
import CrimeDetailPanel from '@/components/ui/CrimeDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { SkeletonStatCards, SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'categories' | 'neighborhoods'

const SELECT_FIELDS = 'incident_id,incident_number,cad_number,incident_datetime,report_datetime,incident_category,incident_subcategory,incident_description,resolution,intersection,analysis_neighborhood,police_district,latitude,longitude,point'

export default function CrimeIncidents() {
  const { dateRange, timeOfDayFilter, comparisonPeriod, selectedCrimeIncident, setSelectedCrimeIncident } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('categories')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel from URL on mount
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedCrimeIncident(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync detail selection → URL param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedCrimeIncident) next.set('detail', selectedCrimeIncident)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedCrimeIncident, setSearchParams])

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
    return `incident_category IN (${escaped.join(',')})`
  }, [selectedCategories])

  const whereClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`incident_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`incident_datetime <= '${dateRange.end}T23:59:59'`)
    if (categoryClause) conditions.push(categoryClause)
    if (selectedNeighborhood) {
      conditions.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    }
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(incident_datetime) >= ${startHour} AND date_extract_hh(incident_datetime) <= ${endHour}`)
      } else {
        conditions.push(`(date_extract_hh(incident_datetime) >= ${startHour} OR date_extract_hh(incident_datetime) <= ${endHour})`)
      }
    }
    return conditions.join(' AND ')
  }, [dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter])

  // Date-only clause (for category aggregation — excludes category filter)
  const dateOnlyClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`incident_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`incident_datetime <= '${dateRange.end}T23:59:59'`)
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(incident_datetime) >= ${startHour} AND date_extract_hh(incident_datetime) <= ${endHour}`)
      } else {
        conditions.push(`(date_extract_hh(incident_datetime) >= ${startHour} OR date_extract_hh(incident_datetime) <= ${endHour})`)
      }
    }
    return conditions.join(' AND ')
  }, [dateRange, timeOfDayFilter])

  const freshness = useDataFreshness('policeIncidents', 'incident_datetime', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'policeIncidents',
    dateField: 'incident_datetime',
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
  const { data: rawData, isLoading, error, hitLimit } = useDataset<PoliceIncident>(
    'policeIncidents',
    { $where: whereClause, $limit: 5000, $select: SELECT_FIELDS },
    [whereClause]
  )

  // Total count query
  const { data: countRows } = useDataset<{ count: string }>(
    'policeIncidents',
    { $select: 'count(*) as count', $where: whereClause },
    [whereClause]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

  const { data: categoryRows } = useDataset<IncidentCategoryAggRow>(
    'policeIncidents',
    {
      $select: 'incident_category, count(*) as incident_count',
      $group: 'incident_category',
      $where: dateOnlyClause,
      $order: 'incident_count DESC',
      $limit: 60,
    },
    [dateOnlyClause]
  )

  const { data: neighborhoodRows } = useDataset<NeighborhoodAggRowPolice>(
    'policeIncidents',
    {
      $select: 'analysis_neighborhood, count(*) as incident_count',
      $group: 'analysis_neighborhood',
      $where: whereClause,
      $order: 'incident_count DESC',
      $limit: 50,
    },
    [whereClause]
  )

  const { data: resolutionRows } = useDataset<ResolutionAggRow>(
    'policeIncidents',
    {
      $select: 'resolution, count(*) as incident_count',
      $group: 'resolution',
      $where: whereClause,
      $order: 'incident_count DESC',
      $limit: 20,
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

  const hourlyPattern = usePoliceHourlyPattern(dateRange, extraWhere)

  // Comparison data
  const comparison = usePoliceComparisonData(dateRange, whereClause, comparisonPeriod, rawData)
  const compLabel = comparisonPeriod ? `vs ${comparisonPeriod >= 360 ? '1yr' : `${comparisonPeriod}d`} ago` : ''

  // Neighborhood boundaries for anomaly mode
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

  // --- Computed data ---
  const incidentData = useMemo(() => {
    return rawData
      .map((record) => {
        const coords = coordsFromFields(record.latitude, record.longitude) || extractCoordinates(record.point)
        if (!coords) return null
        return {
          incidentId: record.incident_id,
          incidentNumber: record.incident_number,
          cadNumber: record.cad_number || null,
          incidentAt: record.incident_datetime,
          reportAt: record.report_datetime || null,
          category: record.incident_category || 'Unknown',
          subcategory: record.incident_subcategory || '',
          description: record.incident_description || '',
          resolution: record.resolution || 'Unknown',
          intersection: record.intersection || '',
          neighborhood: record.analysis_neighborhood || 'Unknown',
          policeDistrict: record.police_district || '',
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData])

  const stats = useMemo(() => {
    if (incidentData.length === 0) return { total: 0, topCategory: 'N/A', linkedPct: 0, peakHour: 0 }

    // Top category from aggregation
    const topCategory = categoryRows.length > 0 ? categoryRows[0].incident_category : 'N/A'

    // 911 linked percentage
    const linkedCount = incidentData.filter((i) => i.cadNumber).length
    const linkedPct = (linkedCount / incidentData.length) * 100

    return {
      total: incidentData.length,
      topCategory,
      linkedPct,
      peakHour: hourlyPattern.peakHour,
    }
  }, [incidentData, categoryRows, hourlyPattern.peakHour])

  // Resolution bar data
  const resolutionBarData = useMemo((): BarDatum[] => {
    return resolutionRows.slice(0, 8).map((r) => ({
      label: r.resolution,
      value: parseInt(r.incident_count, 10) || 0,
      color: resolutionColor(r.resolution),
    }))
  }, [resolutionRows])

  // Card tray definitions
  const cardDefs = useMemo((): CardDef[] => {
    const totalVal = totalCount ?? stats.total
    return [
      {
        id: 'total',
        label: 'Total Incidents',
        shortLabel: 'Total',
        value: formatNumber(totalVal),
        color: '#ef4444',
        delay: 0,
        info: 'total-incidents',
        defaultExpanded: true,
        subtitle: comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : undefined,
        trend: comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined,
        yoyDelta: !comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null,
      },
      {
        id: 'top-category',
        label: 'Top Category',
        shortLabel: 'Top Cat',
        value: stats.topCategory,
        color: '#f59e0b',
        delay: 80,
        info: 'top-category',
        defaultExpanded: true,
      },
      {
        id: '911-linked',
        label: '911 Linked',
        shortLabel: '911%',
        value: `${stats.linkedPct.toFixed(0)}%`,
        color: '#a78bfa',
        delay: 160,
        info: '911-linked',
        defaultExpanded: true,
      },
      {
        id: 'peak-hour',
        label: 'Peak Hour',
        shortLabel: 'Peak',
        value: formatHour(stats.peakHour),
        color: '#60a5fa',
        delay: 240,
        info: 'peak-hour',
        defaultExpanded: false,
      },
    ]
  }, [stats, totalCount, comparison.deltas, compLabel, trend.cityWideYoY])

  // Chart tray definitions (bottom-left overlay)
  const chartTiles = useMemo((): ChartTileDef[] => {
    const tiles: ChartTileDef[] = []
    if (resolutionBarData.length > 0) {
      tiles.push({
        id: 'resolution',
        label: 'Resolution Breakdown',
        shortLabel: 'Resolution',
        color: '#a78bfa',
        defaultExpanded: true,
        render: () => (
          <HorizontalBarChart
            data={resolutionBarData}
            width={260}
            height={resolutionBarData.length * 20 + 8}
            maxBars={8}
            valueFormatter={(v) => v.toLocaleString()}
          />
        ),
      })
    }
    if (comparisonPeriod !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend${comparison.isLoading ? ' (loading\u2026)' : ''}`,
        shortLabel: 'Trend',
        color: '#ef4444',
        defaultExpanded: true,
        render: () => (
          <TrendChart
            current={comparison.currentTrend}
            comparison={comparison.comparisonTrend.length > 0 ? comparison.comparisonTrend : undefined}
            width={260}
            height={110}
          />
        ),
      })
    }
    return tiles
  }, [resolutionBarData, comparisonPeriod, comparison])

  // Sidebar data
  const categoryEntries = useMemo(
    () => categoryRows.map((r) => ({ category: r.incident_category, count: parseInt(r.incident_count, 10) || 0 })),
    [categoryRows]
  )

  const neighborhoodEntries = useMemo(() => {
    return neighborhoodRows
      .map((r) => ({
        neighborhood: r.analysis_neighborhood,
        incidentCount: parseInt(r.incident_count, 10) || 0,
      }))
      .filter((r) => r.neighborhood)
  }, [neighborhoodRows])

  // Z-score computation for anomaly mode
  const neighborhoodAnomalies = useMemo(() => {
    if (neighborhoodEntries.length === 0) return new Map<string, number>()
    const counts = neighborhoodEntries.map((n) => n.incidentCount)
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length)
    if (stdDev === 0) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const n of neighborhoodEntries) {
      map.set(n.neighborhood, (n.incidentCount - mean) / stdDev)
    }
    return map
  }, [neighborhoodEntries])

  // --- Map layers ---
  // Heatmap GeoJSON
  const heatmapGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || incidentData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: incidentData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          incidentId: r.incidentId,
          category: r.category,
          description: r.description,
          resolution: r.resolution,
          neighborhood: r.neighborhood,
          incidentAt: r.incidentAt,
          cadNumber: r.cadNumber,
        },
      })),
    }
  }, [incidentData, mapMode])

  const heatmapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'crime-heat',
      type: 'heatmap',
      source: 'crime-heatmap-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(239, 68, 68, 0.15)',
          0.25, 'rgba(239, 68, 68, 0.35)',
          0.4, 'rgba(245, 158, 11, 0.5)',
          0.6, 'rgba(251, 191, 36, 0.6)',
          0.8, 'rgba(253, 224, 71, 0.7)',
          1, 'rgba(254, 249, 195, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'crime-points',
      type: 'circle',
      source: 'crime-heatmap-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
        'circle-color': '#ef4444',
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.15)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Anomaly choropleth GeoJSON
  const anomalyGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'anomaly' || !neighborhoodBoundaries || neighborhoodAnomalies.size === 0) return null
    return {
      type: 'FeatureCollection',
      features: neighborhoodBoundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          zScore: neighborhoodAnomalies.get(f.properties?.nhood ?? '') ?? 0,
          incidentCount: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.incidentCount ?? 0,
        },
      })),
    }
  }, [mapMode, neighborhoodBoundaries, neighborhoodAnomalies, neighborhoodEntries])

  const anomalyLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'crime-neighborhood-fill',
      type: 'fill',
      source: 'neighborhood-crime-anomaly',
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
      id: 'crime-neighborhood-outline',
      type: 'line',
      source: 'neighborhood-crime-anomaly',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1,
        'line-opacity': 0.4,
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Bind layers reactively
  useMapLayer(mapInstance, 'crime-heatmap-data', heatmapGeojson, heatmapLayers)
  useMapLayer(mapInstance, 'neighborhood-crime-anomaly', anomalyGeojson, anomalyLayers)

  // Heatmap tooltip
  useMapTooltip(mapInstance, 'crime-points', (props) => {
    const dt = props.incidentAt ? new Date(String(props.incidentAt)) : null
    const dateStr = dt
      ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const timeStr = dt
      ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    const linked = props.cadNumber ? '<span style="color:#a78bfa;font-size:9px;margin-left:4px">911 LINKED</span>' : ''
    return `
      ${dateStr ? `<div style="color:#e2e8f0">${dateStr} · ${timeStr}${linked}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Category</div>
      <div style="color:#e2e8f0">${props.category || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Description</div>
      <div style="color:#94a3b8">${props.description || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Resolution</div>
      <div style="color:#94a3b8">${props.resolution || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
    `
  })

  // Anomaly tooltip
  useMapTooltip(mapInstance, 'crime-neighborhood-fill', (props) => {
    const zScore = Number(props.zScore).toFixed(1)
    const sign = Number(props.zScore) >= 0 ? '+' : ''
    return `
      <div class="tooltip-label">Neighborhood</div>
      <div class="tooltip-value">${props.nhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Crime Anomaly</div>
      <div class="tooltip-value">${sign}${zScore}\u03C3</div>
      <div class="tooltip-label" style="margin-top:6px">Incidents</div>
      <div style="color:#94a3b8">${Number(props.incidentCount).toLocaleString()}</div>
    `
  })

  // Neighborhood click in anomaly mode
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
        if (mapInstance.getLayer('crime-neighborhood-fill')) {
          mapInstance.on('click', 'crime-neighborhood-fill', handleClick)
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
        try { mapInstance.off('click', 'crime-neighborhood-fill', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'crime-neighborhood-fill', handleClick) } catch { /* */ }
    }
  }, [mapInstance, mapMode, selectedNeighborhood, setSelectedNeighborhood])

  // Click handler on crime points for detail panel
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const feature = e.features[0]
      const incidentId = feature.properties?.incidentId
      if (!incidentId) return
      setSelectedCrimeIncident(String(incidentId))
      const coords = (feature.geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800 })
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('crime-points')) {
          mapInstance.on('click', 'crime-points', handleClick)
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
        try { mapInstance.off('click', 'crime-points', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'crime-points', handleClick) } catch { /* */ }
    }
  }, [mapInstance, setSelectedCrimeIncident])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === neighborhood ? null : neighborhood)
    const nhoodIncidents = incidentData.filter((c) => c.neighborhood === neighborhood)
    if (nhoodIncidents.length > 0 && mapInstance) {
      const avgLat = nhoodIncidents.reduce((s, c) => s + c.lat, 0) / nhoodIncidents.length
      const avgLng = nhoodIncidents.reduce((s, c) => s + c.lng, 0) / nhoodIncidents.length
      mapInstance.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [incidentData, mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Crime Incidents
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SFPD &middot; Incident Reports & 911 Cross-Ref
              </p>
            </div>
            {!isLoading && incidentData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-red-500/80 bg-red-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-red-500 pulse-live" />
                  {formatNumber(incidentData.length)} records
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
            <ExportButton targetSelector="#crime-capture" filename="crime-incidents" />
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
      <div id="crime-capture" className="flex-1 overflow-hidden flex">
        {/* Map hero */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning incidents" color="#f87171" />}
            <MapProgressBar color="#f87171" />

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
                accentColor="#ef4444"
              />
            )}

            {/* Stat cards — top left */}
            {isLoading && <SkeletonStatCards count={3} />}
            {!isLoading && incidentData.length > 0 && (
              <CardTray viewId="crimeIncidents" cards={cardDefs} />
            )}

            {/* Charts — bottom left */}
            {!isLoading && chartTiles.length > 0 && (
              <ChartTray viewId="crimeIncidents" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Crime Anomaly<InfoTip term="anomaly-map" size={10} />
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-blue-400">{'\u2212'}2\u03C3</span>
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                    {['#3b82f6', '#93c5fd', '#e2e8f0', '#fbbf24', '#ef4444', '#7f1d1d'].map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-red-400">+3\u03C3</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">below avg {'\u2192'} above avg</p>
              </div>
            )}

            {/* Crime detail panel */}
            <CrimeDetailPanel />
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
                    ? 'text-ink dark:text-white border-b-2 border-red-500'
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
                    Incident Categories
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                <IncidentCategoryFilter
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
                    className="mb-3 text-[10px] font-mono text-red-500 hover:text-red-400 transition-colors"
                  >
                    {'\u2190'} Clear filter: {selectedNeighborhood}
                  </button>
                )}

                {/* Heatgrid in sidebar */}
                {!hourlyPattern.isLoading && hourlyPattern.grid.some((row) => row.some((v) => v > 0)) && (
                  <div className="mb-4">
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={264} height={160} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">
                      Peak: <span className="text-red-500">{formatHour(hourlyPattern.peakHour)}</span>
                      {' \u00B7 '}Quiet: <span className="text-slate-500">{formatHour(hourlyPattern.quietestHour)}</span>
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
                      accentColor="#ef4444"
                      width={264}
                      height={130}
                    />
                  </div>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodEntries.slice(0, 30).map((ns) => {
                    const maxCount = neighborhoodEntries[0]?.incidentCount || 1
                    const barWidth = (ns.incidentCount / maxCount) * 100
                    const isActive = selectedNeighborhood === ns.neighborhood
                    const zScore = neighborhoodAnomalies.get(ns.neighborhood)
                    return (
                      <div
                        key={ns.neighborhood}
                        onClick={() => handleNeighborhoodClick(ns.neighborhood)}
                        className={`relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                          isActive
                            ? 'bg-red-500/10 ring-1 ring-red-500/30'
                            : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                          style={{ width: `${barWidth}%`, backgroundColor: '#ef4444' }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                              {ns.neighborhood}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                              {ns.incidentCount.toLocaleString()} incidents
                              {(() => {
                                const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                                if (nhTrend?.priorYearCount) {
                                  return (
                                    <span className={nhTrend.yoyPct > 0 ? 'text-red-400' : nhTrend.yoyPct < 0 ? 'text-emerald-400' : ''}>
                                      {' \u00B7 '}{nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}% YoY
                                    </span>
                                  )
                                }
                                return null
                              })()}
                              {zScore !== undefined && (
                                <span className={zScore > 1 ? 'text-red-400' : zScore < -1 ? 'text-blue-400' : ''}>
                                  {' \u00B7 '}{zScore >= 0 ? '+' : ''}{zScore.toFixed(1)}{'\u03C3'}
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
