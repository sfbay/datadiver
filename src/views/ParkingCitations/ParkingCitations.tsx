import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useCitationHourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { useCitationComparisonData } from '@/hooks/useComparisonDataFactory'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useAppStore } from '@/stores/appStore'
import type { ParkingCitationRecord, ViolationTypeAggRow, NeighborhoodAggRowCitations } from '@/types/datasets'
import { formatCurrency, formatDelta, formatNumber, formatHour } from '@/utils/time'
import { extractCoordinates } from '@/utils/geo'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import StatCard from '@/components/ui/StatCard'
import FineHistogram from '@/components/charts/FineHistogram'
import HorizontalBarChart from '@/components/charts/HorizontalBarChart'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import ViolationTypeFilter from '@/components/filters/ViolationTypeFilter'
import CitationDetailPanel from '@/components/ui/CitationDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { SkeletonStatCards, SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'violations' | 'neighborhoods'

const SELECT_FIELDS = 'citation_number,citation_issued_datetime,violation,violation_desc,citation_location,fine_amount,vehicle_plate_state,the_geom,analysis_neighborhood,supervisor_districts'

export default function ParkingCitations() {
  const { dateRange, timeOfDayFilter, comparisonPeriod, selectedCitation, setSelectedCitation } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('violations')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const [sortByRevenue, setSortByRevenue] = useState(false)
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel from URL on mount
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedCitation(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync detail selection → URL param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedCitation) next.set('detail', selectedCitation)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedCitation, setSearchParams])

  // View-local state from URL params
  const mapMode = (searchParams.get('map_mode') as MapMode) || 'heatmap'
  const selectedViolations = useMemo(() => {
    const param = searchParams.get('violations')
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

  const setSelectedViolations = useCallback((cats: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (cats.size === 0) next.delete('violations')
      else next.set('violations', Array.from(cats).map(encodeURIComponent).join(','))
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
  const violationClause = useMemo(() => {
    if (selectedViolations.size === 0) return ''
    const escaped = Array.from(selectedViolations).map((c) => `'${c.replace(/'/g, "''")}'`)
    return `violation_desc IN (${escaped.join(',')})`
  }, [selectedViolations])

  // Build shared time-of-day fragment
  const todFragment = useMemo(() => {
    if (!timeOfDayFilter) return ''
    const { startHour, endHour } = timeOfDayFilter
    if (startHour <= endHour) {
      return `date_extract_hh(citation_issued_datetime) >= ${startHour} AND date_extract_hh(citation_issued_datetime) <= ${endHour}`
    }
    return `(date_extract_hh(citation_issued_datetime) >= ${startHour} OR date_extract_hh(citation_issued_datetime) <= ${endHour})`
  }, [timeOfDayFilter])

  // statsWhere: no geo filter — for stat cards, aggregation, comparison
  const statsWhere = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`citation_issued_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`citation_issued_datetime <= '${dateRange.end}T23:59:59'`)
    if (violationClause) conditions.push(violationClause)
    if (selectedNeighborhood) {
      conditions.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    }
    if (todFragment) conditions.push(todFragment)
    return conditions.join(' AND ')
  }, [dateRange, violationClause, selectedNeighborhood, todFragment])

  // mapWhere: with geo filter — for heatmap/point GeoJSON data
  const mapWhere = useMemo(() => {
    return statsWhere + ' AND the_geom IS NOT NULL'
  }, [statsWhere])

  // dateOnlyClause: for violation agg (no violation/neighborhood filter)
  const dateOnlyClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`citation_issued_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`citation_issued_datetime <= '${dateRange.end}T23:59:59'`)
    if (todFragment) conditions.push(todFragment)
    return conditions.join(' AND ')
  }, [dateRange, todFragment])

  // Data freshness detection
  const freshness = useDataFreshness('parkingCitations', 'citation_issued_datetime', dateRange, { geoField: 'the_geom' })

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'parkingCitations',
    dateField: 'citation_issued_datetime',
    neighborhoodField: 'analysis_neighborhood',
    metrics: [
      { selectExpr: 'AVG(fine_amount)', alias: 'avg_fine', label: 'Avg Fine', format: (v) => formatCurrency(v) },
      { selectExpr: 'SUM(fine_amount)', alias: 'total_fines', label: 'Total Fines', format: (v) => formatCurrency(v) },
    ],
  }), [])
  const trend = useTrendBaseline(trendConfig, dateRange, violationClause || undefined)

  // --- Data queries ---
  // Map data: requires geo
  const { data: rawData, isLoading, error, hitLimit } = useDataset<ParkingCitationRecord>(
    'parkingCitations',
    { $where: mapWhere, $limit: 5000, $select: SELECT_FIELDS },
    [mapWhere]
  )

  // Stats: no geo filter
  const { data: countRows } = useDataset<{ count: string }>(
    'parkingCitations',
    { $select: 'count(*) as count', $where: statsWhere },
    [statsWhere]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

  // Revenue headline stat (uncapped by $limit, no geo filter)
  const { data: revenueRows } = useDataset<{ total_fines: string }>(
    'parkingCitations',
    { $select: 'SUM(fine_amount) as total_fines', $where: statsWhere },
    [statsWhere]
  )
  const totalRevenue = revenueRows[0] ? parseFloat(revenueRows[0].total_fines) || 0 : 0

  const { data: violationRows } = useDataset<ViolationTypeAggRow>(
    'parkingCitations',
    {
      $select: 'violation_desc, count(*) as citation_count, SUM(fine_amount) as total_fines, AVG(fine_amount) as avg_fine',
      $group: 'violation_desc',
      $where: dateOnlyClause,
      $order: 'citation_count DESC',
      $limit: 50,
    },
    [dateOnlyClause]
  )

  // Neighborhood agg: no geo filter
  const { data: neighborhoodRows } = useDataset<NeighborhoodAggRowCitations>(
    'parkingCitations',
    {
      $select: 'analysis_neighborhood, count(*) as citation_count, SUM(fine_amount) as total_fines, AVG(fine_amount) as avg_fine',
      $group: 'analysis_neighborhood',
      $where: statsWhere,
      $order: 'citation_count DESC',
      $limit: 50,
    },
    [statsWhere]
  )

  // Hourly pattern
  const extraWhere = useMemo(() => {
    const parts: string[] = []
    if (violationClause) parts.push(violationClause)
    if (selectedNeighborhood) parts.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [violationClause, selectedNeighborhood])

  const hourlyPattern = useCitationHourlyPattern(dateRange, extraWhere)

  // Comparison data
  const comparison = useCitationComparisonData(dateRange, statsWhere, comparisonPeriod, rawData)
  const compLabel = comparisonPeriod ? `vs ${comparisonPeriod >= 360 ? '1yr' : `${comparisonPeriod}d`} ago` : ''

  // Neighborhood boundaries for anomaly mode
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

  // --- Computed data ---
  const citationData = useMemo(() => {
    return rawData
      .map((record) => {
        const coords = extractCoordinates(record.the_geom)
        if (!coords) return null
        const fineAmount = parseFloat(record.fine_amount) || 0
        return {
          citationNumber: record.citation_number,
          issuedAt: record.citation_issued_datetime,
          violation: record.violation || '',
          violationDesc: record.violation_desc || 'Unknown',
          location: record.citation_location || 'Unknown',
          fineAmount,
          plateState: record.vehicle_plate_state || 'Unknown',
          neighborhood: record.analysis_neighborhood || 'Unknown',
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData])

  const stats = useMemo(() => {
    if (citationData.length === 0) return { totalCitations: 0, avgFine: 0, outOfStatePct: 0, peakHour: 0 }
    const fines = citationData.map((c) => c.fineAmount).filter((f) => f > 0)
    const avgFine = fines.length > 0 ? fines.reduce((a, b) => a + b, 0) / fines.length : 0
    const outOfState = citationData.filter((c) => c.plateState !== 'CA' && c.plateState !== 'Unknown').length
    const outOfStatePct = (outOfState / citationData.length) * 100
    return { totalCitations: citationData.length, avgFine, outOfStatePct, peakHour: hourlyPattern.peakHour }
  }, [citationData, hourlyPattern.peakHour])

  const histogramData = useMemo(
    () => citationData.map((c) => c.fineAmount).filter((f) => f > 0),
    [citationData]
  )

  // Sidebar data
  const violationEntries = useMemo(
    () => violationRows.map((r) => ({
      violationDesc: r.violation_desc,
      count: parseInt(r.citation_count, 10) || 0,
      totalFines: parseFloat(r.total_fines) || 0,
    })),
    [violationRows]
  )

  const topViolationBars = useMemo(() => {
    const sliced = sortByRevenue
      ? [...violationEntries].sort((a, b) => b.totalFines - a.totalFines).slice(0, 8)
      : violationEntries.slice(0, 8)
    return sliced.map((v) => ({
      label: v.violationDesc,
      value: sortByRevenue ? v.totalFines : v.count,
      color: '#f97316',
    }))
  }, [violationEntries, sortByRevenue])

  const chartTiles = useMemo((): ChartTileDef[] => {
    const tiles: ChartTileDef[] = []

    if (histogramData.length > 0) {
      tiles.push({
        id: 'fine-distribution',
        label: 'Fine Amount Distribution',
        shortLabel: 'Fines',
        color: '#f97316',
        defaultExpanded: true,
        render: () => (
          <FineHistogram data={histogramData} width={320} height={100} />
        ),
      })
    }

    if (topViolationBars.length > 0) {
      tiles.push({
        id: 'top-violations',
        label: 'Top Violations',
        shortLabel: 'Violations',
        color: '#fb923c',
        defaultExpanded: true,
        render: () => (
          <>
            <div className="flex items-center justify-end -mt-1 mb-1">
              <button
                onClick={() => setSortByRevenue(!sortByRevenue)}
                className="text-[9px] font-mono text-orange-500/70 hover:text-orange-400 transition-colors"
              >
                {sortByRevenue ? '$ Revenue' : '# Count'}
              </button>
            </div>
            <HorizontalBarChart
              data={topViolationBars}
              width={320}
              height={160}
              maxBars={8}
              valueFormatter={sortByRevenue ? (v) => `$${Math.round(v).toLocaleString()}` : (v) => v.toLocaleString()}
            />
          </>
        ),
      })
    }

    if (comparisonPeriod !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend${comparison.isLoading ? ' (loading…)' : ''}`,
        shortLabel: 'Trend',
        color: '#f59e0b',
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histogramData, topViolationBars, sortByRevenue, comparisonPeriod, comparison.currentTrend, comparison.comparisonTrend, comparison.isLoading])

  const neighborhoodEntries = useMemo(() => {
    return neighborhoodRows
      .map((r) => ({
        neighborhood: r.analysis_neighborhood,
        citationCount: parseInt(r.citation_count, 10) || 0,
        totalFines: parseFloat(r.total_fines) || 0,
      }))
      .filter((r) => r.neighborhood)
  }, [neighborhoodRows])

  // Z-score computation for anomaly mode
  const neighborhoodAnomalies = useMemo(() => {
    if (neighborhoodEntries.length === 0) return new Map<string, number>()
    const counts = neighborhoodEntries.map((n) => n.citationCount)
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length)
    if (stdDev === 0) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const n of neighborhoodEntries) {
      map.set(n.neighborhood, (n.citationCount - mean) / stdDev)
    }
    return map
  }, [neighborhoodEntries])

  // --- Map layers ---
  const heatmapGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || citationData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: citationData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          citationNumber: r.citationNumber,
          violationDesc: r.violationDesc,
          fineAmount: r.fineAmount,
          location: r.location,
          neighborhood: r.neighborhood,
          issuedAt: r.issuedAt,
        },
      })),
    }
  }, [citationData, mapMode])

  const heatmapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'citations-heat',
      type: 'heatmap',
      source: 'citations-heatmap-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(249, 115, 22, 0.15)',
          0.25, 'rgba(249, 115, 22, 0.3)',
          0.4, 'rgba(251, 146, 60, 0.45)',
          0.6, 'rgba(245, 158, 11, 0.55)',
          0.8, 'rgba(239, 68, 68, 0.65)',
          1, 'rgba(220, 38, 38, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'citations-points',
      type: 'circle',
      source: 'citations-heatmap-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 14],
        'circle-color': '#f97316',
        'circle-opacity': 0.7,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.15)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  const anomalyGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'anomaly' || !neighborhoodBoundaries || neighborhoodAnomalies.size === 0) return null
    return {
      type: 'FeatureCollection',
      features: neighborhoodBoundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          zScore: neighborhoodAnomalies.get(f.properties?.nhood ?? '') ?? 0,
          citationCount: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.citationCount ?? 0,
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

  useMapLayer(mapInstance, 'citations-heatmap-data', heatmapGeojson, heatmapLayers)
  useMapLayer(mapInstance, 'neighborhood-anomaly', anomalyGeojson, anomalyLayers)

  // Heatmap tooltip
  useMapTooltip(mapInstance, 'citations-points', (props) => {
    const issuedDate = props.issuedAt
      ? new Date(String(props.issuedAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const issuedTime = props.issuedAt
      ? new Date(String(props.issuedAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    const fine = props.fineAmount ? `$${Number(props.fineAmount).toFixed(2)}` : null
    return `
      ${issuedDate ? `<div style="color:#e2e8f0">${issuedDate} · ${issuedTime}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Violation</div>
      <div style="color:#e2e8f0">${props.violationDesc || 'Unknown'}</div>
      ${fine ? `<div class="tooltip-label" style="margin-top:6px">Fine</div><div style="color:#f97316;font-weight:600">${fine}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Location</div>
      <div style="color:#94a3b8">${props.location || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:4px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
    `
  })

  // Anomaly tooltip
  useMapTooltip(mapInstance, 'neighborhood-fill', (props) => {
    const zScore = Number(props.zScore).toFixed(1)
    const sign = Number(props.zScore) >= 0 ? '+' : ''
    return `
      <div class="tooltip-label">Neighborhood</div>
      <div class="tooltip-value">${props.nhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Citation Anomaly</div>
      <div class="tooltip-value">${sign}${zScore}σ</div>
      <div class="tooltip-label" style="margin-top:6px">Citations</div>
      <div style="color:#94a3b8">${Number(props.citationCount).toLocaleString()}</div>
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

  // Click handler on citation points for detail panel
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const feature = e.features[0]
      const citationNumber = feature.properties?.citationNumber
      if (!citationNumber) return
      setSelectedCitation(String(citationNumber))
      const coords = (feature.geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800 })
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('citations-points')) {
          mapInstance.on('click', 'citations-points', handleClick)
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
        try { mapInstance.off('click', 'citations-points', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'citations-points', handleClick) } catch { /* */ }
    }
  }, [mapInstance, setSelectedCitation])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === neighborhood ? null : neighborhood)
    const nhoodCitations = citationData.filter((c) => c.neighborhood === neighborhood)
    if (nhoodCitations.length > 0 && mapInstance) {
      const avgLat = nhoodCitations.reduce((s, c) => s + c.lat, 0) / nhoodCitations.length
      const avgLng = nhoodCitations.reduce((s, c) => s + c.lng, 0) / nhoodCitations.length
      mapInstance.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [citationData, mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Parking Citations
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SFMTA &middot; Citation Patterns & Fines
              </p>
            </div>
            {!isLoading && citationData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-orange-500/80 bg-orange-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-orange-500 pulse-live" />
                  {formatNumber(citationData.length)} records
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
            <ExportButton targetSelector="#pc-capture" filename="parking-citations" />
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
      <div id="pc-capture" className="flex-1 overflow-hidden flex">
        {/* Map hero */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning citations" color="#fb923c" />}
            <MapProgressBar color="#fb923c" />

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
                latestGeoDate={freshness.latestGeoDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#f97316"
              />
            )}

            {/* Stat cards — top left */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && citationData.length > 0 && (
              <div className="absolute top-5 left-5 z-10 flex gap-2.5">
                <StatCard
                  label="Fine Revenue" info="fine-revenue" value={formatCurrency(totalRevenue)} color="#f97316" delay={0}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined}
                />
                <StatCard
                  label="Total Citations" info="total-citations" value={formatNumber(totalCount ?? stats.totalCitations)} color="#fb923c" delay={80}
                  yoyDelta={!comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null}
                />
                <StatCard
                  label="Avg Fine" info="avg-fine" value={formatCurrency(stats.avgFine)} color="#f59e0b" delay={160}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.avgFine)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.avgFine > 0 ? 'up' : comparison.deltas.avgFine < 0 ? 'down' : 'neutral') : undefined}
                />
                <StatCard
                  label="Out-of-State" info="out-of-state" value={`${stats.outOfStatePct.toFixed(1)}%`} color="#60a5fa" delay={240}
                />
                <StatCard
                  label="Peak Hour" info="peak-hour" value={formatHour(stats.peakHour)} color="#a78bfa" delay={320}
                />
              </div>
            )}

            {/* Charts — bottom left */}
            {!isLoading && chartTiles.length > 0 && (
              <ChartTray viewId="parkingCitations" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Citation Anomaly<InfoTip term="anomaly-map" size={10} />
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

            {/* Citation detail panel */}
            <CitationDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['violations', 'Violations'], ['neighborhoods', 'Neighborhoods']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-orange-500'
                    : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {sidebarTab === 'violations' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Violation Types
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                  <button
                    onClick={() => setSortByRevenue(!sortByRevenue)}
                    className="text-[9px] font-mono text-orange-500/70 hover:text-orange-400 transition-colors"
                  >
                    {sortByRevenue ? 'By Revenue' : 'By Count'}
                  </button>
                </div>
                <ViolationTypeFilter
                  categories={violationEntries}
                  selected={selectedViolations}
                  onChange={setSelectedViolations}
                  sortByRevenue={sortByRevenue}
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
                    className="mb-3 text-[10px] font-mono text-orange-500 hover:text-orange-400 transition-colors"
                  >
                    ← Clear filter: {selectedNeighborhood}
                  </button>
                )}

                {!hourlyPattern.isLoading && hourlyPattern.grid.some((row) => row.some((v) => v > 0)) && (
                  <div className="mb-4">
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={264} height={160} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">
                      Peak: <span className="text-orange-500">{formatHour(hourlyPattern.peakHour)}</span>
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
                      accentColor="#f97316"
                      width={264}
                      height={130}
                    />
                  </div>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodEntries.slice(0, 30).map((ns) => {
                    const maxCount = neighborhoodEntries[0]?.citationCount || 1
                    const barWidth = (ns.citationCount / maxCount) * 100
                    const isActive = selectedNeighborhood === ns.neighborhood
                    const zScore = neighborhoodAnomalies.get(ns.neighborhood)
                    const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                    return (
                      <div
                        key={ns.neighborhood}
                        onClick={() => handleNeighborhoodClick(ns.neighborhood)}
                        className={`relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                          isActive
                            ? 'bg-orange-500/10 ring-1 ring-orange-500/30'
                            : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                          style={{ width: `${barWidth}%`, backgroundColor: '#f97316' }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                              {ns.neighborhood}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                              {ns.citationCount.toLocaleString()} citations · ${Math.round(ns.totalFines).toLocaleString()}
                              {nhTrend?.priorYearCount ? (
                                <span className={nhTrend.yoyPct > 0 ? 'text-red-400' : nhTrend.yoyPct < 0 ? 'text-emerald-400' : ''}>
                                  {' · '}{nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}% since last yr
                                </span>
                              ) : null}
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
