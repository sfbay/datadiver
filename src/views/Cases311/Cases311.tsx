import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react'
import CivicTicker from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'
import type { CensusVariable } from '@/types/census'
import { eventFlyToOffset } from '@/utils/cameraPadding'
import { useCensusData } from '@/hooks/useCensusData'
import { useDemographicUnderlay } from '@/components/maps/DemographicUnderlay'
import UnderlayPicker from '@/components/maps/UnderlayPicker'
import UnderlayLegend from '@/components/maps/UnderlayLegend'
import NeighborhoodCensusContext from '@/components/ui/NeighborhoodCensusContext'
import { useViewEntry, useActiveCity } from '@/cities/useActiveCity'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { use311HourlyPattern, useOakland311HourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { use311ComparisonData, useOakland311ComparisonData, type Oakland311ComparisonRow } from '@/hooks/useComparisonDataFactory'
import {
  EYEBROWS_311, OAK311_GROUPS, OAK311_SELECT, OAK311_OPEN_CLAUSE,
  buildSf311Where, buildSf311DateOnly, buildOak311Where, buildOak311DateOnly,
  resolutionHoursExpr, displayCategory311, isOakCaseOpen, oak311Coords,
} from './dialect311'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import { useAppStore } from '@/stores/appStore'
import { resolveComparisonStart, comparisonLabel } from '@/utils/comparisonMode'
import type { Cases311Record, ServiceCategoryAggRow, NeighborhoodAggRow311 } from '@/types/datasets'
import { diffHours, formatResolution, formatDelta, formatNumber, formatHour } from '@/utils/time'
import { parseSfLocal } from '@/utils/sfTime'
import { coordsFromFields, extractCoordinates } from '@/utils/geo'
import { resolutionTimeColor } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import MapSidebar from '@/components/layout/MapSidebar'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ResolutionHistogram from '@/components/charts/ResolutionHistogram'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import ServiceCategoryFilter from '@/components/filters/ServiceCategoryFilter'
import CaseDetailPanel from '@/components/ui/CaseDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'
import ScannerFeedChips from '@/components/ui/ScannerFeedChips'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'categories' | 'neighborhoods'

const SELECT_FIELDS = 'service_request_id,requested_datetime,closed_date,status_description,service_name,service_subtype,address,lat,long,analysis_neighborhood,supervisor_district,source,point'

export default function Cases311() {
  const { dateRange, timeOfDayFilter, comparisonMode, selected311Case, setSelected311Case } = useAppStore()
  const city = useActiveCity()
  const isSF = city.id === 'sf'
  // Reader-facing beat labels ('07X' → 'Beat 07X'); identity for SF.
  const areaLabel = useCallback(
    (name: string) => city.areas.formatLabel?.(name) ?? name,
    [city],
  )
  // TWO-part gate: `enabled` stops the SF fetch battery (a render gate alone
  // would still fire it on Oakland routes); the render gate below hides the row.
  const civicIndicators = useCivicIndicators({ enabled: isSF })
  const underlayPreset = useViewEntry()?.underlayPreset ?? []
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('categories')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel from URL on mount.
  // Supports both ?detail= (internal share links) and ?case= (Last48EventPeek deep links).
  useEffect(() => {
    const detailParam = searchParams.get('detail') || searchParams.get('case')
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
    return `${isSF ? 'service_name' : 'reqcategory'} IN (${escaped.join(',')})`
  }, [selectedCategories, isSF])

  const whereOpts = { dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter }
  const whereClause = useMemo(
    () => (isSF ? buildSf311Where(whereOpts) : buildOak311Where(whereOpts)),
    [dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter, isSF], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Date-only clause (for category aggregation — excludes category filter)
  const dateOnlyClause = useMemo(
    () => (isSF ? buildSf311DateOnly({ dateRange, timeOfDayFilter }) : buildOak311DateOnly({ dateRange, timeOfDayFilter })),
    [dateRange, timeOfDayFilter, isSF],
  )

  const resolutionHours = isSF
    ? resolutionHoursExpr('closed_date', 'requested_datetime')
    : resolutionHoursExpr('datetimeclosed', 'datetimeinit')

  const freshness = useDataFreshness('cases311', isSF ? 'requested_datetime' : 'datetimeinit', dateRange, { cityId: city.id })

  const trendConfig = useMemo((): TrendConfig => isSF
    ? { datasetKey: 'cases311', dateField: 'requested_datetime', neighborhoodField: 'analysis_neighborhood' }
    : { datasetKey: 'cases311', dateField: 'datetimeinit', neighborhoodField: 'beat', cityId: 'oakland' },
    [isSF])
  const trendExtraWhere = useMemo(() => {
    const parts: string[] = []
    if (categoryClause) parts.push(categoryClause)
    if (selectedNeighborhood) parts.push(`${isSF ? 'analysis_neighborhood' : 'beat'} = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [categoryClause, selectedNeighborhood, isSF])
  const trend = useTrendBaseline(trendConfig, dateRange, trendExtraWhere)

  // --- Data queries ---
  const { data: rawData, isLoading, error, hitLimit, refetch } = useDataset<Cases311Record>(
    'cases311',
    { $where: whereClause, $limit: 5000, $select: isSF ? SELECT_FIELDS : OAK311_SELECT },
    [whereClause, isSF]
  )

  // Total count query (lightweight, for truncation indicator)
  const { data: countRows } = useDataset<{ count: string }>(
    'cases311',
    { $select: 'count(*) as count', $where: whereClause },
    [whereClause]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

  // Citywide-true open count — mirrors the totalCount pattern; the 5K sample
  // undercounts both totals whenever the range exceeds the row cap.
  const { data: openCountRows } = useDataset<{ count: string }>(
    'cases311',
    { $select: 'count(*) as count', $where: `${whereClause} AND ${isSF ? "status_description = 'Open'" : OAK311_OPEN_CLAUSE}` },
    [whereClause, isSF]
  )
  const openCount = openCountRows[0] ? parseInt(openCountRows[0].count, 10) : null

  // Citywide-true resolution stats — bypasses the 5K row cap on rawData.
  // Mirrors the client-side validity filter (closed cases, 0–720h window).
  const resolutionWhere = useMemo(
    () => `${whereClause} AND ${isSF ? 'closed_date' : 'datetimeclosed'} IS NOT NULL AND ${isSF ? 'closed_date >= requested_datetime' : 'datetimeclosed >= datetimeinit'} AND ${resolutionHours} <= 720`,
    [whereClause, isSF, resolutionHours]
  )

  const { data: resolutionStatsRows } = useDataset<{ avg_hours: string; case_count: string }>(
    'cases311',
    {
      $select: `AVG(${resolutionHours}) as avg_hours, COUNT(*) as case_count`,
      $where: resolutionWhere,
      $limit: 1,
    },
    [resolutionWhere, resolutionHours]
  )

  const { data: resolutionHistogramRows } = useDataset<{ hour_bucket: string; case_count: string }>(
    'cases311',
    {
      $select: `floor(${resolutionHours}) as hour_bucket, COUNT(*) as case_count`,
      $where: resolutionWhere,
      $group: 'hour_bucket',
      $order: 'hour_bucket',
      $limit: 1000,
    },
    [resolutionWhere, resolutionHours]
  )

  const { data: categoryRows } = useDataset<ServiceCategoryAggRow>(
    'cases311',
    {
      $select: isSF ? 'service_name, count(*) as case_count' : 'reqcategory as service_name, count(*) as case_count',
      $group: isSF ? 'service_name' : 'reqcategory',
      $where: dateOnlyClause,
      $order: 'case_count DESC',
      $limit: 50,
    },
    [dateOnlyClause, isSF]
  )

  const { data: neighborhoodRows } = useDataset<NeighborhoodAggRow311>(
    'cases311',
    {
      $select: isSF ? 'analysis_neighborhood, count(*) as case_count' : 'beat as analysis_neighborhood, count(*) as case_count',
      $group: isSF ? 'analysis_neighborhood' : 'beat',
      $where: whereClause,
      $order: 'case_count DESC',
      $limit: 50,
    },
    [whereClause, isSF]
  )

  // Hourly pattern
  const extraWhere = useMemo(() => {
    const parts: string[] = []
    if (categoryClause) parts.push(categoryClause)
    if (selectedNeighborhood) parts.push(`${isSF ? 'analysis_neighborhood' : 'beat'} = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [categoryClause, selectedNeighborhood, isSF])

  // Both cities' instances run unconditionally; the inactive one is inert
  // (enabled:false / compStart:null) — never select between hook FUNCTIONS
  // conditionally.
  const sfHourly = use311HourlyPattern(dateRange, extraWhere, isSF)
  const oakHourly = useOakland311HourlyPattern(dateRange, extraWhere, !isSF)
  const hourlyPattern = isSF ? sfHourly : oakHourly

  // Comparison data
  const compStart = useMemo(() => resolveComparisonStart(comparisonMode, dateRange), [comparisonMode, dateRange])
  const sfComparison = use311ComparisonData(dateRange, whereClause, isSF ? compStart : null, rawData, hitLimit)
  // The Oakland SELECT (OAK311_SELECT) already returns exactly the fields
  // Oakland311ComparisonRow expects (requestid/datetimeinit/datetimeclosed/
  // status) — unlike crime, no remap is needed; the raw-row cast is correct.
  const oakCompRows = useMemo<Oakland311ComparisonRow[]>(
    () => (isSF ? [] : (rawData as unknown as Oakland311ComparisonRow[])),
    [isSF, rawData],
  )
  const oakComparison = useOakland311ComparisonData(
    dateRange, whereClause, isSF ? null : compStart,
    oakCompRows, hitLimit,
  )
  const comparison = isSF ? sfComparison : oakComparison
  const compLabel = comparisonLabel(comparisonMode, dateRange)

  // Neighborhood boundaries for anomaly mode
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()
  useMapCameraPresets(mapInstance, { selectedNeighborhood, neighborhoodBoundaries })

  // Census demographic underlay
  const [underlayVariable, setUnderlayVariable] = useState<CensusVariable | null>(null)
  const { neighborhoods: censusNeighborhoods } = useCensusData()

  useDemographicUnderlay({
    map: mapInstance,
    variable: underlayVariable,
    censusData: censusNeighborhoods,
    boundaries: neighborhoodBoundaries,
    geoIdProperty: 'nhood',
    opacity: 0.2,
    beforeLayerId: 'cases-heat',
  })

  const cityAvg = useMemo(() => {
    if (city.census === null) return undefined
    if (censusNeighborhoods.length === 0) return undefined
    const totalPop = censusNeighborhoods.reduce((s, n) => s + n.population, 0)
    if (totalPop === 0) return undefined
    const avg: Record<string, number> = {}
    for (const key of ['medianIncome', 'povertyRate', 'rentBurden', 'lepRate', 'renterPct'] as const) {
      const vals = censusNeighborhoods.filter(n => (n as any)[key] !== undefined)
      if (vals.length > 0) {
        avg[key] = vals.reduce((s, n) => s + ((n as any)[key] as number) * n.population, 0) / totalPop
      }
    }
    return avg as any
  }, [censusNeighborhoods, city.census])

  // --- Computed data ---
  const caseData = useMemo(() => {
    return rawData
      .map((record) => {
        const coords = isSF
          ? coordsFromFields(record.lat, record.long) || extractCoordinates(record.point)
          : oak311Coords(record as { srx?: string; sry?: string })
        if (!coords) return null
        const requestedAt = isSF ? record.requested_datetime : (record as unknown as Record<string, string>).datetimeinit
        const closedAt = (isSF ? record.closed_date : (record as unknown as Record<string, string>).datetimeclosed) || null
        const resolutionHrs = closedAt ? diffHours(requestedAt, closedAt) : null
        if (resolutionHrs !== null && (resolutionHrs < 0 || resolutionHrs > 720)) return null
        return {
          requestId: String(isSF ? record.service_request_id : (record as unknown as Record<string, unknown>).requestid ?? ''),
          requestedAt,
          closedAt,
          status: (isSF ? record.status_description : (record as unknown as Record<string, string>).status) || 'Unknown',
          serviceName: (isSF ? record.service_name : (record as unknown as Record<string, string>).reqcategory) || 'Unknown',
          serviceSubtype: (isSF ? record.service_subtype : (record as unknown as Record<string, string>).description) || '',
          neighborhood: (isSF ? record.analysis_neighborhood : (record as unknown as Record<string, string>).beat) || 'Unknown',
          source: record.source || 'Unknown',
          resolutionHours: resolutionHrs,
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData, isSF])

  const stats = useMemo(() => {
    if (caseData.length === 0 && totalCount === null) return { totalCases: 0, avgResolution: 0, openCases: 0, peakHour: 0 }
    const closedTimes = caseData.filter((c) => c.resolutionHours !== null).map((c) => c.resolutionHours!)
    const sampleAvg = closedTimes.length > 0 ? closedTimes.reduce((a, b) => a + b, 0) / closedTimes.length : 0
    const serverAvg = resolutionStatsRows[0] ? parseFloat(resolutionStatsRows[0].avg_hours) : NaN
    const avgResolution = Number.isFinite(serverAvg) ? serverAvg : sampleAvg
    const sampleOpen = caseData.filter((c) => isSF ? c.status === 'Open' : isOakCaseOpen(c.status)).length
    return {
      totalCases: totalCount ?? caseData.length,
      avgResolution,
      openCases: openCount ?? sampleOpen,
      peakHour: hourlyPattern.peakHour,
    }
  }, [caseData, resolutionStatsRows, hourlyPattern.peakHour, totalCount, openCount, isSF])

  // Citywide histogram: expand server bucket counts back to a flat number[]
  // of hour values so the existing ResolutionHistogram (D3-bin-based) renders
  // citywide-true counts without component changes. The 5K sample is the
  // immediate-render fallback while the aggregate loads.
  const histogramData = useMemo(() => {
    if (resolutionHistogramRows.length > 0) {
      const arr: number[] = []
      for (const r of resolutionHistogramRows) {
        const hour = parseInt(r.hour_bucket, 10)
        const count = parseInt(r.case_count, 10)
        if (!Number.isFinite(hour) || !Number.isFinite(count) || count <= 0) continue
        for (let i = 0; i < count; i++) arr.push(hour)
      }
      return arr
    }
    return caseData.filter((c) => c.resolutionHours !== null).map((c) => c.resolutionHours!)
  }, [resolutionHistogramRows, caseData])

  const chartTiles = useMemo((): ChartTileDef[] => {
    const tiles: ChartTileDef[] = []
    if (histogramData.length > 0) {
      tiles.push({
        id: 'resolution-histogram',
        label: 'Resolution Time Distribution',
        shortLabel: 'Resolution',
        color: '#7a9954',
        defaultExpanded: true,
        render: () => (
          <ResolutionHistogram data={histogramData} width={320} height={100} />
        ),
      })
    }
    if (comparisonMode !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend${comparison.isLoading ? ' (loading…)' : ''}`,
        shortLabel: 'Trend',
        color: '#5c9693',
        defaultExpanded: true,
        render: () => (
          <TrendChart
            current={comparison.currentTrend}
            comparison={comparison.comparisonTrend.length > 0 ? comparison.comparisonTrend : undefined}
            accentColor="#7a9954"
            width={320}
            height={110}
          />
        ),
      })
    }
    return tiles
  }, [histogramData, comparisonMode, comparison.currentTrend, comparison.comparisonTrend, comparison.isLoading])

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

  // Null-beat disclosure — Oakland's reqcategory vocabulary is clean (no junk
  // tokens like crime's unmapped-beat problem), so unmapped here means only
  // NULL beats. Computed from the raw aggregation rows (not neighborhoodEntries,
  // which filters nulls out) so the share reflects the true total.
  const nullBeatShare = useMemo(() => {
    if (isSF || neighborhoodRows.length === 0) return null
    let mapped = 0, unmapped = 0
    for (const r of neighborhoodRows) {
      const n = parseInt(r.case_count, 10) || 0
      if (r.analysis_neighborhood) mapped += n
      else unmapped += n
    }
    const total = mapped + unmapped
    return total > 0 ? unmapped / total : null
  }, [isSF, neighborhoodRows])

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
        'circle-color': '#7a9954',
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
          -2, '#3f7573',
          -1, '#8bb5b2',
          0, '#e2e8f0',
          1, '#e8c06b',
          2, '#b85545',
          3, '#6f2b20',
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
      // DataSF datetimes are floating SF-local; bare new Date() reads them
      // in the viewer's host TZ (wrong for any non-Pacific reader).
      ? new Date(parseSfLocal(String(props.requestedAt))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
      : null
    const filedTime = props.requestedAt
      ? new Date(parseSfLocal(String(props.requestedAt))).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
      : null
    const resHours = props.resolutionHours ? Number(props.resolutionHours) : null
    const resLabel = resHours !== null ? formatResolution(resHours) : null
    if (!isSF) {
      return `
      ${filedDate ? `<div class="tooltip-label">Filed</div><div style="color:#e2e8f0">${filedDate} · ${filedTime}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Service</div>
      <div style="color:#e2e8f0">${displayCategory311(String(props.serviceName ?? '')) || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Police beat</div>
      <div style="color:#94a3b8">${props.neighborhood && props.neighborhood !== 'Unknown' ? areaLabel(String(props.neighborhood)) : 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Status</div>
      <div style="color:#94a3b8">${props.status || 'Unknown'}${resLabel ? ` · Resolved in ${resLabel}` : ''}</div>
    `
    }
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
      <div class="tooltip-label">${city.areas.noun[0].toUpperCase()}${city.areas.noun.slice(1)}</div>
      <div class="tooltip-value">${props.nhood ? areaLabel(String(props.nhood)) : 'Unknown'}</div>
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
      // Offset so the case lands clear of its own top-right detail card (w-72 = 288px).
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800, offset: eventFlyToOffset(mapInstance, 288) })
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

  // Card tray definitions
  const cardDefs = useMemo((): CardDef[] => [
    {
      id: 'total-cases',
      label: 'Total Cases',
      shortLabel: 'Total',
      value: formatNumber(stats.totalCases),
      color: '#7a9954',
      delay: 0,
      info: 'total-cases',
      defaultExpanded: true,
      subtitle: comparison.deltas
        ? `${formatDelta(comparison.deltas.total)} ${compLabel}`
        : (comparison.suppressed && comparisonMode !== null ? 'Compare needs a narrower date range' : undefined),
      trend: comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined,
      yoyDelta: !comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null,
    },
    {
      id: 'avg-resolution',
      label: 'Avg Resolution',
      shortLabel: 'Avg Res',
      value: formatResolution(stats.avgResolution),
      color: resolutionTimeColor(stats.avgResolution),
      delay: 80,
      info: 'avg-resolution',
      defaultExpanded: true,
      subtitle: comparison.deltas ? `${formatDelta(comparison.deltas.avgResolution)} ${compLabel}` : undefined,
      trend: comparison.deltas ? (comparison.deltas.avgResolution > 0 ? 'up' : comparison.deltas.avgResolution < 0 ? 'down' : 'neutral') : undefined,
    },
    {
      id: 'open-cases',
      label: 'Open Cases',
      shortLabel: 'Open',
      value: formatNumber(stats.openCases),
      color: '#d4a435',
      delay: 160,
      info: 'open-cases',
      defaultExpanded: true,
      subtitle: isSF ? undefined : 'Open / in progress — includes pending & created work orders',
      wrapSubtitle: !isSF,
    },
    {
      id: 'peak-hour',
      label: 'Peak Hour',
      shortLabel: 'Peak',
      value: formatHour(stats.peakHour),
      color: '#5c9693',
      delay: 240,
      info: 'peak-hour',
      defaultExpanded: false,
    },
  ], [stats, comparison.deltas, comparison.suppressed, compLabel, comparisonMode, trend.cityWideYoY, isSF])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-20">
        {/* items-start on mobile so the title can wrap on the left while the
            controls flow from the top-right (no empty well); md restores the
            centered single row. */}
        <div className="flex flex-wrap items-start justify-between gap-3 desk:items-center">
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                311 Cases
              </h1>
              <p className="hidden sm:block truncate text-micro font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                {EYEBROWS_311[city.id as keyof typeof EYEBROWS_311] ?? EYEBROWS_311.sf}
              </p>
            </div>
            {!isLoading && caseData.length > 0 && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 text-micro font-mono text-moss-500/80 bg-moss-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-moss-500 pulse-live" />
                  {formatNumber(caseData.length)} records
                </span>
                {hitLimit && totalCount !== null && (
                  <span className="text-micro font-mono text-ochre-500/80 bg-ochre-500/10 px-2 py-1 rounded-full">
                    map shows {formatNumber(caseData.length)} of {formatNumber(totalCount)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
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
              <UnderlayPicker
                presets={underlayPreset}
                activeVariable={underlayVariable}
                onSelect={setUnderlayVariable}
              />
            <ExportButton targetSelector="#c311-capture" filename="311-cases" />
          </div>
        </div>
      </header>

      {/* Cross-view ticker — signals from other datasets */}
      {isSF && (
        <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-1 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
          <CivicTicker
            items={civicIndicators.items.filter(i => i.source.view !== '/311-cases')}
            size="compact"
          />
        </div>
      )}

      {/* Time-of-day filter sub-header */}
      {!hourlyPattern.isLoading && hourlyPattern.hourTotals.some((t) => t > 0) && (
        <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-2 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 whitespace-nowrap">
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
            {isLoading && <MapScanOverlay label="Scanning 311 cases" color="#9db87a" />}
            <MapProgressBar color="#9db87a" />
            <UnderlayLegend variable={underlayVariable} data={censusNeighborhoods} />

            {error && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md rounded-[14px] backdrop-blur-xl bg-white/60 dark:bg-slate-900/60">
                <ErrorState message={error} onRetry={refetch} what="311 cases" />
              </div>
            )}

            {!isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#7a9954"
              />
            )}

            {/* Stat cards — top left */}
            {!isLoading && caseData.length > 0 && (
              <CardTray viewId="cases311" cards={cardDefs} />
            )}

            {/* Charts — bottom left */}
            {!isLoading && chartTiles.length > 0 && (
              <ChartTray viewId="cases311" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Complaint Anomaly
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-nano font-mono text-teal-500">−2σ</span>
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                    {['#3f7573', '#8bb5b2', '#e2e8f0', '#e8c06b', '#b85545', '#6f2b20'].map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-nano font-mono text-brick-400">+3σ</span>
                </div>
                <p className="text-nano text-slate-500 mt-1">below avg → above avg</p>
                {!isSF && nullBeatShare != null && nullBeatShare > 0.001 && (
                  <p className="text-nano text-slate-500 mt-1">
                    {(nullBeatShare * 100).toFixed(1)}% of cases carry no beat assignment
                  </p>
                )}
              </div>
            )}

            {/* Case detail panel */}
            <CaseDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <MapSidebar>
          {/* Tab bar */}
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['categories', 'Categories'], ['neighborhoods', isSF ? 'Neighborhoods' : 'Beats']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-micro font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-moss-500'
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
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Service Categories
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                <ServiceCategoryFilter
                  categories={categoryEntries}
                  selected={selectedCategories}
                  onChange={setSelectedCategories}
                  groups={isSF ? undefined : OAK311_GROUPS}
                  formatLabel={isSF ? undefined : displayCategory311}
                />
              </>
            )}

            {sidebarTab === 'neighborhoods' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    {isSF ? 'By Neighborhood' : 'By Beat'}
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>

                {selectedNeighborhood && (
                  <button
                    onClick={() => setSelectedNeighborhood(null)}
                    className="mb-3 text-micro font-mono text-moss-500 hover:text-moss-400 transition-colors"
                  >
                    ← Clear filter: {areaLabel(selectedNeighborhood)}
                  </button>
                )}

                {selectedNeighborhood && (
                  <>
                    {city.census !== null && (
                      <NeighborhoodCensusContext
                        neighborhood={selectedNeighborhood}
                        censusData={censusNeighborhoods.find(n => n.name === selectedNeighborhood)}
                        cityAverages={cityAvg}
                        civicCount={neighborhoodEntries.find(n => n.neighborhood === selectedNeighborhood)?.caseCount}
                        civicLabel="Cases"
                      />
                    )}
                    <ScannerFeedChips neighborhood={selectedNeighborhood} serviceFilter={['police', 'fire']} />
                  </>
                )}

                {/* Heatgrid in sidebar */}
                {!hourlyPattern.isLoading && hourlyPattern.grid.some((row) => row.some((v) => v > 0)) && (
                  <div className="mb-4">
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={264} height={160} />
                    <p className="text-micro text-slate-400 dark:text-slate-500 mt-2 font-mono">
                      Peak: <span className="text-moss-500">{formatHour(hourlyPattern.peakHour)}</span>
                      {' · '}Quiet: <span className="text-slate-500">{formatHour(hourlyPattern.quietestHour)}</span>
                    </p>
                  </div>
                )}

                {!trend.isLoading && trend.currentPeriods.length > 0 && (
                  <div className="mb-4">
                    <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-2">
                      Volume Trend
                    </p>
                    <PeriodBreakdownChart
                      current={trend.currentPeriods}
                      priorYear={trend.priorYearPeriods}
                      granularity={trend.granularity}
                      accentColor="#7a9954"
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
                            ? 'bg-moss-500/10 ring-1 ring-moss-500/30'
                            : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                          style={{ width: `${barWidth}%`, backgroundColor: '#7a9954' }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                              {areaLabel(ns.neighborhood)}
                            </p>
                            <p className="text-micro text-slate-400 dark:text-slate-600 font-mono italic">
                              {(() => {
                                const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                                if (nhTrend?.priorYearCount) {
                                  return (
                                    <span className={nhTrend.yoyPct > 0 ? 'text-brick-400' : nhTrend.yoyPct < 0 ? 'text-moss-400' : ''}>
                                      {nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}%{' · '}
                                    </span>
                                  )
                                }
                                return null
                              })()}
                              {ns.caseCount.toLocaleString()} cases
                              {zScore !== undefined && (
                                <span className={zScore > 1 ? 'text-brick-400' : zScore < -1 ? 'text-teal-500' : ''}>
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
                {!isSF && nullBeatShare != null && nullBeatShare > 0.001 && (
                  <p className="mt-3 text-nano font-mono uppercase tracking-[0.15em] text-slate-400/70 dark:text-slate-500 leading-relaxed">
                    {(nullBeatShare * 100).toFixed(1)}% of cases carry no beat assignment —
                    counted in citywide totals, absent from this ranking and the map
                  </p>
                )}
              </>
            )}
          </div>
        </MapSidebar>
      </div>
    </div>
  )
}
