import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { CensusVariable } from '@/types/census'
import { useCensusData } from '@/hooks/useCensusData'
import { useDemographicUnderlay } from '@/components/maps/DemographicUnderlay'
import UnderlayPicker from '@/components/maps/UnderlayPicker'
import NeighborhoodCensusContext from '@/components/ui/NeighborhoodCensusContext'
import { UNDERLAY_PRESETS } from '@/utils/censusVariables'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useAppStore } from '@/stores/appStore'
import type { BusinessLocationRecord, SectorAggRow, BusinessMonthlyRow } from '@/types/datasets'
import { formatNumber } from '@/utils/time'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import MapSidebar from '@/components/layout/MapSidebar'
import CardTray from '@/components/ui/CardTray'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import SectorFilter from '@/components/filters/SectorFilter'
import NetFormationChart from '@/components/charts/NetFormationChart'
import HorizontalBarChart from '@/components/charts/HorizontalBarChart'
import BusinessDetailPanel from '@/components/ui/BusinessDetailPanel'
import ExportButton from '@/components/export/ExportButton'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { SkeletonStatCards, SkeletonSidebarRows, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import InfoTip from '@/components/ui/InfoTip'
import { useBusinessActivityData } from './useBusinessActivityData'
import { BUSINESS_HEATMAP_LAYERS, ANOMALY_LAYERS } from './mapLayers'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'sectors' | 'neighborhoods'

const SELECT_FIELDS = 'uniqueid,certificate_number,ttxid,dba_name,ownership_name,full_business_address,city,dba_start_date,dba_end_date,location_start_date,location_end_date,administratively_closed,naic_code,naic_code_description,naics_code_descriptions_list,lic,lic_code_description,parking_tax,transient_occupancy_tax,business_corridor,neighborhoods_analysis_boundaries,community_benefit_district,supervisor_district,mailing_address_1,mail_city,mail_state,mail_zipcode,location'

const SF_CITY_FILTER = "city = 'San Francisco'"

export default function BusinessActivity() {
  const { dateRange, setDateRange, selectedBusiness, setSelectedBusiness } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sectors')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Widen to 12-month range if current range is < 90 days (business data is sparse at 30d)
  useEffect(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (days < 90) {
      const twelveMonthsAgo = new Date(end)
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
      setDateRange(twelveMonthsAgo.toISOString().split('T')[0], end.toISOString().split('T')[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link: detail panel
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedBusiness(detailParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedBusiness) next.set('detail', selectedBusiness)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedBusiness, setSearchParams])

  const mapMode = (searchParams.get('map_mode') as MapMode) || 'heatmap'
  const selectedSectors = useMemo(() => {
    const param = searchParams.get('sectors')
    if (!param) return new Set<string>()
    return new Set(param.split(',').map(decodeURIComponent))
  }, [searchParams])
  const selectedNeighborhood = searchParams.get('neighborhood') || null
  const selectedCorridor = searchParams.get('corridor') || null

  const setMapMode = useCallback((mode: MapMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === 'heatmap') next.delete('map_mode')
      else next.set('map_mode', mode)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedSectors = useCallback((sectors: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (sectors.size === 0) next.delete('sectors')
      else next.set('sectors', Array.from(sectors).map(encodeURIComponent).join(','))
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

  const setSelectedCorridor = useCallback((c: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!c) next.delete('corridor')
      else next.set('corridor', c)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // --- WHERE clause construction ---
  const sectorClause = useMemo(() => {
    if (selectedSectors.size === 0) return ''
    const escaped = Array.from(selectedSectors).map((c) => `'${c.replace(/'/g, "''")}'`)
    return `naic_code_description IN (${escaped.join(',')})`
  }, [selectedSectors])

  // Corridor predicate is folded into every WHERE site so server-side counts
  // (openings, closures, active, sector aggregation, prior-year YoY) all reflect
  // the corridor scope. Client-side `filteredData` in the data hook handles
  // marker/list filtering — but stat cards and trend charts come from these
  // server queries, which is why corridor needs to be here too.
  const corridorClause = useMemo(() => {
    if (!selectedCorridor) return ''
    const escaped = selectedCorridor.replace(/'/g, "''")
    return `business_corridor = '${escaped}'`
  }, [selectedCorridor])

  // Neighborhood predicate is folded into every WHERE site for the same reason
  // as corridor: server-side counts and aggregates need to reflect the narrowed
  // scope, not just the map markers. This also unlocks completeness for small
  // neighborhoods whose data was previously diluted by the citywide row cap.
  // SF datasets are inconsistent: businessLocations uses the plural
  // `neighborhoods_analysis_boundaries`, while Crime/311/etc. use
  // `analysis_neighborhood` (singular). Both are SF analysis-neighborhood
  // strings, so the camera presets and dropdown values match by exact equality.
  const neighborhoodClause = useMemo(() => {
    if (!selectedNeighborhood) return ''
    const escaped = selectedNeighborhood.replace(/'/g, "''")
    return `neighborhoods_analysis_boundaries = '${escaped}'`
  }, [selectedNeighborhood])

  const whereClause = useMemo(() => {
    const conditions: string[] = [SF_CITY_FILTER]
    conditions.push(`(dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59') OR (dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59')`)
    if (sectorClause) conditions.push(sectorClause)
    if (corridorClause) conditions.push(corridorClause)
    if (neighborhoodClause) conditions.push(neighborhoodClause)
    return conditions.map((c, i) => i === 0 ? c : `(${c})`).join(' AND ')
  }, [dateRange, sectorClause, corridorClause, neighborhoodClause])

  // Openings clause: businesses that opened in the date range (with optional filters)
  const openingsClause = useMemo(() => {
    const parts = [`${SF_CITY_FILTER} AND dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59'`]
    if (sectorClause) parts.push(sectorClause)
    if (corridorClause) parts.push(corridorClause)
    if (neighborhoodClause) parts.push(neighborhoodClause)
    return parts.join(' AND ')
  }, [dateRange, sectorClause, corridorClause, neighborhoodClause])

  const closuresClause = useMemo(() => {
    const parts = [`${SF_CITY_FILTER} AND dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59'`]
    if (sectorClause) parts.push(sectorClause)
    if (corridorClause) parts.push(corridorClause)
    if (neighborhoodClause) parts.push(neighborhoodClause)
    return parts.join(' AND ')
  }, [dateRange, sectorClause, corridorClause, neighborhoodClause])

  // Date-only openings clause for sector aggregation (no sector filter so all
  // sectors are visible; corridor + neighborhood ARE applied so the sector
  // list reflects what's in the selected scope).
  const openingsDateOnlyClause = useMemo(() => {
    const parts = [`${SF_CITY_FILTER} AND dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59'`]
    if (corridorClause) parts.push(corridorClause)
    if (neighborhoodClause) parts.push(neighborhoodClause)
    return parts.join(' AND ')
  }, [dateRange, corridorClause, neighborhoodClause])

  // Data freshness detection
  const freshness = useDataFreshness('businessLocations', 'dba_start_date', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'businessLocations',
    dateField: 'dba_start_date',
    baseWhere: SF_CITY_FILTER,
  }), [])
  const trend = useTrendBaseline(trendConfig, dateRange, sectorClause || undefined)

  // --- Primary data: split into openings + closures to avoid sort bias ---
  // A single query with (start_date OR end_date) + ORDER BY start_date would
  // cut off closures at the row limit. Two queries with correct sort per field.
  const { data: openingsRaw, isLoading: openingsLoading, error: openingsError, hitLimit: openingsHitLimit } = useDataset<BusinessLocationRecord>(
    'businessLocations',
    { $where: openingsClause, $limit: 3000, $select: SELECT_FIELDS, $order: 'dba_start_date DESC' },
    [openingsClause]
  )
  const { data: closuresRaw, isLoading: closuresLoading, error: closuresError } = useDataset<BusinessLocationRecord>(
    'businessLocations',
    { $where: closuresClause, $limit: 3000, $select: SELECT_FIELDS, $order: 'dba_end_date DESC' },
    [closuresClause]
  )
  const rawData = useMemo(() => {
    // Deduplicate: a business that opened AND closed in range appears in both queries
    const seen = new Set<string>()
    const merged: BusinessLocationRecord[] = []
    for (const r of [...openingsRaw, ...closuresRaw]) {
      if (!seen.has(r.uniqueid)) {
        seen.add(r.uniqueid)
        merged.push(r)
      }
    }
    return merged
  }, [openingsRaw, closuresRaw])
  const isLoading = openingsLoading || closuresLoading
  const error = openingsError || closuresError
  const hitLimit = openingsHitLimit

  // Server-side counts
  const { data: openingsCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: openingsClause },
    [openingsClause]
  )
  const openingsCount = openingsCountRows[0] ? parseInt(openingsCountRows[0].count, 10) : null

  const { data: closuresCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: closuresClause },
    [closuresClause]
  )
  const closuresCount = closuresCountRows[0] ? parseInt(closuresCountRows[0].count, 10) : null

  // Admin-closure count: subset of closures where administratively_closed = "Yes"
  // (forced closures from tax/license/regulatory issues, vs. voluntary closure)
  const adminClosuresClause = useMemo(
    () => `(${closuresClause}) AND UPPER(administratively_closed) = 'YES'`,
    [closuresClause],
  )
  const { data: adminClosuresCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: adminClosuresClause },
    [adminClosuresClause]
  )
  const adminClosuresCount = adminClosuresCountRows[0] ? parseInt(adminClosuresCountRows[0].count, 10) : null

  // Active count narrows by corridor + neighborhood when one is selected, so
  // the "Active" pill matches the user's narrowed scope rather than always
  // showing the citywide total.
  const activeCountWhere = useMemo(() => {
    const parts = [`${SF_CITY_FILTER} AND dba_end_date IS NULL`]
    if (corridorClause) parts.push(corridorClause)
    if (neighborhoodClause) parts.push(neighborhoodClause)
    return parts.join(' AND ')
  }, [corridorClause, neighborhoodClause])
  const { data: activeCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: activeCountWhere },
    [activeCountWhere]
  )
  const activeCount = activeCountRows[0] ? parseInt(activeCountRows[0].count, 10) : null

  const { data: totalCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: whereClause },
    [whereClause]
  )
  const totalCount = totalCountRows[0] ? parseInt(totalCountRows[0].count, 10) : null

  // Sector aggregation
  const { data: sectorRows } = useDataset<SectorAggRow>(
    'businessLocations',
    {
      $select: 'naic_code_description, count(*) as cnt',
      $group: 'naic_code_description',
      $where: openingsDateOnlyClause,
      $order: 'cnt DESC',
      $limit: 30,
    },
    [openingsDateOnlyClause]
  )

  // Corridor list — server-side aggregate of all distinct corridor values
  // (sorted by population). Static-ish list since SF defines a fixed set;
  // we keep it date-independent so the dropdown remains stable across
  // date-range changes.
  const { data: corridorRows } = useDataset<{ business_corridor: string; cnt: string }>(
    'businessLocations',
    {
      $select: 'business_corridor, count(*) as cnt',
      $group: 'business_corridor',
      $where: `${SF_CITY_FILTER} AND business_corridor IS NOT NULL AND trim(business_corridor) != ''`,
      $order: 'cnt DESC',
      $limit: 100,
    },
    [],
  )
  const corridors = useMemo(
    () => corridorRows
      .map((r) => ({ name: r.business_corridor, count: parseInt(r.cnt, 10) || 0 }))
      .filter((c) => c.name && c.name.trim().length > 0),
    [corridorRows],
  )

  // Monthly openings
  const { data: monthlyOpeningRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_start_date) as month, count(*) as cnt',
      $group: 'month',
      $where: openingsClause,
      $order: 'month',
      $limit: 50,
    },
    [openingsClause]
  )

  // Monthly closures
  const { data: monthlyClosureRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_end_date) as month, count(*) as cnt',
      $group: 'month',
      $where: closuresClause,
      $order: 'month',
      $limit: 50,
    },
    [closuresClause]
  )

  // Prior-year openings for ghost bars (corridor + neighborhood-aware so YoY
  // comparisons stay within the same scope when one is selected)
  const priorOpeningsClause = useMemo(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    start.setFullYear(start.getFullYear() - 1)
    end.setFullYear(end.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const parts = [`${SF_CITY_FILTER} AND dba_start_date >= '${fmt(start)}T00:00:00' AND dba_start_date <= '${fmt(end)}T23:59:59'`]
    if (corridorClause) parts.push(corridorClause)
    if (neighborhoodClause) parts.push(neighborhoodClause)
    return parts.join(' AND ')
  }, [dateRange, corridorClause, neighborhoodClause])

  const { data: priorOpeningRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_start_date) as month, count(*) as cnt',
      $group: 'month',
      $where: priorOpeningsClause,
      $order: 'month',
      $limit: 50,
    },
    [priorOpeningsClause]
  )

  // Prior-year closures for ghost bars (corridor + neighborhood-aware)
  const priorClosuresClause = useMemo(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    start.setFullYear(start.getFullYear() - 1)
    end.setFullYear(end.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const parts = [`${SF_CITY_FILTER} AND dba_end_date >= '${fmt(start)}T00:00:00' AND dba_end_date <= '${fmt(end)}T23:59:59'`]
    if (corridorClause) parts.push(corridorClause)
    if (neighborhoodClause) parts.push(neighborhoodClause)
    return parts.join(' AND ')
  }, [dateRange, corridorClause, neighborhoodClause])

  const { data: priorClosureRows } = useDataset<BusinessMonthlyRow>(
    'businessLocations',
    {
      $select: 'date_trunc_ym(dba_end_date) as month, count(*) as cnt',
      $group: 'month',
      $where: priorClosuresClause,
      $order: 'month',
      $limit: 50,
    },
    [priorClosuresClause]
  )

  // Prior-year counts for YoY (reuse prior-year clause definitions from above)
  const { data: priorOpeningsCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: priorOpeningsClause },
    [priorOpeningsClause]
  )
  const priorOpeningsCount = priorOpeningsCountRows[0] ? parseInt(priorOpeningsCountRows[0].count, 10) : null

  const { data: priorClosuresCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: priorClosuresClause },
    [priorClosuresClause]
  )
  const priorClosuresCount = priorClosuresCountRows[0] ? parseInt(priorClosuresCountRows[0].count, 10) : null

  const priorAdminClosuresClause = useMemo(
    () => `(${priorClosuresClause}) AND UPPER(administratively_closed) = 'YES'`,
    [priorClosuresClause],
  )
  const { data: priorAdminClosuresCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: priorAdminClosuresClause },
    [priorAdminClosuresClause]
  )
  const priorAdminClosuresCount = priorAdminClosuresCountRows[0] ? parseInt(priorAdminClosuresCountRows[0].count, 10) : null

  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

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
    beforeLayerId: 'business-heat-openings',
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

  // --- Computed data (extracted to hook) ---
  const {
    dataWithNeighborhoods,
    filteredData,
    neighborhoodEntries,
    neighborhoodAnomalies,
    sectorEntries,
    sectorBars,
    monthlyFormation,
    priorFormation,
    cardDefs,
    heatmapGeojson,
    anomalyGeojson,
  } = useBusinessActivityData({
    rawData,
    dateRange,
    mapMode,
    selectedNeighborhood,
    selectedCorridor,
    neighborhoodBoundaries,
    sectorRows,
    monthlyOpeningRows,
    monthlyClosureRows,
    priorOpeningRows,
    priorClosureRows,
    openingsCount,
    closuresCount,
    adminClosuresCount,
    activeCount,
    priorOpeningsCount,
    priorClosuresCount,
    priorAdminClosuresCount,
  })

  // Chart tiles
  const chartTiles = useMemo<ChartTileDef[]>(() => {
    const tiles: ChartTileDef[] = []
    if (monthlyFormation.length > 0) {
      tiles.push({
        id: 'net-formation',
        label: 'Net Formation',
        shortLabel: 'Formation',
        color: '#7a9954',
        defaultExpanded: true,
        render: () => (
          <NetFormationChart
            data={monthlyFormation}
            priorYear={priorFormation.length > 0 ? priorFormation : undefined}
            width={320}
            height={140}
          />
        ),
      })
    }
    if (sectorBars.length > 0) {
      tiles.push({
        id: 'top-sectors',
        label: 'Top Sectors',
        shortLabel: 'Sectors',
        color: '#8b6282',
        defaultExpanded: true,
        render: () => <HorizontalBarChart data={sectorBars} width={320} height={120} maxBars={6} />,
      })
    }
    return tiles
  }, [monthlyFormation, priorFormation, sectorBars])

  // Build 3 separate GeoJSON sources for dual heatmap (green openings + red closures + colored circles)
  const openingsGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || filteredData.length === 0) return null
    const features = filteredData
      .filter((r) => r.status === 'opened')
      .map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: { uniqueId: r.uniqueId, dbaName: r.dbaName, sector: r.sector, status: r.status, address: r.address, neighborhood: r.neighborhood, startDate: r.startDate, endDate: r.endDate },
      }))
    return { type: 'FeatureCollection', features }
  }, [filteredData, mapMode])

  const closuresGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || filteredData.length === 0) return null
    const features = filteredData
      .filter((r) => r.status === 'closed')
      .map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: { uniqueId: r.uniqueId, dbaName: r.dbaName, sector: r.sector, status: r.status, address: r.address, neighborhood: r.neighborhood, startDate: r.startDate, endDate: r.endDate },
      }))
    return { type: 'FeatureCollection', features }
  }, [filteredData, mapMode])

  const allPointsGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapMode !== 'heatmap' || filteredData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: filteredData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: { uniqueId: r.uniqueId, dbaName: r.dbaName, sector: r.sector, status: r.status, address: r.address, neighborhood: r.neighborhood, startDate: r.startDate, endDate: r.endDate },
      })),
    }
  }, [filteredData, mapMode])

  // Bind layers (3 sources for dual heatmap + anomaly choropleth)
  useMapLayer(mapInstance, 'business-openings', openingsGeojson, BUSINESS_HEATMAP_LAYERS.openingsHeatLayers)
  useMapLayer(mapInstance, 'business-closures', closuresGeojson, BUSINESS_HEATMAP_LAYERS.closuresHeatLayers)
  useMapLayer(mapInstance, 'business-all-points', allPointsGeojson, BUSINESS_HEATMAP_LAYERS.pointsLayers)
  useMapLayer(mapInstance, 'neighborhood-anomaly', anomalyGeojson, ANOMALY_LAYERS)

  // Tooltips
  // Hover answers "is this worth clicking?" — name, status, sector only.
  // Click opens the full detail panel with BAN, license, corridor, mailing,
  // dates, etc. Don't duplicate the panel here.
  useMapTooltip(mapInstance, 'business-points', (props) => {
    const statusColor = props.status === 'opened' ? '#7a9954' : props.status === 'closed' ? '#b85545' : '#64748b'
    const statusLabel = props.status === 'opened' ? 'Opened in range'
      : props.status === 'closed' ? 'Closed in range'
      : 'Active'
    return `
      <div class="tooltip-value">${props.dbaName || 'Unknown'}</div>
      <div style="color:${statusColor};font-weight:600;font-size:10px;margin-top:4px">${statusLabel}</div>
      <div style="color:#94a3b8;font-size:10px;margin-top:2px">${props.sector || 'Uncategorized'}</div>
      <div style="color:#64748b;font-size:9px;margin-top:6px;font-style:italic">Click for details</div>
    `
  })

  useMapTooltip(mapInstance, 'neighborhood-fill', (props) => {
    const zScore = Number(props.zScore).toFixed(1)
    const sign = Number(props.zScore) >= 0 ? '+' : ''
    return `
      <div class="tooltip-label">Neighborhood</div>
      <div class="tooltip-value">${props.nhood || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Business Anomaly</div>
      <div class="tooltip-value">${sign}${zScore}\u03C3</div>
      <div class="tooltip-label" style="margin-top:6px">Businesses</div>
      <div style="color:#94a3b8">${Number(props.businessCount).toLocaleString()}</div>
      <div class="tooltip-label" style="margin-top:4px">Openings / Closures</div>
      <div style="color:#94a3b8">
        <span style="color:#7a9954">${Number(props.openings).toLocaleString()}</span>
        /
        <span style="color:#b85545">${Number(props.closures).toLocaleString()}</span>
      </div>
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
      setSelectedBusiness(String(uniqueId))
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800 })
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('business-points')) {
          mapInstance.on('click', 'business-points', handleClick)
          return true
        }
      } catch { /* */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => { clearInterval(interval); try { mapInstance.off('click', 'business-points', handleClick) } catch { /* */ } }
    }

    return () => { try { mapInstance.off('click', 'business-points', handleClick) } catch { /* */ } }
  }, [mapInstance, setSelectedBusiness])

  const handleMapReady = useCallback((map: mapboxgl.Map) => { setMapInstance(map) }, [])

  // Click handler: just toggles the URL state. The camera animation is
  // handled reactively by `useMapCameraPresets` below, which watches the
  // selection and applies the right preset (or fit-bounds fallback). Keeps
  // the click handler tiny and lets every other map view get the same
  // camera behavior with one hook call.
  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    const isClearing = selectedNeighborhood === neighborhood
    setSelectedNeighborhood(isClearing ? null : neighborhood)
  }, [selectedNeighborhood, setSelectedNeighborhood])

  // Memoized fallback points for the camera-preset hook. The hook uses
  // these for fit-bounds (corridor) or centroid-flyTo (neighborhood) when
  // no preset matches the selection. Filtering to the active selection
  // produces a tighter frame than passing every point on the map.
  const cameraFallbackPoints = useMemo(() => {
    if (selectedCorridor) {
      const target = selectedCorridor.toLowerCase()
      return dataWithNeighborhoods
        .filter((d) => d.corridor?.toLowerCase() === target)
        .map((d) => ({ lat: d.lat, lng: d.lng }))
    }
    if (selectedNeighborhood) {
      return dataWithNeighborhoods
        .filter((d) => d.neighborhood === selectedNeighborhood)
        .map((d) => ({ lat: d.lat, lng: d.lng }))
    }
    return []
  }, [dataWithNeighborhoods, selectedCorridor, selectedNeighborhood])

  // Single hook call wires up corridor + neighborhood preset application
  // and reset-on-clear. The lookup tables in `mapDefaults.ts` are global,
  // so any preset tuned in any view applies in every view that uses this
  // hook with the same selection string.
  useMapCameraPresets(mapInstance, {
    selectedCorridor,
    selectedNeighborhood,
    fallbackPoints: cameraFallbackPoints,
  })

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Business Activity
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                Registered Businesses &middot; Openings & Closures
              </p>
            </div>
            {!isLoading && filteredData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-moss-500/80 bg-moss-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-moss-500 pulse-live" />
                  {formatNumber(filteredData.length)} records
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
              <UnderlayPicker
                presets={UNDERLAY_PRESETS['business-activity'] ?? []}
                activeVariable={underlayVariable}
                onSelect={setUnderlayVariable}
              />
            <ExportButton targetSelector="#ba-capture" filename="business-activity" />
          </div>
        </div>
      </header>

      {/* Content */}
      <div id="ba-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning businesses" color="#7a9954" />}
            <MapProgressBar color="#7a9954" />

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
                accentColor="#7a9954"
              />
            )}

            {/* Stat cards */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && filteredData.length > 0 && (
              <CardTray viewId="businessActivity" cards={cardDefs} />
            )}

            {/* Charts */}
            {!isLoading && filteredData.length > 0 && chartTiles.length > 0 && (
              <ChartTray viewId="businessActivity" tiles={chartTiles} />
            )}

            {/* Anomaly legend */}
            {mapMode === 'anomaly' && neighborhoodAnomalies.size > 0 && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Business Anomaly<InfoTip term="anomaly-map" size={10} />
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-teal-500">-2{'\u03C3'}</span>
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                    {['#3f7573', '#8bb5b2', '#e2e8f0', '#e8c06b', '#b85545', '#6f2b20'].map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-brick-400">+3{'\u03C3'}</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">below avg {'\u2192'} above avg</p>
              </div>
            )}

            <BusinessDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <MapSidebar>
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['sectors', 'Sectors'], ['neighborhoods', 'Neighborhoods']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
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
            {sidebarTab === 'sectors' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    Industry Sectors
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                {isLoading && <SkeletonSidebarRows count={8} />}
                {!isLoading && (
                  <SectorFilter
                    categories={sectorEntries}
                    selected={selectedSectors}
                    onChange={setSelectedSectors}
                  />
                )}
              </>
            )}

            {sidebarTab === 'neighborhoods' && (
              <>
                {/* Corridor filter \u2014 SF-defined commercial corridors (Mission, Castro,
                    Hayes Valley, etc.). Single-select. Combines additively with the
                    neighborhood filter so a journalist can ask "Mission Street within
                    the Mission" or "Castro within Castro/Upper Market" cleanly. */}
                {corridors.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-1.5">
                      Commercial Corridor
                    </label>
                    <select
                      value={selectedCorridor || ''}
                      onChange={(e) => setSelectedCorridor(e.target.value || null)}
                      className="w-full text-[11px] bg-white/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06]
                        rounded-md px-2 py-1.5 text-slate-700 dark:text-slate-300
                        focus:outline-none focus:border-moss-500/40 transition-colors"
                    >
                      <option value="">All corridors</option>
                      {corridors.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.count.toLocaleString()})
                        </option>
                      ))}
                    </select>
                    {selectedCorridor && (
                      <button
                        onClick={() => setSelectedCorridor(null)}
                        className="mt-1.5 text-[10px] font-mono text-moss-500 hover:text-moss-400 transition-colors"
                      >
                        {'\u2190'} Clear corridor filter
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 mb-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                    By Neighborhood
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>

                {selectedNeighborhood && (
                  <button
                    onClick={() => setSelectedNeighborhood(null)}
                    className="mb-3 text-[10px] font-mono text-moss-500 hover:text-moss-400 transition-colors"
                  >
                    {'\u2190'} Clear filter: {selectedNeighborhood}
                  </button>
                )}

                {selectedNeighborhood && (
                  <NeighborhoodCensusContext
                    neighborhood={selectedNeighborhood}
                    censusData={censusNeighborhoods.find(n => n.name === selectedNeighborhood)}
                    cityAverages={cityAvg}
                    civicCount={neighborhoodEntries.find(n => n.neighborhood === selectedNeighborhood)?.total}
                    civicLabel="Businesses"
                  />
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
                      accentColor="#7a9954"
                      width={264}
                      height={130}
                    />
                  </div>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
                <div className="space-y-0.5 stagger-in">
                  {neighborhoodEntries.slice(0, 30).map((ns) => {
                    const maxCount = neighborhoodEntries[0]?.total || 1
                    const barWidth = (ns.total / maxCount) * 100
                    const isActive = selectedNeighborhood === ns.neighborhood
                    const zScore = neighborhoodAnomalies.get(ns.neighborhood)
                    const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
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
                              {ns.neighborhood}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono italic">
                              {ns.total.toLocaleString()} businesses
                              {ns.openings > 0 && <span className="text-moss-400"> · {ns.openings} opened</span>}
                              {ns.closures > 0 && <span className="text-brick-400"> · {ns.closures} closed</span>}
                              {' · net '}
                              <span className={ns.netChange >= 0 ? 'text-moss-400' : 'text-brick-400'}>
                                {ns.netChange >= 0 ? '+' : ''}{ns.netChange}
                              </span>
                              {nhTrend?.priorYearCount ? (
                                <span className={nhTrend.yoyPct > 0 ? 'text-moss-400' : nhTrend.yoyPct < 0 ? 'text-brick-400' : ''}>
                                  {' · '}{nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}% since last yr
                                </span>
                              ) : null}
                              {zScore !== undefined && (
                                <span className={zScore > 1 ? 'text-brick-400' : zScore < -1 ? 'text-teal-500' : ''}>
                                  {' · '}{zScore >= 0 ? '+' : ''}{zScore.toFixed(1)}{'\u03C3'}
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
        </MapSidebar>
      </div>
    </div>
  )
}
