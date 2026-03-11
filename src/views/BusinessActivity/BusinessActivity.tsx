import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
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

type MapMode = 'heatmap' | 'anomaly'
type SidebarTab = 'sectors' | 'neighborhoods'

const SELECT_FIELDS = 'uniqueid,dba_name,ownership_name,full_business_address,city,dba_start_date,dba_end_date,naic_code,naic_code_description,parking_tax,transient_occupancy_tax,location'

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

  // --- WHERE clause construction ---
  const sectorClause = useMemo(() => {
    if (selectedSectors.size === 0) return ''
    const escaped = Array.from(selectedSectors).map((c) => `'${c.replace(/'/g, "''")}'`)
    return `naic_code_description IN (${escaped.join(',')})`
  }, [selectedSectors])

  const whereClause = useMemo(() => {
    const conditions: string[] = [SF_CITY_FILTER]
    conditions.push(`(dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59') OR (dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59')`)
    if (sectorClause) conditions.push(sectorClause)
    return conditions.map((c, i) => i === 0 ? c : `(${c})`).join(' AND ')
  }, [dateRange, sectorClause])

  // Openings clause: businesses that opened in the date range (with optional sector filter)
  const openingsClause = useMemo(() => {
    const base = `${SF_CITY_FILTER} AND dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59'`
    return sectorClause ? `${base} AND ${sectorClause}` : base
  }, [dateRange, sectorClause])

  const closuresClause = useMemo(() => {
    const base = `${SF_CITY_FILTER} AND dba_end_date >= '${dateRange.start}T00:00:00' AND dba_end_date <= '${dateRange.end}T23:59:59'`
    return sectorClause ? `${base} AND ${sectorClause}` : base
  }, [dateRange, sectorClause])

  // Date-only openings clause for sector aggregation (no sector filter, so all sectors visible)
  const openingsDateOnlyClause = useMemo(() => {
    return `${SF_CITY_FILTER} AND dba_start_date >= '${dateRange.start}T00:00:00' AND dba_start_date <= '${dateRange.end}T23:59:59'`
  }, [dateRange])

  // Data freshness detection
  const freshness = useDataFreshness('businessLocations', 'dba_start_date', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'businessLocations',
    dateField: 'dba_start_date',
    baseWhere: SF_CITY_FILTER,
  }), [])
  const trend = useTrendBaseline(trendConfig, dateRange, sectorClause || undefined)

  // --- Primary data: business locations ---
  const { data: rawData, isLoading, error, hitLimit } = useDataset<BusinessLocationRecord>(
    'businessLocations',
    { $where: whereClause, $limit: 5000, $select: SELECT_FIELDS },
    [whereClause]
  )

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

  const { data: activeCountRows } = useDataset<{ count: string }>(
    'businessLocations',
    { $select: 'count(*) as count', $where: `${SF_CITY_FILTER} AND dba_end_date IS NULL` },
    [SF_CITY_FILTER]
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

  // Prior-year openings for ghost bars
  const priorOpeningsClause = useMemo(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    start.setFullYear(start.getFullYear() - 1)
    end.setFullYear(end.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return `${SF_CITY_FILTER} AND dba_start_date >= '${fmt(start)}T00:00:00' AND dba_start_date <= '${fmt(end)}T23:59:59'`
  }, [dateRange])

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

  // Prior-year closures for ghost bars
  const priorClosuresClause = useMemo(() => {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    start.setFullYear(start.getFullYear() - 1)
    end.setFullYear(end.getFullYear() - 1)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return `${SF_CITY_FILTER} AND dba_end_date >= '${fmt(start)}T00:00:00' AND dba_end_date <= '${fmt(end)}T23:59:59'`
  }, [dateRange])

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

  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

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
    neighborhoodBoundaries,
    sectorRows,
    monthlyOpeningRows,
    monthlyClosureRows,
    priorOpeningRows,
    priorClosureRows,
    openingsCount,
    closuresCount,
    activeCount,
    priorOpeningsCount,
    priorClosuresCount,
  })

  // Chart tiles
  const chartTiles = useMemo<ChartTileDef[]>(() => {
    const tiles: ChartTileDef[] = []
    if (monthlyFormation.length > 0) {
      tiles.push({
        id: 'net-formation',
        label: 'Net Formation',
        shortLabel: 'Formation',
        color: '#10b981',
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
        color: '#8b5cf6',
        defaultExpanded: true,
        render: () => <HorizontalBarChart data={sectorBars} width={320} height={120} maxBars={6} />,
      })
    }
    return tiles
  }, [monthlyFormation, priorFormation, sectorBars])

  const heatmapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'business-heat',
      type: 'heatmap',
      source: 'business-heatmap-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(16, 185, 129, 0.15)',
          0.25, 'rgba(16, 185, 129, 0.3)',
          0.5, 'rgba(16, 185, 129, 0.5)',
          0.8, 'rgba(5, 150, 105, 0.7)',
          1, 'rgba(4, 120, 87, 0.85)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'business-points',
      type: 'circle',
      source: 'business-heatmap-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 10],
        'circle-color': [
          'match', ['get', 'status'],
          'opened', '#10b981',
          'closed', '#ef4444',
          'active', '#64748b',
          '#64748b',
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.2)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

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
      paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.4 },
    } as mapboxgl.AnyLayer,
  ], [])

  // Bind layers
  useMapLayer(mapInstance, 'business-heatmap-data', heatmapGeojson, heatmapLayers)
  useMapLayer(mapInstance, 'neighborhood-anomaly', anomalyGeojson, anomalyLayers)

  // Tooltips
  useMapTooltip(mapInstance, 'business-points', (props) => {
    const startFormatted = props.startDate
      ? new Date(String(props.startDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
    const statusColor = props.status === 'opened' ? '#10b981' : props.status === 'closed' ? '#ef4444' : '#64748b'
    const statusLabel = String(props.status).charAt(0).toUpperCase() + String(props.status).slice(1)
    return `
      <div class="tooltip-value">${props.dbaName || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Status</div>
      <div style="color:${statusColor};font-weight:600">${statusLabel}</div>
      <div class="tooltip-label" style="margin-top:6px">Sector</div>
      <div style="color:#e2e8f0">${props.sector || 'Uncategorized'}</div>
      <div class="tooltip-label" style="margin-top:4px">Address</div>
      <div style="color:#94a3b8">${props.address || 'Unknown'}</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
      ${startFormatted ? `<div class="tooltip-label" style="margin-top:6px">Opened</div><div style="color:#94a3b8">${startFormatted}</div>` : ''}
      ${props.endDate ? `<div class="tooltip-label" style="margin-top:4px">Closed</div><div style="color:#ef4444">${new Date(String(props.endDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
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
        <span style="color:#10b981">${Number(props.openings).toLocaleString()}</span>
        /
        <span style="color:#ef4444">${Number(props.closures).toLocaleString()}</span>
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

  const handleNeighborhoodClick = useCallback((neighborhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === neighborhood ? null : neighborhood)
    const nhoodItems = dataWithNeighborhoods.filter((d) => d.neighborhood === neighborhood)
    if (nhoodItems.length > 0 && mapInstance) {
      const avgLat = nhoodItems.reduce((s, d) => s + d.lat, 0) / nhoodItems.length
      const avgLng = nhoodItems.reduce((s, d) => s + d.lng, 0) / nhoodItems.length
      mapInstance.flyTo({ center: [avgLng, avgLat], zoom: 14, duration: 1200 })
    }
  }, [dataWithNeighborhoods, mapInstance, selectedNeighborhood, setSelectedNeighborhood])

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
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-500/80 bg-emerald-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 pulse-live" />
                  {formatNumber(filteredData.length)} records
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
            <ExportButton targetSelector="#ba-capture" filename="business-activity" />
          </div>
        </div>
      </header>

      {/* Content */}
      <div id="ba-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning businesses" color="#10b981" />}
            <MapProgressBar color="#10b981" />

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
                  <span className="text-[9px] font-mono text-blue-400">-2{'\u03C3'}</span>
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                    {['#3b82f6', '#93c5fd', '#e2e8f0', '#fbbf24', '#ef4444', '#7f1d1d'].map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-red-400">+3{'\u03C3'}</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">below avg {'\u2192'} above avg</p>
              </div>
            )}

            <BusinessDetailPanel />
          </MapView>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['sectors', 'Sectors'], ['neighborhoods', 'Neighborhoods']] as const).map(([key, label]) => (
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
                    {'\u2190'} Clear filter: {selectedNeighborhood}
                  </button>
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
                              {ns.total.toLocaleString()} businesses
                              {ns.openings > 0 && <span className="text-emerald-400"> · {ns.openings} opened</span>}
                              {ns.closures > 0 && <span className="text-red-400"> · {ns.closures} closed</span>}
                              {' · net '}
                              <span className={ns.netChange >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {ns.netChange >= 0 ? '+' : ''}{ns.netChange}
                              </span>
                              {nhTrend?.priorYearCount ? (
                                <span className={nhTrend.yoyPct > 0 ? 'text-emerald-400' : nhTrend.yoyPct < 0 ? 'text-red-400' : ''}>
                                  {' · '}{nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}% since last yr
                                </span>
                              ) : null}
                              {zScore !== undefined && (
                                <span className={zScore > 1 ? 'text-red-400' : zScore < -1 ? 'text-blue-400' : ''}>
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
        </aside>
      </div>
    </div>
  )
}
