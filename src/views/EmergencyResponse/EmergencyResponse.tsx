import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import CivicTicker from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'
import type { CensusVariable } from '@/types/census'
import { useCensusData } from '@/hooks/useCensusData'
import { useDemographicUnderlay } from '@/components/maps/DemographicUnderlay'
import UnderlayPicker from '@/components/maps/UnderlayPicker'
import NeighborhoodCensusContext from '@/components/ui/NeighborhoodCensusContext'
import { UNDERLAY_PRESETS } from '@/utils/censusVariables'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useFireHourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { useFireComparisonData } from '@/hooks/useComparisonDataFactory'
import { useAppStore } from '@/stores/appStore'
import type { FireEMSDispatch, FireDispatchNhStatsRow, FireDispatchCityStatsRow, FireDispatchHistogramRow } from '@/types/datasets'
import { formatDelta } from '@/utils/time'
import { formatDuration, formatNumber } from '@/utils/time'
import { responseTimeColor, apotTimeColor } from '@/utils/colors'
import { RESPONSE_HEATMAP_LAYERS, APOT_LAYERS, FIRE_SEVERITY_LAYER, FIRE_BATTERY_LAYER } from './mapLayers'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import MapSidebar from '@/components/layout/MapSidebar'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ResponseHistogram from '@/components/charts/ResponseHistogram'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import IncidentDetailPanel from '@/components/ui/IncidentDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { SkeletonChart, SkeletonSidebarRows, SkeletonBreakdownList, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import { useFireInsights } from '@/hooks/useFireInsights'
import BatteryTrendChart from '@/components/charts/BatteryTrendChart'
import HorizontalBarChart from '@/components/charts/HorizontalBarChart'
import { useEmergencyResponseData } from './useEmergencyResponseData'
import ScannerFeedChips from '@/components/ui/ScannerFeedChips'

type ServiceFilter = 'all' | 'fire' | 'ems' | 'transport'

const SERVICE_LABELS: Record<ServiceFilter, string> = {
  all: 'All',
  fire: 'Fire',
  ems: 'EMS',
  transport: 'Transport',
}

type SidebarTab = 'neighborhoods' | 'patterns'
type MapOverlay = 'response' | 'apot'

// Socrata's SoQL on the Fire/EMS dispatch dataset doesn't expose
// `date_diff_ss`. Compute response seconds via component decomposition:
// (hh*3600 + mm*60 + ss) extracted from each timestamp, subtracted.
const RESPONSE_SECONDS = (
  '((date_extract_hh(on_scene_dttm) - date_extract_hh(received_dttm)) * 3600 + ' +
  '(date_extract_mm(on_scene_dttm) - date_extract_mm(received_dttm)) * 60 + ' +
  '(date_extract_ss(on_scene_dttm) - date_extract_ss(received_dttm)))'
)

// Same-day filter drops <0.5% of calls that cross midnight, but keeps the
// component-decomposition arithmetic free of negative-diff edge cases.
const SAME_DAY = (
  'date_extract_y(on_scene_dttm) = date_extract_y(received_dttm) AND ' +
  'date_extract_m(on_scene_dttm) = date_extract_m(received_dttm) AND ' +
  'date_extract_d(on_scene_dttm) = date_extract_d(received_dttm)'
)

// Drop responses < 0s (data errors) or > 2 hours (stale dispatch / data noise)
const VALID_RESPONSE = `${RESPONSE_SECONDS} > 0 AND ${RESPONSE_SECONDS} < 7200`

export default function EmergencyResponse() {
  const { dateRange, timeOfDayFilter, comparisonPeriod, selectedIncident, setSelectedIncident, selectedNeighborhood, setSelectedNeighborhood } = useAppStore()
  const civicIndicators = useCivicIndicators()
  const [searchParams, setSearchParams] = useSearchParams()
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('neighborhoods')
  const [mapOverlay, setMapOverlay] = useState<MapOverlay>('response')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel + neighborhood from URL on mount
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedIncident(detailParam)
    const neighborhoodParam = searchParams.get('neighborhood')
    if (neighborhoodParam) setSelectedNeighborhood(neighborhoodParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync detail selection → URL param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedIncident) next.set('detail', selectedIncident)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedIncident, setSearchParams])

  // Service filter clause (shared between main query and hourly pattern)
  const serviceClause = useMemo(() => {
    if (serviceFilter === 'fire') return `call_type_group = 'Fire'`
    if (serviceFilter === 'ems') return `call_type_group = 'Potentially Life-Threatening'`
    if (serviceFilter === 'transport') return `transport_dttm IS NOT NULL`
    return ''
  }, [serviceFilter])

  const whereClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`received_dttm >= '${dateRange.start}T00:00:00'`)
    conditions.push(`received_dttm <= '${dateRange.end}T23:59:59'`)
    conditions.push(`on_scene_dttm IS NOT NULL`)
    if (serviceClause) conditions.push(serviceClause)
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(received_dttm) >= ${startHour} AND date_extract_hh(received_dttm) <= ${endHour}`)
      } else {
        // Wrap-around (e.g., 22-6)
        conditions.push(`(date_extract_hh(received_dttm) >= ${startHour} OR date_extract_hh(received_dttm) <= ${endHour})`)
      }
    }
    return conditions.join(' AND ')
  }, [dateRange, serviceClause, timeOfDayFilter])

  const freshness = useDataFreshness('fireEMSDispatch', 'received_dttm', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'fireEMSDispatch',
    dateField: 'received_dttm',
    neighborhoodField: 'neighborhoods_analysis_boundaries',
    baseWhere: 'on_scene_dttm IS NOT NULL',
  }), [])
  const trendExtraWhere = serviceClause || undefined
  const trend = useTrendBaseline(trendConfig, dateRange, trendExtraWhere)

  const isFireMode = serviceFilter === 'fire'
  const fireInsights = useFireInsights(isFireMode, dateRange)

  const fireNeighborhoodLookup = useMemo(() => {
    const map = new Map<string, typeof fireInsights.neighborhoodFires[0]>()
    for (const f of fireInsights.neighborhoodFires) {
      map.set(f.neighborhood, f)
      map.set(f.neighborhood.toLowerCase(), f)
    }
    return map
  }, [fireInsights.neighborhoodFires])

  // Neighborhood boundaries + Census demographic underlay
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()
  useMapCameraPresets(mapInstance, { selectedNeighborhood, neighborhoodBoundaries })
  const [underlayVariable, setUnderlayVariable] = useState<CensusVariable | null>(null)
  const { neighborhoods: censusNeighborhoods } = useCensusData()

  useDemographicUnderlay({
    map: mapInstance,
    variable: underlayVariable,
    censusData: censusNeighborhoods,
    boundaries: neighborhoodBoundaries,
    geoIdProperty: 'nhood',
    opacity: 0.2,
    beforeLayerId: 'response-heat',
  })

  const cityAvg = useMemo(() => {
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
  }, [censusNeighborhoods])

  // Map-layer WHERE — adds the neighborhood filter when one is selected.
  // The heatmap query is the only one we drill in; citywide aggregations
  // (avg/median/p90/total + sidebar ranking + histogram) stay unfiltered
  // because they ARE the comparison frame the user is reading against.
  // The 5K cap doesn't bite per-neighborhood since the largest SF
  // neighborhood (~2,300 fire/EMS calls/month) fits comfortably; smaller
  // ones fit 10–50× over. Selecting a neighborhood gives a complete,
  // uncapped heatmap of that neighborhood instead of the recent-13-days
  // sample we get citywide.
  const mapWhereClause = useMemo(() => {
    if (!selectedNeighborhood) return whereClause
    const escaped = selectedNeighborhood.replace(/'/g, "''")
    return `${whereClause} AND neighborhoods_analysis_boundaries = '${escaped}'`
  }, [whereClause, selectedNeighborhood])

  const { data: rawData, isLoading, error, hitLimit } = useDataset<FireEMSDispatch>(
    'fireEMSDispatch',
    {
      $where: mapWhereClause,
      $limit: 5000,
      $select: 'call_number,call_type,call_type_group,received_dttm,on_scene_dttm,transport_dttm,hospital_dttm,available_dttm,neighborhoods_analysis_boundaries,supervisor_district,final_priority,case_location',
    },
    [mapWhereClause]
  )

  // Total count query — uses mapWhereClause so the "X of Y" truncation
  // indicator reflects the same scope as the visible heatmap. When a
  // neighborhood is selected, the per-neighborhood total + uncapped
  // rawData mean hitLimit is false and the indicator hides naturally.
  const { data: countRows } = useDataset<{ count: string }>(
    'fireEMSDispatch',
    { $select: 'count(*) as count', $where: mapWhereClause },
    [mapWhereClause]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

  // Citywide-true response stats — bypasses the 5K row cap on rawData.
  // The valid-response filter drops cross-midnight + bad-data rows.
  const validResponseWhere = useMemo(
    () => `${whereClause} AND ${SAME_DAY} AND ${VALID_RESPONSE}`,
    [whereClause]
  )

  const { data: cityStatsRows } = useDataset<FireDispatchCityStatsRow>(
    'fireEMSDispatch',
    {
      $select: `AVG(${RESPONSE_SECONDS}) as avg_response_seconds, COUNT(*) as call_count`,
      $where: validResponseWhere,
      $limit: 1,
    },
    [validResponseWhere]
  )

  const { data: nhStatsRows } = useDataset<FireDispatchNhStatsRow>(
    'fireEMSDispatch',
    {
      $select: `neighborhoods_analysis_boundaries as neighborhood, AVG(${RESPONSE_SECONDS}) as avg_response_seconds, COUNT(*) as call_count`,
      $where: validResponseWhere,
      $group: 'neighborhoods_analysis_boundaries',
      $having: 'COUNT(*) > 5',
      $limit: 100,
    },
    [validResponseWhere]
  )

  const { data: histogramRows } = useDataset<FireDispatchHistogramRow>(
    'fireEMSDispatch',
    {
      $select: `floor(${RESPONSE_SECONDS} / 60) as minute_bucket, COUNT(*) as call_count`,
      $where: validResponseWhere,
      $group: 'minute_bucket',
      $order: 'minute_bucket',
      $limit: 200,
    },
    [validResponseWhere]
  )

  // --- Computed data (extracted to hook) ---
  // Sample-bound (5K rawData) values from the hook are renamed; we shadow
  // stats/neighborhoodStats/histogramData below with citywide-true server
  // aggregates. APOT stats stay sample-bound — they require the full transport
  // chain that the server-side aggregations don't cover (separate fix).
  const {
    responseData,
    apotData,
    geojson,
    apotGeojson,
    severityGeojson,
    batteryGeojson,
    stats: sampleStats,
    neighborhoodStats: sampleNeighborhoodStats,
  } = useEmergencyResponseData({
    rawData,
    mapOverlay,
    isFireMode,
    fireInsightsSeverityOverlay: fireInsights.severityOverlay,
    fireInsightsBatteryOverlay: fireInsights.batteryOverlay,
  })

  // Citywide stat-card values: AVG response from cityStatsRows, median + p90
  // derived from histogramRows cumulative distribution. APOT carries through
  // from sampleStats unchanged.
  const stats = useMemo(() => {
    const cityRow = cityStatsRows[0]
    const cityAvgMin = cityRow ? (parseFloat(cityRow.avg_response_seconds) || 0) / 60 : 0
    const cityTotal = cityRow ? parseInt(cityRow.call_count, 10) : 0

    const buckets = histogramRows
      .map(r => ({ minute: parseInt(r.minute_bucket, 10), count: parseInt(r.call_count, 10) }))
      .filter(b => Number.isFinite(b.minute) && b.count > 0)
      .sort((a, b) => a.minute - b.minute)
    const totalBucketed = buckets.reduce((s, b) => s + b.count, 0) || 1
    let cum = 0, median = 0, p90 = 0
    for (const b of buckets) {
      cum += b.count
      if (median === 0 && cum >= totalBucketed * 0.5) median = b.minute
      if (p90 === 0 && cum >= totalBucketed * 0.9) { p90 = b.minute; break }
    }

    return {
      avg: cityAvgMin,
      median,
      total: cityTotal,
      p90,
      apotAvg: sampleStats.apotAvg,
      apotCount: sampleStats.apotCount,
    }
  }, [cityStatsRows, histogramRows, sampleStats.apotAvg, sampleStats.apotCount])

  // Neighborhood centroid lookup from the boundary GeoJSON. Decoupled from
  // rawData so neighborhoods absent from the 5K sample still get flyTo targets.
  const neighborhoodCenters = useMemo(() => {
    const m = new Map<string, [number, number]>()
    if (!neighborhoodBoundaries) return m
    for (const f of neighborhoodBoundaries.features) {
      const name = (f.properties as any)?.nhood as string | undefined
      if (!name || !f.geometry) continue
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const visit = (a: any): void => {
        if (typeof a[0] === 'number') {
          if (a[0] < minX) minX = a[0]; if (a[0] > maxX) maxX = a[0]
          if (a[1] < minY) minY = a[1]; if (a[1] > maxY) maxY = a[1]
        } else {
          for (const sub of a) visit(sub)
        }
      }
      visit((f.geometry as any).coordinates)
      if (Number.isFinite(minX)) m.set(name, [(minX + maxX) / 2, (minY + maxY) / 2])
    }
    return m
  }, [neighborhoodBoundaries])

  const neighborhoodStats = useMemo(() => {
    return nhStatsRows
      .filter(r => r.neighborhood)
      .map(r => {
        const center = neighborhoodCenters.get(r.neighborhood)
        const sampleCenter = sampleNeighborhoodStats.find(n => n.neighborhood === r.neighborhood)
        const lat = center?.[1] ?? sampleCenter?.centerLat ?? 37.7749
        const lng = center?.[0] ?? sampleCenter?.centerLng ?? -122.4194
        const avgSeconds = parseFloat(r.avg_response_seconds) || 0
        const avgMin = avgSeconds / 60
        return {
          neighborhood: r.neighborhood,
          avgResponseTime: avgMin,
          medianResponseTime: avgMin, // per-neighborhood median not in server query
          totalIncidents: parseInt(r.call_count, 10) || 0,
          centerLat: lat,
          centerLng: lng,
        }
      })
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
  }, [nhStatsRows, neighborhoodCenters, sampleNeighborhoodStats])

  // Citywide histogram: expand bucket counts back to a flat number[] of
  // minute values so the existing ResponseHistogram (D3-bin-based) renders
  // citywide-true counts without component changes.
  const histogramData = useMemo(() => {
    const arr: number[] = []
    for (const r of histogramRows) {
      const minute = parseInt(r.minute_bucket, 10)
      const count = parseInt(r.call_count, 10)
      if (!Number.isFinite(minute) || !Number.isFinite(count) || count <= 0) continue
      for (let i = 0; i < count; i++) arr.push(minute)
    }
    return arr
  }, [histogramRows])

  // Heatmap + circle layers definition
  const mapLayers = RESPONSE_HEATMAP_LAYERS

  // APOT heatmap + circle layers
  const apotLayers = APOT_LAYERS

  const severityLayers = useMemo((): mapboxgl.AnyLayer[] => isFireMode ? [FIRE_SEVERITY_LAYER] : [], [isFireMode])

  const batteryLayers = useMemo((): mapboxgl.AnyLayer[] => isFireMode ? [FIRE_BATTERY_LAYER] : [], [isFireMode])

  // Reactively bind data to map
  useMapLayer(mapInstance, 'response-data', geojson, mapLayers)
  useMapLayer(mapInstance, 'apot-data', apotGeojson, apotLayers)
  useMapLayer(mapInstance, 'fire-severity', severityGeojson, severityLayers)
  useMapLayer(mapInstance, 'fire-battery', batteryGeojson, batteryLayers)

  // Hover tooltip on circle layer
  useMapTooltip(mapInstance, 'response-points', (props) => {
    const rt = Number(props.responseTime).toFixed(1)
    const rcvdDate = props.receivedAt
      ? new Date(String(props.receivedAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const rcvdTime = props.receivedAt
      ? new Date(String(props.receivedAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    return `
      ${rcvdDate ? `<div style="color:#e2e8f0;margin-bottom:4px">${rcvdDate} · ${rcvdTime}</div>` : ''}
      <div class="tooltip-label">Response Time</div>
      <div class="tooltip-value">${rt} min</div>
      <div class="tooltip-label" style="margin-top:6px">Call Type</div>
      <div style="color:#e2e8f0">${props.callType || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
    `
  })

  // APOT tooltip on circle layer
  useMapTooltip(mapInstance, 'apot-points', (props) => {
    const apot = Number(props.apotMinutes).toFixed(1)
    const hospDate = props.hospitalAt
      ? new Date(String(props.hospitalAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const hospTime = props.hospitalAt
      ? new Date(String(props.hospitalAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null
    return `
      ${hospDate ? `<div style="color:#e2e8f0;margin-bottom:4px">${hospDate} · ${hospTime}</div>` : ''}
      <div class="tooltip-label">APOT</div>
      <div class="tooltip-value" style="color:${apotTimeColor(Number(props.apotMinutes))}">${apot} min</div>
      <div class="tooltip-label" style="margin-top:6px">Call Type</div>
      <div style="color:#e2e8f0">${props.callType || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
    `
  })

  // Fire severity tooltip
  useMapTooltip(mapInstance, 'fire-severity-points', (props) => {
    const injuries = Number(props.injuries || 0)
    const fatalities = Number(props.fatalities || 0)
    const loss = Number(props.loss || 0)
    const casualties = []
    if (injuries > 0) casualties.push(`${injuries} injured`)
    if (fatalities > 0) casualties.push(`${fatalities} fatal`)
    return `<div class="font-mono text-[10px]">
      <div class="font-semibold text-brick-400 mb-1">Fire with Casualties</div>
      <div>${props.situation}</div>
      <div class="text-brick-400">${casualties.join(', ')}</div>
      ${loss > 0 ? `<div>Loss: $${loss.toLocaleString()}</div>` : ''}
      <div class="text-slate-400 mt-1">${props.address}</div>
      <div class="text-slate-500">${props.date ? new Date(String(props.date)).toLocaleDateString() : ''}</div>
    </div>`
  })

  // Battery fire tooltip
  useMapTooltip(mapInstance, 'fire-battery-points', (props) => {
    return `<div class="font-mono text-[10px]">
      <div class="font-semibold text-ochre-500 mb-1">Battery Fire</div>
      <div>${props.factor || props.situation}</div>
      ${props.origin ? `<div>Origin: ${props.origin}</div>` : ''}
      ${props.property ? `<div>${props.property}</div>` : ''}
      <div class="text-slate-400 mt-1">${props.address}</div>
      <div class="text-slate-500">${props.date ? new Date(String(props.date)).toLocaleDateString() : ''}</div>
    </div>`
  })

  // Click handler on circle points for incident detail
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const callNumber = e.features[0].properties?.callNumber
      if (callNumber) setSelectedIncident(String(callNumber))
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('response-points')) {
          mapInstance.on('click', 'response-points', handleClick)
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
        try { mapInstance.off('click', 'response-points', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'response-points', handleClick) } catch { /* */ }
    }
  }, [mapInstance, setSelectedIncident])

  // Fire layer click handlers (separate effect for clean lifecycle)
  useEffect(() => {
    if (!mapInstance || !isFireMode) return

    const handleFireClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const callNumber = e.features[0].properties?.callNumber
      if (callNumber) setSelectedIncident(String(callNumber))
    }

    const tryAttachFire = () => {
      try {
        if (mapInstance.getLayer('fire-severity-points')) {
          mapInstance.on('click', 'fire-severity-points', handleFireClick)
          mapInstance.on('click', 'fire-battery-points', handleFireClick)
          return true
        }
      } catch { /* layers not ready */ }
      return false
    }

    if (!tryAttachFire()) {
      const interval = setInterval(() => {
        if (tryAttachFire()) clearInterval(interval)
      }, 500)
      return () => {
        clearInterval(interval)
        try { mapInstance.off('click', 'fire-severity-points', handleFireClick) } catch { /* */ }
        try { mapInstance.off('click', 'fire-battery-points', handleFireClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'fire-severity-points', handleFireClick) } catch { /* */ }
      try { mapInstance.off('click', 'fire-battery-points', handleFireClick) } catch { /* */ }
    }
  }, [mapInstance, isFireMode, setSelectedIncident])

  const maxAvg = neighborhoodStats.length > 0 ? neighborhoodStats[0].avgResponseTime : 1

  // Hourly pattern for heatgrid and time-of-day filter
  const hourlyPattern = useFireHourlyPattern(dateRange, serviceClause || undefined)

  // Comparison period data
  const comparison = useFireComparisonData(dateRange, whereClause, comparisonPeriod, rawData)
  const compLabel = comparisonPeriod ? `vs ${comparisonPeriod >= 360 ? '1yr' : `${comparisonPeriod}d`} ago` : ''

  const chartTiles = useMemo((): ChartTileDef[] => {
    const tiles: ChartTileDef[] = []

    if (histogramData.length > 0) {
      tiles.push({
        id: 'response-histogram',
        label: 'Response Time Distribution',
        shortLabel: 'Distribution',
        color: '#d4a435',
        defaultExpanded: true,
        render: () => <ResponseHistogram data={histogramData} width={320} height={100} />,
      })
    }

    if (comparisonPeriod !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend ${comparison.isLoading ? '(loading…)' : ''}`,
        shortLabel: 'Trend',
        color: '#3f7573',
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

    // Battery fire trend tile (fire mode only)
    if (isFireMode && fireInsights.batteryTrend.length > 0) {
      tiles.push({
        id: 'battery-trend',
        label: 'Battery Fire Trend',
        shortLabel: 'Battery',
        color: '#d4a435',
        defaultExpanded: true,
        render: () => <BatteryTrendChart data={fireInsights.batteryTrend} width={320} height={140} />,
      })
    }

    return tiles
  }, [histogramData, comparisonPeriod, comparison.currentTrend, comparison.comparisonTrend, comparison.isLoading, isFireMode, fireInsights.batteryTrend])

  // Selected-neighborhood comparison context — when a neighborhood is
  // selected, derive the data needed to swap stat cards from citywide
  // values to neighborhood values + position-on-scale microvis. Returns
  // null when no neighborhood is selected, or when the selected one fell
  // below the COUNT > 5 threshold (rare; sidebar wouldn't show it either).
  const selectedNhStats = useMemo(() => {
    if (!selectedNeighborhood || neighborhoodStats.length === 0) return null
    const nh = neighborhoodStats.find((n) => n.neighborhood === selectedNeighborhood)
    if (!nh) return null
    const allAvgs = neighborhoodStats.map((n) => n.avgResponseTime)
    const allCounts = neighborhoodStats.map((n) => n.totalIncidents)
    return {
      nh,
      avgRange: [Math.min(...allAvgs), Math.max(...allAvgs)] as [number, number],
      countRange: [Math.min(...allCounts), Math.max(...allCounts)] as [number, number],
      avgDeltaPct: stats.avg > 0 ? ((nh.avgResponseTime - stats.avg) / stats.avg) * 100 : 0,
      countSharePct: stats.total > 0 ? (nh.totalIncidents / stats.total) * 100 : 0,
    }
  }, [selectedNeighborhood, neighborhoodStats, stats.avg, stats.total])

  // Card tray definitions
  const cardDefs = useMemo((): CardDef[] => {
    // When a neighborhood is selected, the Avg Response card swaps to that
    // neighborhood's value and renders a position-on-scale microvis showing
    // where it falls along the citywide gap. Median and Slowest 10% stay
    // citywide (per-neighborhood histograms aren't available yet).
    const avgValue = selectedNhStats ? selectedNhStats.nh.avgResponseTime : stats.avg
    const avgSubtitle = selectedNhStats
      ? `${selectedNhStats.nh.neighborhood} · ${selectedNhStats.avgDeltaPct >= 0 ? '+' : ''}${selectedNhStats.avgDeltaPct.toFixed(0)}% from city`
      : (comparison.deltas ? `${formatDelta(comparison.deltas.avg)} ${compLabel}` : undefined)
    const avgTrend: 'up' | 'down' | 'neutral' | undefined = selectedNhStats
      ? (selectedNhStats.avgDeltaPct > 0 ? 'up' : selectedNhStats.avgDeltaPct < 0 ? 'down' : 'neutral')
      : (comparison.deltas ? (comparison.deltas.avg > 0 ? 'up' : comparison.deltas.avg < 0 ? 'down' : 'neutral') : undefined)

    const cards: CardDef[] = [
      {
        id: 'avg-response',
        label: 'Avg Response',
        shortLabel: 'Avg',
        value: formatDuration(avgValue),
        color: responseTimeColor(avgValue),
        delay: 0,
        info: 'avg-response',
        defaultExpanded: true,
        subtitle: avgSubtitle,
        trend: avgTrend,
        positionScale: selectedNhStats
          ? {
              value: selectedNhStats.nh.avgResponseTime,
              range: selectedNhStats.avgRange,
              reference: stats.avg,
            }
          : undefined,
      },
      {
        id: 'median',
        label: 'Median',
        shortLabel: 'Med',
        value: formatDuration(stats.median),
        color: responseTimeColor(stats.median),
        delay: 80,
        info: 'median',
        defaultExpanded: true,
        subtitle: comparison.deltas ? `${formatDelta(comparison.deltas.median)} ${compLabel}` : undefined,
        trend: comparison.deltas ? (comparison.deltas.median > 0 ? 'up' : comparison.deltas.median < 0 ? 'down' : 'neutral') : undefined,
      },
      {
        id: '90th-pctl',
        label: 'Slowest 10%',
        shortLabel: '90th',
        value: formatDuration(stats.p90),
        color: responseTimeColor(stats.p90),
        delay: 160,
        info: '90th-pctl',
        defaultExpanded: true,
        subtitle: comparison.deltas ? `${formatDelta(comparison.deltas.p90)} ${compLabel}` : undefined,
        trend: comparison.deltas ? (comparison.deltas.p90 > 0 ? 'up' : comparison.deltas.p90 < 0 ? 'down' : 'neutral') : undefined,
      },
      {
        id: 'incidents',
        label: 'Incidents',
        shortLabel: 'Inc',
        value: formatNumber(selectedNhStats ? selectedNhStats.nh.totalIncidents : stats.total),
        color: '#5c9693',
        delay: 240,
        defaultExpanded: false,
        subtitle: selectedNhStats
          ? `${selectedNhStats.nh.neighborhood} · ${selectedNhStats.countSharePct.toFixed(1)}% of citywide`
          : (comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : undefined),
        trend: selectedNhStats
          ? undefined
          : (comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined),
        yoyDelta: !selectedNhStats && !comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null,
        positionScale: selectedNhStats
          ? {
              value: selectedNhStats.nh.totalIncidents,
              range: selectedNhStats.countRange,
              // No reference tick on the count card — citywide total isn't a
              // member of the neighborhood-count distribution; it's the sum.
            }
          : undefined,
      },
    ]
    if (stats.apotCount > 0) {
      cards.push({
        id: 'avg-apot',
        label: 'Avg On-Scene',
        shortLabel: 'Scene',
        value: formatDuration(stats.apotAvg),
        color: stats.apotAvg > 20 ? '#b85545' : stats.apotAvg > 10 ? '#d4a435' : '#7a9954',
        delay: 320,
        info: 'avg-apot',
        defaultExpanded: false,
      })
    }
    if (isFireMode && fireInsights.casualties) {
      const currTotal = fireInsights.casualties.injuries + fireInsights.casualties.fatalities
      cards.push({
        id: 'casualties',
        label: 'Casualties',
        shortLabel: 'Cas',
        value: String(currTotal),
        color: '#b85545',
        delay: 400,
        info: 'fire-casualties',
        defaultExpanded: false,
        subtitle: `${fireInsights.casualties.injuries} inj, ${fireInsights.casualties.fatalities} fatal`,
        yoyDelta: fireInsights.priorYearCasualties
          ? (() => {
              const prev = fireInsights.priorYearCasualties!.injuries + fireInsights.priorYearCasualties!.fatalities
              return prev > 0 ? ((currTotal - prev) / prev) * 100 : null
            })()
          : null,
      })
      cards.push({
        id: 'est-loss',
        label: 'Est. Loss',
        shortLabel: 'Loss',
        value: fireInsights.casualties.totalLoss >= 1_000_000
          ? `$${(fireInsights.casualties.totalLoss / 1_000_000).toFixed(1)}M`
          : fireInsights.casualties.totalLoss >= 1_000
          ? `$${(fireInsights.casualties.totalLoss / 1_000).toFixed(0)}K`
          : `$${fireInsights.casualties.totalLoss.toLocaleString()}`,
        color: '#d4a435',
        delay: 480,
        info: 'fire-property-loss',
        defaultExpanded: false,
        yoyDelta: fireInsights.priorYearCasualties && fireInsights.priorYearCasualties.totalLoss > 0
          ? ((fireInsights.casualties.totalLoss - fireInsights.priorYearCasualties.totalLoss) / fireInsights.priorYearCasualties.totalLoss) * 100
          : null,
      })
    }
    return cards
  }, [stats, comparison.deltas, compLabel, trend.cityWideYoY, isFireMode, fireInsights.casualties, fireInsights.priorYearCasualties, selectedNhStats])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Compact header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Emergency Response
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SFFD &middot; Fire &amp; EMS Dispatch
              </p>
            </div>
            {!isLoading && responseData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-signal-emerald/80 bg-signal-emerald/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-signal-emerald pulse-live" />
                  {formatNumber(responseData.length)} records
                </span>
                {hitLimit && totalCount !== null && (
                  <span className="text-[10px] font-mono text-ochre-500/80 bg-ochre-500/10 px-2 py-1 rounded-full">
                    of {formatNumber(totalCount)} total
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ComparisonToggle />
              <UnderlayPicker
                presets={UNDERLAY_PRESETS['emergency-response'] ?? []}
                activeVariable={underlayVariable}
                onSelect={setUnderlayVariable}
              />
            <ExportButton targetSelector="#er-capture" filename="emergency-response" />
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['all', 'fire', 'ems', 'transport'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setServiceFilter(filter)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    serviceFilter === filter
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {SERVICE_LABELS[filter]}
                </button>
              ))}
            </div>
            {/* Map overlay toggle */}
            {stats.apotCount > 0 && (
              <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
                {(['response', 'apot'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setMapOverlay(mode)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                      mapOverlay === mode
                        ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {mode === 'response' ? 'Response' : 'On-Scene'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Cross-view ticker — signals from other datasets */}
      <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-1 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
        <CivicTicker
          items={civicIndicators.items.filter(i => i.source.view !== '/emergency-response')}
          size="compact"
        />
      </div>

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
      <div id="er-capture" className="flex-1 overflow-hidden flex">
        {/* Map — hero element */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning dispatches" color="#d4a435" />}
            <MapProgressBar color="#d4a435" />

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
                accentColor="#3f7573"
              />
            )}

            {/* Stat cards — top left */}
            {!isLoading && responseData.length > 0 && (
              <CardTray viewId="emergencyResponse" cards={cardDefs} />
            )}

            {/* Histogram + Trend — bottom left */}
            {isLoading && (
              <div className="absolute bottom-6 left-5 z-10">
                <SkeletonChart width={320} height={100} />
              </div>
            )}
            {!isLoading && chartTiles.length > 0 && (
              <ChartTray viewId="emergencyResponse" tiles={chartTiles} />
            )}

            {/* Incident detail panel */}
            <IncidentDetailPanel />
          </MapView>
        </div>

        {/* Right panel */}
        <MapSidebar>
          {/* Tab bar */}
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['neighborhoods', 'Neighborhoods'], ['patterns', 'Patterns']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-signal-blue'
                    : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {sidebarTab === 'neighborhoods' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    By Neighborhood
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>

                {selectedNeighborhood && (
                  <>
                    <button
                      onClick={() => setSelectedNeighborhood(null)}
                      className="mb-3 text-[10px] font-mono text-teal-500 hover:text-teal-500 transition-colors"
                    >
                      {'\u2190'} Clear: {selectedNeighborhood}
                    </button>
                    <NeighborhoodCensusContext
                      neighborhood={selectedNeighborhood}
                      censusData={censusNeighborhoods.find(n => n.name === selectedNeighborhood)}
                      cityAverages={cityAvg}
                      civicCount={neighborhoodStats.find(n => n.neighborhood === selectedNeighborhood)?.totalIncidents}
                      civicLabel="Incidents"
                    />
                    <ScannerFeedChips neighborhood={selectedNeighborhood} serviceFilter={['fire', 'ems']} />
                  </>
                )}

                {neighborhoodStats.length === 0 && !isLoading && (
                  <p className="text-xs text-slate-400 dark:text-slate-600 italic">
                    No data for selected filters.
                  </p>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodStats.slice(0, 41).map((ns) => {
                    const barWidth = (ns.avgResponseTime / maxAvg) * 100
                    return (
                      <div
                        key={ns.neighborhood}
                        onClick={() => {
                          setSelectedNeighborhood(selectedNeighborhood === ns.neighborhood ? null : ns.neighborhood)
                          mapInstance?.flyTo({ center: [ns.centerLng, ns.centerLat], zoom: 14, duration: 1200 })
                        }}
                        className={`relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                          selectedNeighborhood === ns.neighborhood
                            ? 'bg-teal-500/10 ring-1 ring-teal-500/30'
                            : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                          style={{ width: `${barWidth}%`, backgroundColor: responseTimeColor(ns.avgResponseTime) }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate leading-tight">
                              {ns.neighborhood}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono italic">
                              {(() => {
                                const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                                if (!nhTrend || !nhTrend.priorYearCount) return null
                                return (
                                  <>
                                    <span className={nhTrend.yoyPct > 0 ? 'text-brick-400' : nhTrend.yoyPct < 0 ? 'text-moss-400' : ''}>
                                      {nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}%
                                    </span>
                                    {Math.abs(nhTrend.zScore) > 1 && (
                                      <span className={nhTrend.zScore > 1 ? 'text-brick-400' : 'text-teal-500'}>
                                        {' '}{nhTrend.zScore >= 0 ? '+' : ''}{nhTrend.zScore.toFixed(1)}σ
                                      </span>
                                    )}
                                    {' · '}
                                  </>
                                )
                              })()}
                              {ns.totalIncidents} calls
                              {isFireMode && (() => {
                                const fireStat = fireNeighborhoodLookup.get(ns.neighborhood)
                                  || fireNeighborhoodLookup.get(ns.neighborhood.toLowerCase())
                                if (!fireStat) return null
                                return (
                                  <>
                                    <span className="text-brick-400/80"> · {fireStat.count} fires</span>
                                    {fireStat.injuries > 0 && (
                                      <span className="text-brick-400"> · {fireStat.injuries} inj</span>
                                    )}
                                    {fireStat.fatalities > 0 && (
                                      <span className="text-brick-500 font-semibold"> · {fireStat.fatalities} fatal</span>
                                    )}
                                  </>
                                )
                              })()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 ml-2">
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: responseTimeColor(ns.avgResponseTime) }}
                            />
                            <span className="text-[13px] font-mono font-semibold text-ink dark:text-white whitespace-nowrap tabular-nums">
                              {formatDuration(ns.avgResponseTime)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {sidebarTab === 'patterns' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Call Volume by Hour &amp; Day
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>

                {hourlyPattern.isLoading ? (
                  <SkeletonChart height={80} />
                ) : (
                  <>
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={232} height={150} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 font-mono">
                      Click a cell to filter by that hour. Peak hour:{' '}
                      <span className="text-signal-amber">{hourlyPattern.peakHour}:00</span>
                    </p>
                  </>
                )}

                {/* Period trend breakdown */}
                {!trend.isLoading && trend.currentPeriods.length > 0 && (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                        Volume Trend
                      </p>
                      <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                    </div>
                    <PeriodBreakdownChart
                      current={trend.currentPeriods}
                      priorYear={trend.priorYearPeriods}
                      granularity={trend.granularity}
                      accentColor="#3f7573"
                      width={232}
                      height={130}
                    />
                  </div>
                )}

                {/* Fire Insights — only when Fire filter active */}
                {isFireMode && !fireInsights.isLoading && (fireInsights.causes.length > 0 || fireInsights.propertyTypes.length > 0) && (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-brick-400/80">
                        Fire Insights
                      </p>
                      <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                    </div>

                    {/* Top Causes */}
                    {fireInsights.causes.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-2">
                          Top Causes
                        </p>
                        <HorizontalBarChart
                          data={fireInsights.causes.map(c => ({ label: c.label, value: c.count, color: '#b85545' }))}
                          width={232}
                          height={100}
                          maxBars={5}
                        />
                      </div>
                    )}

                    {/* Property Types */}
                    {fireInsights.propertyTypes.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-2">
                          Property Types
                        </p>
                        <HorizontalBarChart
                          data={fireInsights.propertyTypes.map(p => ({ label: p.label, value: p.count, color: '#e8896b' }))}
                          width={232}
                          height={80}
                          maxBars={4}
                        />
                      </div>
                    )}

                    {/* Detection Rate */}
                    {fireInsights.detectionStats && (
                      <div>
                        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-2">
                          Detection Rate
                        </p>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-moss-400 text-sm font-bold">
                              {fireInsights.detectionStats.detectorsPresent}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Detectors
                            </p>
                          </div>
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-ochre-500 text-sm font-bold">
                              {fireInsights.detectionStats.effectiveAlert}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Effective
                            </p>
                          </div>
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-brick-400 text-sm font-bold">
                              {fireInsights.detectionStats.sprinklersPresent}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Sprinklers
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </MapSidebar>
      </div>
    </div>
  )
}
