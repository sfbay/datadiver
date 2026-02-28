import { useState, useMemo, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useAppStore } from '@/stores/appStore'
import type { FireEMSDispatch, ResponseTimeRecord } from '@/types/datasets'
import { diffMinutes } from '@/utils/time'
import { extractCoordinates } from '@/utils/geo'
import { formatDuration, formatNumber } from '@/utils/time'
import { responseTimeColor } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import StatCard from '@/components/ui/StatCard'
import ResponseHistogram from '@/components/charts/ResponseHistogram'
import ExportButton from '@/components/export/ExportButton'

type ServiceFilter = 'all' | 'fire' | 'ems'

const SERVICE_LABELS: Record<ServiceFilter, string> = {
  all: 'All Services',
  fire: 'Fire',
  ems: 'EMS / Medic',
}

export default function EmergencyResponse() {
  const { dateRange } = useAppStore()
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  const whereClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`received_dttm >= '${dateRange.start}T00:00:00'`)
    conditions.push(`received_dttm <= '${dateRange.end}T23:59:59'`)
    conditions.push(`on_scene_dttm IS NOT NULL`)
    if (serviceFilter === 'fire') conditions.push(`call_type_group = 'Fire'`)
    else if (serviceFilter === 'ems') conditions.push(`call_type_group = 'Potentially Life-Threatening'`)
    return conditions.join(' AND ')
  }, [dateRange, serviceFilter])

  const { data: rawData, isLoading, error } = useDataset<FireEMSDispatch>(
    'fireEMSDispatch',
    {
      $where: whereClause,
      $limit: 5000,
      $select: 'call_number,call_type,call_type_group,received_dttm,on_scene_dttm,neighborhoods_analysis_boundaries,supervisor_district,final_priority,case_location',
    },
    [whereClause]
  )

  const responseData = useMemo(() => {
    return rawData
      .map((record): ResponseTimeRecord | null => {
        const responseTime = diffMinutes(record.received_dttm, record.on_scene_dttm)
        if (!responseTime || responseTime < 0 || responseTime > 120) return null
        const coords = extractCoordinates(record.case_location)
        if (!coords) return null
        return {
          callNumber: record.call_number,
          receivedAt: new Date(record.received_dttm),
          onSceneAt: new Date(record.on_scene_dttm),
          responseTimeMinutes: responseTime,
          callType: record.call_type,
          neighborhood: record.neighborhoods_analysis_boundaries || 'Unknown',
          district: record.supervisor_district || 'Unknown',
          priority: record.final_priority || 'Unknown',
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is ResponseTimeRecord => r !== null)
  }, [rawData])

  // Build GeoJSON for map layer
  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (responseData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: responseData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: { responseTime: r.responseTimeMinutes, callType: r.callType, neighborhood: r.neighborhood },
      })),
    }
  }, [responseData])

  // Heatmap + circle layers definition
  const mapLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'response-heat',
      type: 'heatmap',
      source: 'response-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'responseTime'], 0, 0, 5, 0.3, 10, 0.6, 20, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(45, 212, 168, 0.25)',
          0.25, 'rgba(45, 212, 168, 0.45)',
          0.4, 'rgba(255, 190, 11, 0.55)',
          0.6, 'rgba(255, 140, 66, 0.65)',
          0.8, 'rgba(255, 77, 77, 0.7)',
          1, 'rgba(220, 38, 38, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'response-points',
      type: 'circle',
      source: 'response-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'responseTime'],
          0, '#2dd4a8', 5, '#ffbe0b', 10, '#ff8c42', 20, '#ff4d4d',
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.15)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  // Reactively bind data to map
  useMapLayer(mapInstance, 'response-data', geojson, mapLayers)

  // Hover tooltip on circle layer
  useMapTooltip(mapInstance, 'response-points', (props) => {
    const rt = Number(props.responseTime).toFixed(1)
    return `
      <div class="tooltip-label">Response Time</div>
      <div class="tooltip-value">${rt} min</div>
      <div class="tooltip-label" style="margin-top:6px">Call Type</div>
      <div style="color:#e2e8f0">${props.callType || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Neighborhood</div>
      <div style="color:#94a3b8">${props.neighborhood || 'Unknown'}</div>
    `
  })

  const stats = useMemo(() => {
    if (responseData.length === 0) return { avg: 0, median: 0, total: 0, p90: 0 }
    const times = responseData.map((r) => r.responseTimeMinutes).sort((a, b) => a - b)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const median = times[Math.floor(times.length / 2)]
    const p90 = times[Math.floor(times.length * 0.9)]
    return { avg, median, total: times.length, p90 }
  }, [responseData])

  const neighborhoodStats = useMemo(() => {
    const byNeighborhood = new Map<string, { times: number[]; lats: number[]; lngs: number[] }>()
    for (const r of responseData) {
      const existing = byNeighborhood.get(r.neighborhood) || { times: [], lats: [], lngs: [] }
      existing.times.push(r.responseTimeMinutes)
      existing.lats.push(r.lat)
      existing.lngs.push(r.lng)
      byNeighborhood.set(r.neighborhood, existing)
    }
    return Array.from(byNeighborhood.entries())
      .map(([neighborhood, { times, lats, lngs }]) => {
        const sorted = [...times].sort((a, b) => a - b)
        return {
          neighborhood,
          avgResponseTime: times.reduce((a, b) => a + b, 0) / times.length,
          medianResponseTime: sorted[Math.floor(sorted.length / 2)],
          totalIncidents: times.length,
          centerLat: lats.reduce((a, b) => a + b, 0) / lats.length,
          centerLng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
        }
      })
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
  }, [responseData])

  const histogramData = useMemo(() => responseData.map((r) => r.responseTimeMinutes), [responseData])
  const maxAvg = neighborhoodStats.length > 0 ? neighborhoodStats[0].avgResponseTime : 1

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

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
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-signal-emerald/80 bg-signal-emerald/10 px-2 py-1 rounded-full">
                <span className="w-1 h-1 rounded-full bg-signal-emerald pulse-live" />
                {formatNumber(responseData.length)} records
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ExportButton targetSelector="#er-capture" filename="emergency-response" />
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['all', 'fire', 'ems'] as const).map((filter) => (
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
          </div>
        </div>
      </header>

      {/* Content */}
      <div id="er-capture" className="flex-1 overflow-hidden flex">
        {/* Map — hero element */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-950/40 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-6 h-6 border-2 border-signal-amber border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">
                    Loading dispatch data
                  </span>
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

            {/* Stat cards — top left */}
            {!isLoading && responseData.length > 0 && (
              <div className="absolute top-5 left-5 z-10 flex gap-2.5">
                <StatCard label="Avg Response" value={formatDuration(stats.avg)} color={responseTimeColor(stats.avg)} delay={0} />
                <StatCard label="Median" value={formatDuration(stats.median)} color={responseTimeColor(stats.median)} delay={80} />
                <StatCard label="90th Pctl" value={formatDuration(stats.p90)} color={responseTimeColor(stats.p90)} delay={160} />
                <StatCard label="Incidents" value={formatNumber(stats.total)} color="#60a5fa" delay={240} />
              </div>
            )}

            {/* Histogram — bottom left */}
            {!isLoading && histogramData.length > 0 && (
              <div className="absolute bottom-6 left-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Response Time Distribution
                </p>
                <ResponseHistogram data={histogramData} width={260} height={100} />
              </div>
            )}
          </MapView>
        </div>

        {/* Right panel */}
        <aside className="w-72 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                By Neighborhood
              </p>
              <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
            </div>

            {neighborhoodStats.length === 0 && !isLoading && (
              <p className="text-xs text-slate-400 dark:text-slate-600 italic">
                No data for selected filters.
              </p>
            )}

            <div className="space-y-0.5 stagger-in">
              {neighborhoodStats.slice(0, 25).map((ns) => {
                const barWidth = (ns.avgResponseTime / maxAvg) * 100
                return (
                  <div
                    key={ns.neighborhood}
                    onClick={() => {
                      mapInstance?.flyTo({ center: [ns.centerLng, ns.centerLat], zoom: 14, duration: 1200 })
                    }}
                    className="relative py-2 px-3 rounded-lg cursor-pointer hover:bg-white/80 dark:hover:bg-white/[0.04] transition-all duration-200"
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
                        <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                          {ns.totalIncidents} calls
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
          </div>
        </aside>
      </div>
    </div>
  )
}
