import { useState, useMemo, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useAppStore } from '@/stores/appStore'
import type { ParkingTransaction, ParkingMeter, MeterRevenueRecord } from '@/types/datasets'
import { formatCurrency, formatNumber } from '@/utils/time'
import { PAYMENT_COLORS } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import StatCard from '@/components/ui/StatCard'
import ExportButton from '@/components/export/ExportButton'

type TimeGranularity = 'hour' | 'day' | 'week'

export default function ParkingRevenue() {
  const { dateRange } = useAppStore()
  const [granularity, setGranularity] = useState<TimeGranularity>('day')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

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

  const stats = useMemo(() => {
    const totalRevenue = transactions.reduce((sum, tx) => sum + (parseFloat(tx.gross_paid_amt) || 0), 0)
    const totalTransactions = transactions.length
    const uniqueMeters = new Set(transactions.map((tx) => tx.post_id)).size
    const avgPerMeter = uniqueMeters > 0 ? totalRevenue / uniqueMeters : 0
    const byPayment = new Map<string, number>()
    for (const tx of transactions) {
      const amt = parseFloat(tx.gross_paid_amt) || 0
      const type = tx.payment_type || 'OTHER'
      byPayment.set(type, (byPayment.get(type) || 0) + amt)
    }
    const byNeighborhood = new Map<string, { revenue: number; lats: number[]; lngs: number[] }>()
    for (const m of meterRevenue) {
      const existing = byNeighborhood.get(m.neighborhood) || { revenue: 0, lats: [], lngs: [] }
      existing.revenue += m.totalRevenue
      existing.lats.push(m.lat)
      existing.lngs.push(m.lng)
      byNeighborhood.set(m.neighborhood, existing)
    }
    const topNeighborhoods = Array.from(byNeighborhood.entries())
      .map(([name, d]) => ({
        name,
        revenue: d.revenue,
        centerLat: d.lats.reduce((a, b) => a + b, 0) / d.lats.length,
        centerLng: d.lngs.reduce((a, b) => a + b, 0) / d.lngs.length,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15)
    return { totalRevenue, totalTransactions, avgPerMeter, uniqueMeters, byPayment, topNeighborhoods }
  }, [meterRevenue, transactions])

  // GeoJSON for map
  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (meterRevenue.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: meterRevenue.map((m) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
        properties: { revenue: m.totalRevenue, neighborhood: m.neighborhood, block: m.streetBlock },
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
        'circle-radius': ['interpolate', ['linear'], ['get', 'revenue'], 0, 2, maxRev, 8],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'revenue'],
          0, '#1e3a5f', maxRev * 0.3, '#3b82f6', maxRev * 0.6, '#60a5fa', maxRev, '#bfdbfe',
        ],
        'circle-opacity': 0.7,
        'circle-stroke-width': 0.5,
        'circle-stroke-color': 'rgba(255,255,255,0.1)',
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

  const maxNeighborhoodRevenue = stats.topNeighborhoods.length > 0 ? stats.topNeighborhoods[0].revenue : 1

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
            {!isLoading && transactions.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-signal-blue/80 bg-signal-blue/10 px-2 py-1 rounded-full">
                {formatNumber(transactions.length)} transactions
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
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-950/40 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-6 h-6 border-2 border-signal-blue border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">Loading revenue data</span>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="glass-card rounded-xl p-6 max-w-sm">
                  <p className="text-sm font-medium text-signal-red mb-1">Data Error</p>
                  <p className="text-xs text-slate-400">{error}</p>
                </div>
              </div>
            )}
            {!isLoading && transactions.length > 0 && (
              <div className="absolute top-5 left-5 z-10 flex gap-2.5">
                <StatCard label="Total Revenue" value={formatCurrency(stats.totalRevenue)} color="#60a5fa" delay={0} />
                <StatCard label="Transactions" value={formatNumber(stats.totalTransactions)} color="#2dd4a8" delay={80} />
                <StatCard label="Avg / Meter" value={formatCurrency(stats.avgPerMeter)} color="#ffbe0b" delay={160} />
                <StatCard label="Active Meters" value={formatNumber(stats.uniqueMeters)} color="#a78bfa" delay={240} />
              </div>
            )}
          </MapView>
        </div>

        <aside className="w-72 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">Payment Methods</p>
              <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
            </div>
            <div className="space-y-3 mb-6 stagger-in">
              {Array.from(stats.byPayment.entries()).sort((a, b) => b[1] - a[1]).map(([type, amount]) => {
                const total = stats.totalRevenue || 1
                const pct = (amount / total) * 100
                const color = PAYMENT_COLORS[type as keyof typeof PAYMENT_COLORS] || '#64748b'
                const label = type === 'COIN' ? 'Coin' : type === 'CREDIT CARD' ? 'Card' : type === 'SMRT' ? 'App' : type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ')
                return (
                  <div key={type}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[12px] font-medium text-ink dark:text-slate-200">{label}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{pct.toFixed(0)}%</span>
                        <span className="text-[12px] font-mono font-semibold tabular-nums" style={{ color }}>{formatCurrency(amount)}</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-slate-100 dark:bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full bar-grow" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">Top Neighborhoods</p>
              <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
            </div>
            <div className="space-y-0.5 stagger-in">
              {stats.topNeighborhoods.map((ns, i) => {
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
