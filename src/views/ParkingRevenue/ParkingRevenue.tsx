import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useAppStore } from '@/stores/appStore'
import type { ParkingTransaction, ParkingMeter, MeterRevenueRecord, ParkingStatsAggRow, PaymentTypeAggRow } from '@/types/datasets'
import { formatCurrency, formatNumber } from '@/utils/time'
import { PAYMENT_COLORS } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import StatCard from '@/components/ui/StatCard'
import ExportButton from '@/components/export/ExportButton'
import MeterDetailPanel from '@/components/ui/MeterDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { SkeletonStatCards, SkeletonChart, SkeletonSidebarRows, SkeletonBreakdownList, MapLoadingIndicator } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'

type TimeGranularity = 'hour' | 'day' | 'week'

export default function ParkingRevenue() {
  const { dateRange, selectedMeter, setSelectedMeter } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [granularity, setGranularity] = useState<TimeGranularity>('day')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Rehydrate detail from URL on mount
  useEffect(() => {
    const detailParam = searchParams.get('detail')
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

  const revenueWhere = useMemo(() => {
    return `session_start_dt >= '${dateRange.start}T00:00:00' AND session_start_dt <= '${dateRange.end}T23:59:59'`
  }, [dateRange])

  const { data: transactions, isLoading, error } = useDataset<ParkingTransaction>(
    'parkingRevenue',
    { $where: revenueWhere, $limit: 10000, $order: 'session_start_dt DESC' },
    [revenueWhere]
  )

  // Server-side aggregation for accurate totals (not capped by $limit)
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

  const meterRevenue = useMemo(() => {
    const byMeter = new Map<string, MeterRevenueRecord>()
    for (const tx of transactions) {
      const meter = meterMap.get(tx.post_id)
      const amount = parseFloat(tx.gross_paid_amt) || 0
      if (amount <= 0) continue
      const existing = byMeter.get(tx.post_id)
      if (existing) {
        existing.totalRevenue += amount
        existing.transactionCount += 1
        existing.avgTransaction = existing.totalRevenue / existing.transactionCount
      } else {
        const lat = meter ? parseFloat(meter.latitude) : 0
        const lng = meter ? parseFloat(meter.longitude) : 0
        byMeter.set(tx.post_id, {
          postId: tx.post_id,
          streetBlock: tx.street_block || meter?.street_name || 'Unknown',
          totalRevenue: amount, transactionCount: 1, avgTransaction: amount,
          lat, lng,
          neighborhood: meter?.analysis_neighborhood || 'Unknown',
          capColor: meter?.cap_color || 'Grey',
        })
      }
    }
    return Array.from(byMeter.values()).filter((m) => m.lat !== 0 && m.lng !== 0)
  }, [transactions, meterMap])

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
          0, '#0891b2', maxRev * 0.3, '#22d3ee', maxRev * 0.6, '#67e8f9', maxRev, '#ecfeff',
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
      mapInstance.flyTo({ center: [coords[0], coords[1]], zoom: 17, duration: 800 })
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

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Parking Revenue
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SFMTA &middot; Meter Revenue Patterns
              </p>
            </div>
            {!isLoading && serverStats && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-signal-blue/80 bg-signal-blue/10 px-2 py-1 rounded-full">
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
          <div className="flex items-center gap-2">
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

      <div id="pr-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapLoadingIndicator label="Loading revenue data" color="#60a5fa" />}
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
                accentColor="#60a5fa"
              />
            )}

            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && serverStats && (
              <div className="absolute top-5 left-5 z-10 flex gap-2.5">
                <StatCard label="Total Revenue" value={formatCurrency(serverStats.totalRevenue)} color="#60a5fa" delay={0}
                  yoyDelta={trend.cityWideYoY ? trend.cityWideYoY.pct : null}
                />
                <StatCard label="Transactions" value={formatNumber(serverStats.totalTransactions)} color="#2dd4a8" delay={80} />
                <StatCard label="Avg / Meter" value={formatCurrency(serverStats.avgPerMeter)} color="#ffbe0b" delay={160} />
                <StatCard label="Active Meters" value={formatNumber(serverStats.uniqueMeters)} color="#a78bfa" delay={240} />
              </div>
            )}
            <MeterDetailPanel />
          </MapView>
        </div>

        <aside className="w-72 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl">
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
                  accentColor="#60a5fa"
                  width={240}
                  height={130}
                />
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">Top Neighborhoods</p>
              <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
            </div>
            {topNeighborhoods.length === 0 && isLoading && <SkeletonSidebarRows count={8} />}
            <div className="space-y-0.5 stagger-in">
              {topNeighborhoods.map((ns, i) => {
                const barWidth = (ns.revenue / maxNeighborhoodRevenue) * 100
                return (
                  <div
                    key={ns.name}
                    onClick={() => {
                      mapInstance?.flyTo({ center: [ns.centerLng, ns.centerLat], zoom: 14, duration: 1200 })
                    }}
                    className="relative py-2 px-3 rounded-lg hover:bg-white/60 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
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
        </aside>
      </div>
    </div>
  )
}
