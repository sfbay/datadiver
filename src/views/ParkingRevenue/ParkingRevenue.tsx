import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import CivicTicker from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'
import type { CensusVariable } from '@/types/census'
import { eventFlyToOffset } from '@/utils/cameraPadding'
import { useCensusData } from '@/hooks/useCensusData'
import { useDemographicUnderlay } from '@/components/maps/DemographicUnderlay'
import UnderlayPicker from '@/components/maps/UnderlayPicker'
import UnderlayLegend from '@/components/maps/UnderlayLegend'
import NeighborhoodCensusContext from '@/components/ui/NeighborhoodCensusContext'
import { UNDERLAY_PRESETS } from '@/utils/censusVariables'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useAppStore } from '@/stores/appStore'
import type { ParkingMeter, MeterRevenueRecord, MeterAggRow, ParkingStatsAggRow, PaymentTypeAggRow } from '@/types/datasets'
import { formatCurrency, formatNumber } from '@/utils/time'
import { PAYMENT_COLORS } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import MapSidebar from '@/components/layout/MapSidebar'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ExportButton from '@/components/export/ExportButton'
import MeterDetailPanel from '@/components/ui/MeterDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonChart, SkeletonSidebarRows, SkeletonBreakdownList, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import ScannerFeedChips from '@/components/ui/ScannerFeedChips'

type TimeGranularity = 'hour' | 'day' | 'week'

export default function ParkingRevenue() {
  const { dateRange, selectedMeter, setSelectedMeter, selectedNeighborhood, setSelectedNeighborhood } = useAppStore()
  const civicIndicators = useCivicIndicators()
  const [searchParams, setSearchParams] = useSearchParams()
  const [granularity, setGranularity] = useState<TimeGranularity>('day')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Rehydrate detail from URL on mount.
  // Supports both ?detail= (internal share links) and ?meter= (Last48EventPeek deep links).
  useEffect(() => {
    const detailParam = searchParams.get('detail') || searchParams.get('meter')
    if (detailParam) setSelectedMeter(detailParam)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync detail to URL
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (selectedMeter) next.set('detail', selectedMeter)
      else next.delete('detail')
      return next
    }, { replace: true })
  }, [selectedMeter, setSearchParams])

  const deepLinkHandledRef = useRef(false)

  const freshness = useDataFreshness('parkingRevenue', 'session_start_dt', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'parkingRevenue',
    dateField: 'session_start_dt',
    // No neighborhoodField — parking revenue is per-meter, no analysis_neighborhood
    metrics: [
      { selectExpr: 'SUM(gross_paid_amt)', alias: 'revenue', label: 'Revenue', format: (v) => formatCurrency(v) },
    ],
  }), [])
  const trend = useTrendBaseline(trendConfig, dateRange)

  const { data: meters, isLoading: metersLoading } = useDataset<ParkingMeter>(
    'parkingMeters',
    { $limit: 50000 },
    []
  )

  const meterMap = useMemo(() => {
    const map = new Map<string, ParkingMeter>()
    for (const meter of meters) {
      if (meter.post_id) map.set(meter.post_id, meter)
    }
    return map
  }, [meters])

  // Fly to the deep-linked meter on initial load. The click handler path
  // already zooms on user-driven selections — this effect fills the gap for
  // URL-driven selections, where setSelectedMeter fires from the rehydrate
  // effect above but no mapbox click event is emitted. Gated to fire once
  // per session via ref so it doesn't double-fly with subsequent clicks.
  useEffect(() => {
    if (deepLinkHandledRef.current) return
    if (!mapInstance || !selectedMeter || meterMap.size === 0) return
    deepLinkHandledRef.current = true
    const meter = meterMap.get(selectedMeter)
    if (!meter) return // invalid post_id in the URL — detail panel handles the UX
    const lat = parseFloat(meter.latitude) || 0
    const lng = parseFloat(meter.longitude) || 0
    if (lat === 0 || lng === 0) return
    // Offset so the deep-linked meter lands clear of the top-right detail card (w-72 = 288px).
    mapInstance.flyTo({ center: [lng, lat], zoom: 16, duration: 1500, offset: eventFlyToOffset(mapInstance, 288) })
  }, [mapInstance, selectedMeter, meterMap])

  // Visual callout marker on the map for the selected meter. Shows a cyan
  // dot with a pulsing ring. Works for both URL deep-links and click-driven
  // selections. The marker is a DOM element managed by mapboxgl.Marker, so
  // Mapbox handles repositioning during pan/zoom automatically.
  const selectedMarkerRef = useRef<mapboxgl.Marker | null>(null)
  useEffect(() => {
    // Clean up previous marker
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove()
      selectedMarkerRef.current = null
    }

    if (!mapInstance || !selectedMeter || meterMap.size === 0) return

    const meter = meterMap.get(selectedMeter)
    if (!meter) return
    const lat = parseFloat(meter.latitude) || 0
    const lng = parseFloat(meter.longitude) || 0
    if (lat === 0 || lng === 0) return

    const el = document.createElement('div')
    el.className = 'selected-meter-marker'
    el.innerHTML = '<div class="meter-pulse"></div><div class="meter-dot"></div>'

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(mapInstance)

    selectedMarkerRef.current = marker

    return () => { marker.remove() }
  }, [mapInstance, selectedMeter, meterMap])

  // NOTE on neighborhood scoping: unlike BusinessActivity / Cases311 / etc., the
  // `parkingRevenue` dataset has no native neighborhood field — only `post_id`
  // (the meter ID). Neighborhood lives on the `parkingMeters` inventory
  // dataset. Server-side neighborhood filtering would require resolving the
  // selected neighborhood to a list of post_ids (potentially hundreds–
  // thousands per neighborhood) and then injecting `post_id IN (...)` into
  // every revenue WHERE clause. That generates very long URLs that flirt with
  // Socrata's request-length limit, and the per-meter aggregation is already
  // small enough (one row per meter) that client-side filtering on the joined
  // `meterRevenue` array is fast and correct. Decision: keep neighborhood
  // narrowing client-side here. Reconsider if/when SF adds a neighborhood
  // column to parkingRevenue, or if we hit row-cap problems on dense corridors.
  const revenueWhere = useMemo(() => {
    return `session_start_dt >= '${dateRange.start}T00:00:00' AND session_start_dt <= '${dateRange.end}T23:59:59'`
  }, [dateRange])

  // Server-side per-meter aggregation — accurate totals for map + tooltips
  const { data: meterAgg, isLoading, error, refetch } = useDataset<MeterAggRow>(
    'parkingRevenue',
    {
      $select: 'post_id, SUM(gross_paid_amt) as total_revenue, COUNT(*) as tx_count',
      $group: 'post_id',
      $where: revenueWhere,
      $order: 'total_revenue DESC',
      $limit: 10000,
    },
    [revenueWhere]
  )

  // Server-side aggregation for accurate headline totals
  const { data: statsAgg } = useDataset<ParkingStatsAggRow>(
    'parkingRevenue',
    {
      $select: 'SUM(gross_paid_amt) as total_revenue, COUNT(*) as total_count, COUNT(DISTINCT post_id) as unique_meters',
      $where: revenueWhere,
    },
    [revenueWhere]
  )

  // Server-side payment type breakdown
  const { data: paymentAgg } = useDataset<PaymentTypeAggRow>(
    'parkingRevenue',
    {
      $select: 'payment_type, SUM(gross_paid_amt) as total_revenue, COUNT(*) as tx_count',
      $group: 'payment_type',
      $where: revenueWhere,
      $order: 'total_revenue DESC',
      $limit: 20,
    },
    [revenueWhere]
  )

  // Join server-side per-meter totals with meter inventory for lat/lng
  const meterRevenue = useMemo(() => {
    const results: MeterRevenueRecord[] = []
    for (const row of meterAgg) {
      const meter = meterMap.get(row.post_id)
      if (!meter) continue
      const lat = parseFloat(meter.latitude) || 0
      const lng = parseFloat(meter.longitude) || 0
      if (lat === 0 || lng === 0) continue
      const revenue = parseFloat(row.total_revenue) || 0
      const count = parseInt(row.tx_count, 10) || 0
      if (revenue <= 0) continue
      results.push({
        postId: row.post_id,
        streetBlock: meter.street_name || 'Unknown',
        totalRevenue: revenue,
        transactionCount: count,
        avgTransaction: count > 0 ? revenue / count : 0,
        lat, lng,
        neighborhood: meter.analysis_neighborhood || 'Unknown',
        capColor: meter.cap_color || 'Grey',
      })
    }
    return results
  }, [meterAgg, meterMap])

  // Use server-side aggregation for accurate headline stats
  const serverStats = useMemo(() => {
    if (statsAgg.length === 0) return null
    const row = statsAgg[0]
    const totalRevenue = parseFloat(row.total_revenue) || 0
    const totalTransactions = parseInt(row.total_count, 10) || 0
    const uniqueMeters = parseInt(row.unique_meters, 10) || 0
    const avgPerMeter = uniqueMeters > 0 ? totalRevenue / uniqueMeters : 0
    return { totalRevenue, totalTransactions, uniqueMeters, avgPerMeter }
  }, [statsAgg])

  // Server-side payment breakdown
  const paymentBreakdown = useMemo(() => {
    const totalRevenue = serverStats?.totalRevenue || 1
    return paymentAgg.map((row) => ({
      type: row.payment_type || 'OTHER',
      amount: parseFloat(row.total_revenue) || 0,
      count: parseInt(row.tx_count, 10) || 0,
      pct: ((parseFloat(row.total_revenue) || 0) / totalRevenue) * 100,
    }))
  }, [paymentAgg, serverStats])

  // Neighborhood ranking (requires meter join, so uses sample data)
  const topNeighborhoods = useMemo(() => {
    const byNeighborhood = new Map<string, { revenue: number; lats: number[]; lngs: number[] }>()
    for (const m of meterRevenue) {
      const existing = byNeighborhood.get(m.neighborhood) || { revenue: 0, lats: [], lngs: [] }
      existing.revenue += m.totalRevenue
      existing.lats.push(m.lat)
      existing.lngs.push(m.lng)
      byNeighborhood.set(m.neighborhood, existing)
    }
    return Array.from(byNeighborhood.entries())
      .map(([name, d]) => ({
        name,
        revenue: d.revenue,
        centerLat: d.lats.reduce((a, b) => a + b, 0) / d.lats.length,
        centerLng: d.lngs.reduce((a, b) => a + b, 0) / d.lngs.length,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15)
  }, [meterRevenue])

  // Neighborhood boundaries + Census demographic underlay
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

  // Camera presets — applies pitched preset on neighborhood selection,
  // glides to default on clear. Cross-view consistent via the global
  // NEIGHBORHOOD_VIEWS lookup.
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
    beforeLayerId: 'revenue-heat',
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

  // GeoJSON for map
  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (meterRevenue.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: meterRevenue.map((m) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
        properties: { revenue: m.totalRevenue, neighborhood: m.neighborhood, block: m.streetBlock, postId: m.postId, capColor: m.capColor },
      })),
    }
  }, [meterRevenue])

  const maxRev = useMemo(() => meterRevenue.length > 0 ? Math.max(...meterRevenue.map((m) => m.totalRevenue)) : 100, [meterRevenue])

  const mapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'revenue-heat',
      type: 'heatmap',
      source: 'revenue-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'revenue'], 0, 0, maxRev * 0.3, 0.5, maxRev, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 1.0, 15, 1.5],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(8, 145, 178, 0.3)',
          0.25, 'rgba(6, 182, 212, 0.5)',
          0.4, 'rgba(34, 211, 238, 0.6)',
          0.6, 'rgba(103, 232, 249, 0.7)',
          0.8, 'rgba(165, 243, 252, 0.8)',
          1, 'rgba(236, 254, 255, 0.9)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 13, 20, 15, 30],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.75, 15, 0.45, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'revenue-circles',
      type: 'circle',
      source: 'revenue-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, ['interpolate', ['linear'], ['get', 'revenue'], 0, 4, maxRev, 10], 16, ['interpolate', ['linear'], ['get', 'revenue'], 0, 6, maxRev, 14]],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'revenue'],
          0, '#0891b2', maxRev * 0.3, '#8bb5b2', maxRev * 0.6, '#67e8f9', maxRev, '#ecfeff',
        ],
        'circle-opacity': 0.85,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(8,145,178,0.4)',
      },
    } as mapboxgl.AnyLayer,
  ], [maxRev])

  useMapLayer(mapInstance, 'revenue-data', geojson, mapLayers)

  // Hover tooltip on circle layer
  useMapTooltip(mapInstance, 'revenue-circles', (props) => {
    const rev = Number(props.revenue).toFixed(2)
    return `
      <div class="tooltip-label">Revenue</div>
      <div class="tooltip-value">$${rev}</div>
      <div class="tooltip-label" style="margin-top:6px">Location</div>
      <div style="color:#e2e8f0">${props.block || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
    `
  })

  // Click to select meter for detail panel
  useEffect(() => {
    if (!mapInstance) return
    const layer = 'revenue-circles'

    const onClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const feature = e.features?.[0]
      if (!feature) return
      const postId = feature.properties?.postId as string
      if (!postId) return
      setSelectedMeter(postId)
      const coords = (feature.geometry as GeoJSON.Point).coordinates
      // Offset so the meter lands clear of its own top-right detail card (w-72 = 288px).
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800, offset: eventFlyToOffset(mapInstance, 288) })
    }

    const onCursorEnter = () => { mapInstance.getCanvas().style.cursor = 'pointer' }
    const onCursorLeave = () => { mapInstance.getCanvas().style.cursor = '' }

    try {
      mapInstance.on('click', layer, onClick)
      mapInstance.on('mouseenter', layer, onCursorEnter)
      mapInstance.on('mouseleave', layer, onCursorLeave)
    } catch {
      // Layer may not exist yet; retry after a short delay
      const timer = setTimeout(() => {
        try {
          mapInstance.on('click', layer, onClick)
          mapInstance.on('mouseenter', layer, onCursorEnter)
          mapInstance.on('mouseleave', layer, onCursorLeave)
        } catch { /* ignored */ }
      }, 500)
      return () => clearTimeout(timer)
    }

    return () => {
      try {
        mapInstance.off('click', layer, onClick)
        mapInstance.off('mouseenter', layer, onCursorEnter)
        mapInstance.off('mouseleave', layer, onCursorLeave)
      } catch { /* ignored */ }
    }
  }, [mapInstance, setSelectedMeter])

  const maxNeighborhoodRevenue = topNeighborhoods.length > 0 ? topNeighborhoods[0].revenue : 1

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  // Card tray definitions
  const cardDefs = useMemo((): CardDef[] => {
    if (!serverStats) return []
    return [
      {
        id: 'total-revenue',
        label: 'Total Revenue',
        shortLabel: 'Revenue',
        value: formatCurrency(serverStats.totalRevenue),
        color: '#5c9693',
        delay: 0,
        info: 'total-revenue',
        defaultExpanded: true,
        yoyDelta: trend.cityWideYoY ? trend.cityWideYoY.pct : null,
      },
      {
        id: 'transactions',
        label: 'Transactions',
        shortLabel: 'Txns',
        value: formatNumber(serverStats.totalTransactions),
        color: '#2dd4a8',
        delay: 80,
        info: 'transactions',
        defaultExpanded: true,
      },
      {
        id: 'avg-per-meter',
        label: 'Avg / Meter',
        shortLabel: 'Avg/Meter',
        value: formatCurrency(serverStats.avgPerMeter),
        color: '#ffbe0b',
        delay: 160,
        info: 'avg-per-meter',
        defaultExpanded: true,
      },
      {
        id: 'active-meters',
        label: 'Active Meters',
        shortLabel: 'Meters',
        value: formatNumber(serverStats.uniqueMeters),
        color: '#8b6282',
        delay: 240,
        info: 'active-meters',
        defaultExpanded: false,
      },
    ]
  }, [serverStats, trend.cityWideYoY])

  useProgressScope()

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-20">
        {/* items-start on mobile so the title can wrap on the left while the
            controls flow from the top-right (no empty well); md restores the
            centered single row. */}
        <div className="flex items-start justify-between gap-3 md:items-center">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Parking Revenue
              </h1>
              <p className="hidden sm:block text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SFMTA &middot; Meter Revenue Patterns
              </p>
            </div>
            {/* Transactions count hidden on mobile — it's also in the map's stat
                overlay (Txns), so the header doesn't need to carry it on a phone. */}
            {!isLoading && serverStats && (
              <span className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 text-[10px] font-mono text-signal-blue/80 bg-signal-blue/10 px-2 py-1 rounded-full">
                {formatNumber(serverStats.totalTransactions)} transactions
              </span>
            )}
            {metersLoading && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                Loading meters...
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
              <UnderlayPicker
                presets={UNDERLAY_PRESETS['parking-revenue'] ?? []}
                activeVariable={underlayVariable}
                onSelect={setUnderlayVariable}
              />
            <ExportButton targetSelector="#pr-capture" filename="parking-revenue" />
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['hour', 'day', 'week'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    granularity === g
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {g === 'hour' ? 'Hourly' : g === 'day' ? 'Daily' : 'Weekly'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Cross-view ticker — signals from other datasets */}
      <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-1 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
        <CivicTicker
          items={civicIndicators.items.filter(i => i.source.view !== '/parking-revenue')}
          size="compact"
        />
      </div>

      <div id="pr-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning meters" color="#5c9693" />}
            <MapProgressBar color="#5c9693" />
            <UnderlayLegend variable={underlayVariable} data={censusNeighborhoods} />
            {error && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md rounded-[14px] backdrop-blur-xl bg-white/60 dark:bg-slate-900/60">
                <ErrorState message={error} onRetry={refetch} what="meter revenue" />
              </div>
            )}

            {!isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#5c9693"
              />
            )}

            {!isLoading && serverStats && (
              <CardTray viewId="parkingRevenue" cards={cardDefs} />
            )}
            <MeterDetailPanel />
          </MapView>
        </div>

        <MapSidebar>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">Payment Methods</p>
              <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
            </div>
            {paymentBreakdown.length === 0 && (isLoading || !serverStats) && <SkeletonBreakdownList count={4} />}
            <div className="space-y-3 mb-6 stagger-in">
              {paymentBreakdown.map((entry) => {
                const color = PAYMENT_COLORS[entry.type as keyof typeof PAYMENT_COLORS] || '#64748b'
                const label = entry.type === 'COIN' ? 'Coin' : entry.type === 'CREDIT CARD' ? 'Card' : entry.type === 'SMRT' ? 'App' : entry.type.charAt(0) + entry.type.slice(1).toLowerCase().replace(/_/g, ' ')
                return (
                  <div key={entry.type}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[12px] font-medium text-ink dark:text-slate-200">{label}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{entry.pct.toFixed(0)}%</span>
                        <span className="text-[12px] font-mono font-semibold tabular-nums" style={{ color }}>{formatCurrency(entry.amount)}</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-slate-100 dark:bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full bar-grow" style={{ width: `${entry.pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {!trend.isLoading && trend.currentPeriods.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">Volume Trend</p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                <PeriodBreakdownChart
                  current={trend.currentPeriods}
                  priorYear={trend.priorYearPeriods}
                  granularity={trend.granularity}
                  accentColor="#5c9693"
                  width={240}
                  height={130}
                />
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">Top Neighborhoods</p>
              <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
            </div>

            {selectedNeighborhood && (
              <button
                onClick={() => setSelectedNeighborhood(null)}
                className="mb-3 text-[10px] font-mono text-teal-500 hover:text-teal-500 transition-colors"
              >
                {'\u2190'} Clear: {selectedNeighborhood}
              </button>
            )}

            {selectedNeighborhood && (
              <>
                <NeighborhoodCensusContext
                  neighborhood={selectedNeighborhood}
                  censusData={censusNeighborhoods.find(n => n.name === selectedNeighborhood)}
                  cityAverages={cityAvg}
                  civicLabel="Revenue"
                />
                <ScannerFeedChips neighborhood={selectedNeighborhood} serviceFilter="police" />
              </>
            )}

            {topNeighborhoods.length === 0 && isLoading && <SkeletonSidebarRows count={8} />}
            <div className="space-y-0.5 stagger-in">
              {topNeighborhoods.map((ns, i) => {
                const barWidth = (ns.revenue / maxNeighborhoodRevenue) * 100
                return (
                  <div
                    key={ns.name}
                    onClick={() => {
                      setSelectedNeighborhood(selectedNeighborhood === ns.name ? null : ns.name)
                      mapInstance?.flyTo({ center: [ns.centerLng, ns.centerLat], zoom: 14, duration: 1200 })
                    }}
                    className={`relative py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                      selectedNeighborhood === ns.name
                        ? 'bg-teal-500/10 ring-1 ring-teal-500/30'
                        : 'hover:bg-white/60 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 rounded-lg bg-signal-blue/[0.05] bar-grow" style={{ width: `${barWidth}%` }} />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] font-mono text-slate-400/40 dark:text-slate-700 w-4 text-right tabular-nums">{i + 1}</span>
                        <p className="text-[12px] font-medium text-ink dark:text-slate-200 truncate">{ns.name}</p>
                      </div>
                      <span className="text-[12px] font-mono font-semibold text-signal-blue ml-2 whitespace-nowrap tabular-nums">{formatCurrency(ns.revenue)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </MapSidebar>
      </div>
    </div>
  )
}
