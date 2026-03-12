import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useCrashHourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { useCrashComparisonData } from '@/hooks/useComparisonDataFactory'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useAppStore } from '@/stores/appStore'
import type { TrafficCrashRecord, CrashModeAggRow, NeighborhoodAggRowCrashes, SpeedCameraRecord, RedLightCameraRecord, PavementConditionRecord } from '@/types/datasets'
import { formatDelta, formatNumber, formatHour } from '@/utils/time'
import { coordsFromFields, extractCoordinates } from '@/utils/geo'
import { CRASH_SEVERITY_COLORS } from '@/utils/colors'
import { CRASH_HEATMAP_LAYERS, ANOMALY_LAYERS, SPEED_CAM_LAYERS, RED_LIGHT_LAYERS, PCI_LAYERS } from './mapLayers'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import SeverityBreakdown from '@/components/charts/SeverityBreakdown'
import HorizontalBarChart from '@/components/charts/HorizontalBarChart'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import CrashModeFilter from '@/components/filters/CrashModeFilter'
import CrashDetailPanel from '@/components/ui/CrashDetailPanel'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import { SkeletonStatCards, SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'modes' | 'neighborhoods'
type Overlay = 'speed' | 'redlight' | 'pci'

const SELECT_FIELDS = 'unique_id,collision_datetime,collision_severity,type_of_collision,dph_col_grp_description,vz_pcf_group,number_killed,number_injured,primary_rd,secondary_rd,analysis_neighborhood,supervisor_district,police_district,tb_latitude,tb_longitude,point,ped_action,weather_1,road_surface,road_cond_1,lighting,mviw'

const DUI_CODES = "'23152(a-g)','23153(a-g)'"

export default function TrafficSafety() {
  const { dateRange, timeOfDayFilter, comparisonPeriod, selectedCrash, setSelectedCrash } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('modes')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const [activeOverlays, setActiveOverlays] = useState<Set<Overlay>>(new Set())
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedCrash(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedCrash) next.set('detail', selectedCrash)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedCrash, setSearchParams])

  const mapMode = (searchParams.get('map_mode') as MapMode) || 'heatmap'
  const selectedModes = useMemo(() => {
    const param = searchParams.get('modes')
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

  const setSelectedModes = useCallback((modes: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (modes.size === 0) next.delete('modes')
      else next.set('modes', Array.from(modes).map(encodeURIComponent).join(','))
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

  const toggleOverlay = useCallback((overlay: Overlay) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(overlay)) next.delete(overlay)
      else next.add(overlay)
      return next
    })
  }, [])

  // --- WHERE clause construction ---
  const modeClause = useMemo(() => {
    if (selectedModes.size === 0) return ''
    const escaped = Array.from(selectedModes).map((c) => `'${c.replace(/'/g, "''")}'`)
    return `dph_col_grp_description IN (${escaped.join(',')})`
  }, [selectedModes])

  const whereClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`collision_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`collision_datetime <= '${dateRange.end}T23:59:59'`)
    if (modeClause) conditions.push(modeClause)
    if (selectedNeighborhood) {
      conditions.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    }
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(collision_datetime) >= ${startHour} AND date_extract_hh(collision_datetime) <= ${endHour}`)
      } else {
        conditions.push(`(date_extract_hh(collision_datetime) >= ${startHour} OR date_extract_hh(collision_datetime) <= ${endHour})`)
      }
    }
    return conditions.join(' AND ')
  }, [dateRange, modeClause, selectedNeighborhood, timeOfDayFilter])

  const dateOnlyClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`collision_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`collision_datetime <= '${dateRange.end}T23:59:59'`)
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(collision_datetime) >= ${startHour} AND date_extract_hh(collision_datetime) <= ${endHour}`)
      } else {
        conditions.push(`(date_extract_hh(collision_datetime) >= ${startHour} OR date_extract_hh(collision_datetime) <= ${endHour})`)
      }
    }
    return conditions.join(' AND ')
  }, [dateRange, timeOfDayFilter])

  // Data freshness detection
  const freshness = useDataFreshness('trafficCrashes', 'collision_datetime', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'trafficCrashes',
    dateField: 'collision_datetime',
    neighborhoodField: 'analysis_neighborhood',
    metrics: [
      { selectExpr: 'SUM(number_injured)', alias: 'total_injured', label: 'Injured', format: (v) => String(Math.round(v)) },
      { selectExpr: 'SUM(number_killed)', alias: 'total_killed', label: 'Killed', format: (v) => String(Math.round(v)) },
    ],
  }), [])
  const trendExtraWhere = modeClause || undefined
  const trend = useTrendBaseline(trendConfig, dateRange, trendExtraWhere)

  // --- Primary data: crashes ---
  const { data: rawData, isLoading, error, hitLimit } = useDataset<TrafficCrashRecord>(
    'trafficCrashes',
    { $where: whereClause, $limit: 5000, $select: SELECT_FIELDS },
    [whereClause]
  )

  const { data: countRows } = useDataset<{ count: string }>(
    'trafficCrashes',
    { $select: 'count(*) as count', $where: whereClause },
    [whereClause]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

  // DUI crash count (server-side)
  const duiWhere = useMemo(() => {
    return `${whereClause} AND vz_pcf_group IN (${DUI_CODES})`
  }, [whereClause])

  const { data: duiCountRows } = useDataset<{ count: string; killed: string; injured: string }>(
    'trafficCrashes',
    {
      $select: 'count(*) as count, SUM(number_killed) as killed, SUM(number_injured) as injured',
      $where: duiWhere,
    },
    [duiWhere]
  )
  const duiCount = duiCountRows[0] ? parseInt(duiCountRows[0].count, 10) : 0
  const duiKilled = duiCountRows[0] ? parseInt(duiCountRows[0].killed, 10) || 0 : 0
  const duiInjured = duiCountRows[0] ? parseInt(duiCountRows[0].injured, 10) || 0 : 0

  // DUI prior-year count for YoY
  const duiPriorWhere = useMemo(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    start.setFullYear(start.getFullYear() - 1)
    end.setFullYear(end.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return `collision_datetime >= '${fmt(start)}T00:00:00' AND collision_datetime <= '${fmt(end)}T23:59:59' AND vz_pcf_group IN (${DUI_CODES})`
  }, [dateRange])

  const { data: duiPriorRows } = useDataset<{ count: string }>(
    'trafficCrashes',
    { $select: 'count(*) as count', $where: duiPriorWhere },
    [duiPriorWhere]
  )
  const duiPriorCount = duiPriorRows[0] ? parseInt(duiPriorRows[0].count, 10) : null
  const duiYoY = duiPriorCount && duiPriorCount > 0
    ? ((duiCount - duiPriorCount) / duiPriorCount) * 100
    : null

  const { data: modeRows } = useDataset<CrashModeAggRow>(
    'trafficCrashes',
    {
      $select: 'dph_col_grp_description, count(*) as crash_count',
      $group: 'dph_col_grp_description',
      $where: dateOnlyClause,
      $order: 'crash_count DESC',
      $limit: 20,
    },
    [dateOnlyClause]
  )

  const { data: neighborhoodRows } = useDataset<NeighborhoodAggRowCrashes>(
    'trafficCrashes',
    {
      $select: 'analysis_neighborhood, count(*) as crash_count, SUM(number_injured) as total_injured, SUM(number_killed) as total_killed',
      $group: 'analysis_neighborhood',
      $where: whereClause,
      $order: 'crash_count DESC',
      $limit: 50,
    },
    [whereClause]
  )

  // --- Overlay data (conditionally fetched) ---
  const { data: speedCameraData } = useDataset<SpeedCameraRecord>(
    'speedCameras',
    activeOverlays.has('speed')
      ? {
          $select: 'site_id, location, latitude, longitude, SUM(issued_citations) as issued_citations, AVG(avg_issued_speed) as avg_issued_speed',
          $group: 'site_id, location, latitude, longitude',
          $limit: 500,
        }
      : { $limit: 0 },
    [activeOverlays.has('speed')]
  )

  const { data: redLightData } = useDataset<RedLightCameraRecord>(
    'redLightCameras',
    activeOverlays.has('redlight')
      ? {
          $select: 'intersection, point, SUM(count) as count',
          $group: 'intersection, point',
          $limit: 500,
        }
      : { $limit: 0 },
    [activeOverlays.has('redlight')]
  )

  const { data: pavementData } = useDataset<PavementConditionRecord>(
    'pavementCondition',
    activeOverlays.has('pci')
      ? { $select: 'latitude, longitude, pci_score', $where: 'pci_score IS NOT NULL', $limit: 5000 }
      : { $limit: 0 },
    [activeOverlays.has('pci')]
  )

  // Hourly pattern
  const extraWhere = useMemo(() => {
    const parts: string[] = []
    if (modeClause) parts.push(modeClause)
    if (selectedNeighborhood) parts.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [modeClause, selectedNeighborhood])

  const hourlyPattern = useCrashHourlyPattern(dateRange, extraWhere)
  const comparison = useCrashComparisonData(dateRange, whereClause, comparisonPeriod, rawData)
  const compLabel = comparisonPeriod ? `vs ${comparisonPeriod >= 360 ? '1yr' : `${comparisonPeriod}d`} ago` : ''
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

  // --- Computed data ---
  const crashData = useMemo(() => {
    return rawData
      .map((record) => {
        const coords = coordsFromFields(record.tb_latitude, record.tb_longitude) || extractCoordinates(record.point)
        if (!coords) return null
        return {
          uniqueId: record.unique_id,
          collisionAt: record.collision_datetime,
          severity: record.collision_severity || 'Unknown',
          collisionType: record.type_of_collision || 'Unknown',
          mode: record.dph_col_grp_description || 'Unknown',
          isDui: record.vz_pcf_group === '23152(a-g)' || record.vz_pcf_group === '23153(a-g)',
          killed: parseInt(record.number_killed, 10) || 0,
          injured: parseInt(record.number_injured, 10) || 0,
          primaryRd: record.primary_rd || '',
          secondaryRd: record.secondary_rd || '',
          neighborhood: record.analysis_neighborhood || 'Unknown',
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData])

  const stats = useMemo(() => {
    if (crashData.length === 0) return { totalCrashes: 0, fatalities: 0, injuries: 0, pedBikePct: 0, peakHour: 0 }
    const fatalities = crashData.reduce((s, c) => s + c.killed, 0)
    const injuries = crashData.reduce((s, c) => s + c.injured, 0)
    const pedBike = crashData.filter((c) => c.mode.includes('Ped') || c.mode.includes('Bike')).length
    const pedBikePct = (pedBike / crashData.length) * 100
    return { totalCrashes: crashData.length, fatalities, injuries, pedBikePct, peakHour: hourlyPattern.peakHour }
  }, [crashData, hourlyPattern.peakHour])

  // Card tray definitions
  const cardDefs = useMemo((): CardDef[] => [
    {
      id: 'total',
      label: 'Total Crashes',
      shortLabel: 'Total',
      value: formatNumber(totalCount ?? stats.totalCrashes),
      color: '#dc2626',
      delay: 0,
      info: 'total-crashes',
      defaultExpanded: true,
      subtitle: comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : undefined,
      trend: comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined,
      yoyDelta: !comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null,
    },
    {
      id: 'fatalities',
      label: 'Fatalities',
      shortLabel: 'Fatal',
      value: String(stats.fatalities),
      color: '#7f1d1d',
      delay: 80,
      info: 'fatalities',
      defaultExpanded: true,
    },
    {
      id: 'injuries',
      label: 'Injuries',
      shortLabel: 'Injuries',
      value: formatNumber(stats.injuries),
      color: '#f59e0b',
      delay: 160,
      info: 'injuries',
      defaultExpanded: true,
      subtitle: comparison.deltas ? `${formatDelta(comparison.deltas.injuries)} ${compLabel}` : undefined,
      trend: comparison.deltas ? (comparison.deltas.injuries > 0 ? 'up' : comparison.deltas.injuries < 0 ? 'down' : 'neutral') : undefined,
    },
    {
      id: 'dui',
      label: 'DUI Crashes',
      shortLabel: 'DUI',
      value: formatNumber(duiCount),
      color: '#a855f7',
      delay: 240,
      info: 'dui-crashes',
      defaultExpanded: true,
      subtitle: duiKilled + duiInjured > 0
        ? `${duiKilled > 0 ? `${duiKilled} killed` : ''}${duiKilled > 0 && duiInjured > 0 ? ' · ' : ''}${duiInjured > 0 ? `${duiInjured} injured` : ''}`
        : undefined,
      yoyDelta: duiYoY,
    },
    {
      id: 'ped-bike',
      label: 'Ped/Bike %',
      shortLabel: 'Ped/Bike',
      value: `${stats.pedBikePct.toFixed(1)}%`,
      color: '#3b82f6',
      delay: 320,
      info: 'ped-bike-pct',
      defaultExpanded: false,
    },
  ], [stats, totalCount, comparison.deltas, compLabel, trend.cityWideYoY, duiCount, duiKilled, duiInjured, duiYoY])

  // Sidebar data
  const modeEntries = useMemo(
    () => modeRows.filter((r) => r.dph_col_grp_description).map((r) => ({
      mode: r.dph_col_grp_description,
      count: parseInt(r.crash_count, 10) || 0,
    })),
    [modeRows]
  )

  const severityData = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of crashData) {
      map.set(c.severity, (map.get(c.severity) || 0) + 1)
    }
    const order = ['Fatal', 'Injury (Severe)', 'Injury (Other Visible)', 'Injury (Complaint of Pain)']
    return order
      .filter((s) => map.has(s))
      .map((s) => ({ severity: s, count: map.get(s)! }))
  }, [crashData])

  const modeBars = useMemo(() => {
    return modeEntries.slice(0, 8).map((m) => ({
      label: m.mode,
      value: m.count,
      color: m.mode.includes('Ped') ? '#dc2626' : m.mode.includes('Bike') ? '#f59e0b' : '#64748b',
    }))
  }, [modeEntries])

  const chartTiles = useMemo<ChartTileDef[]>(() => {
    const tiles: ChartTileDef[] = []
    if (severityData.length > 0) {
      tiles.push({
        id: 'severity',
        label: 'Severity Breakdown',
        shortLabel: 'Severity',
        color: '#ef4444',
        defaultExpanded: true,
        render: () => <SeverityBreakdown data={severityData} width={320} height={110} />,
      })
    }
    if (modeBars.length > 0) {
      tiles.push({
        id: 'modes',
        label: 'Crash Modes',
        shortLabel: 'Modes',
        color: '#64748b',
        defaultExpanded: true,
        render: () => <HorizontalBarChart data={modeBars} width={320} height={120} maxBars={6} />,
      })
    }
    if (comparisonPeriod !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend${comparison.isLoading ? ' (loading…)' : ''}`,
        shortLabel: 'Trend',
        color: '#3b82f6',
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
  }, [severityData, modeBars, comparisonPeriod, comparison.currentTrend, comparison.comparisonTrend, comparison.isLoading])

  const neighborhoodEntries = useMemo(() => {
    return neighborhoodRows
      .map((r) => ({
        neighborhood: r.analysis_neighborhood,
        crashCount: parseInt(r.crash_count, 10) || 0,
        totalInjured: parseInt(r.total_injured, 10) || 0,
        totalKilled: parseInt(r.total_killed, 10) || 0,
      }))
      .filter((r) => r.neighborhood)
  }, [neighborhoodRows])

  const neighborhoodAnomalies = useMemo(() => {
    if (neighborhoodEntries.length === 0) return new Map<string, number>()
    const counts = neighborhoodEntries.map((n) => n.crashCount)
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length)
    if (stdDev === 0) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const n of neighborhoodEntries) {
      map.set(n.neighborhood, (n.crashCount - mean) / stdDev)
    }
    return map
  }, [neighborhoodEntries])

  // --- Map layers: crash primary ---
  const heatmapGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || crashData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: crashData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          uniqueId: r.uniqueId,
          severity: r.severity,
          mode: r.mode,
          collisionType: r.collisionType,
          killed: r.killed,
          injured: r.injured,
          primaryRd: r.primaryRd,
          secondaryRd: r.secondaryRd,
          neighborhood: r.neighborhood,
          collisionAt: r.collisionAt,
          isDui: r.isDui ? 1 : 0,
        },
      })),
    }
  }, [crashData, mapMode])

  const heatmapLayers = CRASH_HEATMAP_LAYERS

  // Anomaly choropleth
  const anomalyGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'anomaly' || !neighborhoodBoundaries || neighborhoodAnomalies.size === 0) return null
    return {
      type: 'FeatureCollection',
      features: neighborhoodBoundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          zScore: neighborhoodAnomalies.get(f.properties?.nhood ?? '') ?? 0,
          crashCount: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.crashCount ?? 0,
          totalInjured: neighborhoodEntries.find((n) => n.neighborhood === f.properties?.nhood)?.totalInjured ?? 0,
        },
      })),
    }
  }, [mapMode, neighborhoodBoundaries, neighborhoodAnomalies, neighborhoodEntries])

  const anomalyLayers = ANOMALY_LAYERS

  // --- Overlay layers ---
  const speedCamGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!activeOverlays.has('speed') || speedCameraData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: speedCameraData
        .map((r) => {
          const coords = coordsFromFields(r.latitude, r.longitude)
          if (!coords) return null
          return {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [coords.lng, coords.lat] },
            properties: { location: r.location, citations: parseInt(r.issued_citations, 10) || 0 },
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    }
  }, [speedCameraData, activeOverlays])

  const speedCamLayers = SPEED_CAM_LAYERS

  const redLightGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!activeOverlays.has('redlight') || redLightData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: redLightData
        .map((r) => {
          const coords = extractCoordinates(r.point)
          if (!coords) return null
          return {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [coords.lng, coords.lat] },
            properties: { intersection: r.intersection, count: parseInt(r.count, 10) || 0 },
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    }
  }, [redLightData, activeOverlays])

  const redLightLayers = RED_LIGHT_LAYERS

  const pciGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!activeOverlays.has('pci') || pavementData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: pavementData
        .map((r) => {
          const coords = coordsFromFields(r.latitude, r.longitude)
          if (!coords) return null
          return {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [coords.lng, coords.lat] },
            properties: { pci: parseFloat(r.pci_score) || 0 },
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    }
  }, [pavementData, activeOverlays])

  const pciLayers = PCI_LAYERS

  // Bind all layers
  useMapLayer(mapInstance, 'crash-heatmap-data', heatmapGeojson, heatmapLayers)
  useMapLayer(mapInstance, 'neighborhood-anomaly', anomalyGeojson, anomalyLayers)
  useMapLayer(mapInstance, 'speed-cam-data', speedCamGeojson, speedCamLayers)
  useMapLayer(mapInstance, 'redlight-data', redLightGeojson, redLightLayers)
  useMapLayer(mapInstance, 'pci-data', pciGeojson, pciLayers)

  // Tooltips
  useMapTooltip(mapInstance, 'crash-points', (props) => {
    const crashDate = props.collisionAt
      ? new Date(String(props.collisionAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const crashTime = props.collisionAt
      ? new Date(String(props.collisionAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    const sevColor = CRASH_SEVERITY_COLORS[String(props.severity)] || '#64748b'
    return `
      ${crashDate ? `<div style="color:#e2e8f0">${crashDate} · ${crashTime}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Severity</div>
      <div style="color:${sevColor};font-weight:600">${props.severity || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Mode</div>
      <div style="color:#e2e8f0">${props.mode || 'Unknown'} · ${props.collisionType || ''}</div>
      <div class="tooltip-label" style="margin-top:4px">Location</div>
      <div style="color:#94a3b8">${props.primaryRd || ''}${props.secondaryRd ? ` at ${props.secondaryRd}` : ''}</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Casualties</div>
      <div style="color:#94a3b8">Injured: ${props.injured || 0} · Killed: ${props.killed || 0}</div>
      ${Number(props.isDui) === 1 ? '<div style="margin-top:6px;color:#a855f7;font-weight:600">⚠ DUI-Involved</div>' : ''}
    `
  })

  useMapTooltip(mapInstance, 'crash-dui-points', (props) => {
    const crashDate = props.collisionAt
      ? new Date(String(props.collisionAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const crashTime = props.collisionAt
      ? new Date(String(props.collisionAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    const sevColor = CRASH_SEVERITY_COLORS[String(props.severity)] || '#64748b'
    return `
      <div style="color:#a855f7;font-weight:700;margin-bottom:4px">⚠ DUI-Involved Crash</div>
      ${crashDate ? `<div style="color:#e2e8f0">${crashDate} · ${crashTime}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Severity</div>
      <div style="color:${sevColor};font-weight:600">${props.severity || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:4px">Location</div>
      <div style="color:#94a3b8">${props.primaryRd || ''}${props.secondaryRd ? ` at ${props.secondaryRd}` : ''}</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Casualties</div>
      <div style="color:#94a3b8">Injured: ${props.injured || 0} · Killed: ${props.killed || 0}</div>
    `
  })

  useMapTooltip(mapInstance, 'neighborhood-fill', (props) => {
    const zScore = Number(props.zScore).toFixed(1)
    const sign = Number(props.zScore) >= 0 ? '+' : ''
    return `
      <div class="tooltip-label">Neighborhood</div>
      <div class="tooltip-value">${props.nhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Crash Anomaly</div>
      <div class="tooltip-value">${sign}${zScore}σ</div>
      <div class="tooltip-label" style="margin-top:6px">Crashes</div>
      <div style="color:#94a3b8">${Number(props.crashCount).toLocaleString()}</div>
      <div class="tooltip-label" style="margin-top:4px">Injured</div>
      <div style="color:#f59e0b">${Number(props.totalInjured).toLocaleString()}</div>
    `
  })

  useMapTooltip(mapInstance, 'speed-cam-circles', (props) => {
    return `
      <div class="tooltip-label">Speed Camera</div>
      <div class="tooltip-value">${props.location || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Citations</div>
      <div style="color:#f59e0b;font-weight:600">${Number(props.citations).toLocaleString()}</div>
    `
  })

  useMapTooltip(mapInstance, 'redlight-circles', (props) => {
    return `
      <div class="tooltip-label">Red Light Camera</div>
      <div class="tooltip-value">${props.intersection || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Violations</div>
      <div style="color:#dc2626;font-weight:600">${Number(props.count).toLocaleString()}</div>
    `
  })

  // Click handlers
  useEffect(() => {
    if (!mapInstance || mapMode !== 'anomaly') return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const nhood = e.features[0].properties?.nhood
      if (nhood) setSelectedNeighborhood(selectedNeighborhood === nhood ? null : nhood)
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('neighborhood-fill')) {
          mapInstance.on('click', 'neighborhood-fill', handleClick)
          return true
        }
      } catch { /* */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => { clearInterval(interval); try { mapInstance.off('click', 'neighborhood-fill', handleClick) } catch { /* */ } }
    }

    return () => { try { mapInstance.off('click', 'neighborhood-fill', handleClick) } catch { /* */ } }
  }, [mapInstance, mapMode, selectedNeighborhood, setSelectedNeighborhood])

  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const uniqueId = e.features[0].properties?.uniqueId
      if (!uniqueId) return
      setSelectedCrash(String(uniqueId))
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800 })
    }

    const layers = ['crash-points', 'crash-dui-points']
    const tryAttach = () => {
      try {
        let attached = 0
        for (const layer of layers) {
          if (mapInstance.getLayer(layer)) {
            mapInstance.on('click', layer, handleClick)
            attached++
          }
        }
        return attached > 0
      } catch { /* */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => { clearInterval(interval); layers.forEach((l) => { try { mapInstance.off('click', l, handleClick) } catch { /* */ } }) }
    }

    return () => { layers.forEach((l) => { try { mapInstance.off('click', l, handleClick) } catch { /* */ } }) }
  }, [mapInstance, setSelectedCrash])

  const handleMapReady = useCallback((map: mapboxgl.Map) => { setMapInstance(map) }, [])

  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === neighborhood ? null : neighborhood)
    const nhoodCrashes = crashData.filter((c) => c.neighborhood === neighborhood)
    if (nhoodCrashes.length > 0 && mapInstance) {
      const avgLat = nhoodCrashes.reduce((s, c) => s + c.lat, 0) / nhoodCrashes.length
      const avgLng = nhoodCrashes.reduce((s, c) => s + c.lng, 0) / nhoodCrashes.length
      mapInstance.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [crashData, mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Traffic Safety
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                Vision Zero &middot; Crash & Speed Analysis
              </p>
            </div>
            {!isLoading && crashData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-red-500/80 bg-red-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-red-500 pulse-live" />
                  {formatNumber(crashData.length)} records
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

            {/* Overlay toggles */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {([
                { key: 'speed' as Overlay, label: 'SC', title: 'Speed Cameras', color: '#f59e0b' },
                { key: 'redlight' as Overlay, label: 'RL', title: 'Red Light Cameras', color: '#dc2626' },
                { key: 'pci' as Overlay, label: 'PCI', title: 'Pavement Condition', color: '#10b981' },
              ]).map((ov) => (
                <button
                  key={ov.key}
                  onClick={() => toggleOverlay(ov.key)}
                  title={ov.title}
                  className={`px-2 py-1.5 rounded-md text-[10px] font-mono font-bold transition-all duration-200 ${
                    activeOverlays.has(ov.key)
                      ? 'bg-white dark:bg-white/[0.08] shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  style={activeOverlays.has(ov.key) ? { color: ov.color } : undefined}
                >
                  {ov.label}
                </button>
              ))}
            </div>

            <ComparisonToggle />
            <ExportButton targetSelector="#ts-capture" filename="traffic-safety" />
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
      <div id="ts-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning crashes" color="#f87171" />}
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
                accentColor="#dc2626"
              />
            )}

            {/* Stat cards */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && crashData.length > 0 && (
              <CardTray viewId="trafficSafety" cards={cardDefs} />
            )}

            {/* Charts */}
            {!isLoading && crashData.length > 0 && chartTiles.length > 0 && (
              <ChartTray viewId="trafficSafety" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Crash Anomaly<InfoTip term="anomaly-map" size={10} />
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

            <CrashDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['modes', 'Crash Types'], ['neighborhoods', 'Neighborhoods']] as const).map(([key, label]) => (
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
            {sidebarTab === 'modes' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Collision Modes
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                <CrashModeFilter
                  categories={modeEntries}
                  selected={selectedModes}
                  onChange={setSelectedModes}
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
                    ← Clear filter: {selectedNeighborhood}
                  </button>
                )}

                {!hourlyPattern.isLoading && hourlyPattern.grid.some((row) => row.some((v) => v > 0)) && (
                  <div className="mb-4">
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={264} height={160} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">
                      Peak: <span className="text-red-500">{formatHour(hourlyPattern.peakHour)}</span>
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
                      accentColor="#dc2626"
                      width={264}
                      height={130}
                    />
                  </div>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodEntries.slice(0, 30).map((ns) => {
                    const maxCount = neighborhoodEntries[0]?.crashCount || 1
                    const barWidth = (ns.crashCount / maxCount) * 100
                    const isActive = selectedNeighborhood === ns.neighborhood
                    const zScore = neighborhoodAnomalies.get(ns.neighborhood)
                    const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
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
                          style={{ width: `${barWidth}%`, backgroundColor: '#dc2626' }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                              {ns.neighborhood}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                              {nhTrend?.priorYearCount ? (
                                <span className={nhTrend.yoyPct > 0 ? 'text-red-400' : nhTrend.yoyPct < 0 ? 'text-emerald-400' : ''}>
                                  {nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}%{' · '}
                                </span>
                              ) : null}
                              {ns.crashCount.toLocaleString()} crashes
                              {ns.totalInjured > 0 && <span className="text-amber-400"> · {ns.totalInjured} injured</span>}
                              {ns.totalKilled > 0 && <span className="text-red-400"> · {ns.totalKilled} killed</span>}
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
