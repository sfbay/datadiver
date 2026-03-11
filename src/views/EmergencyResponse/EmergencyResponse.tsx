import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useDataset } from '@/hooks/useDataset'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useFireHourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { useFireComparisonData } from '@/hooks/useComparisonDataFactory'
import { useAppStore } from '@/stores/appStore'
import type { FireEMSDispatch, ResponseTimeRecord } from '@/types/datasets'
import { diffMinutes, formatDelta } from '@/utils/time'
import { extractCoordinates } from '@/utils/geo'
import { formatDuration, formatNumber } from '@/utils/time'
import { responseTimeColor, apotTimeColor } from '@/utils/colors'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import StatCard from '@/components/ui/StatCard'
import ResponseHistogram from '@/components/charts/ResponseHistogram'
import ExportButton from '@/components/export/ExportButton'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import IncidentDetailPanel from '@/components/ui/IncidentDetailPanel'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { SkeletonStatCards, SkeletonChart, SkeletonSidebarRows, SkeletonBreakdownList, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import ChartTray, { type ChartTileDef } from '@/components/ui/ChartTray'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import { useFireInsights } from '@/hooks/useFireInsights'
import BatteryTrendChart from '@/components/charts/BatteryTrendChart'
import HorizontalBarChart from '@/components/charts/HorizontalBarChart'

type ServiceFilter = 'all' | 'fire' | 'ems' | 'transport'

const SERVICE_LABELS: Record<ServiceFilter, string> = {
  all: 'All',
  fire: 'Fire',
  ems: 'EMS',
  transport: 'Transport',
}

type SidebarTab = 'neighborhoods' | 'patterns'
type MapOverlay = 'response' | 'apot'

export default function EmergencyResponse() {
  const { dateRange, timeOfDayFilter, comparisonPeriod, selectedIncident, setSelectedIncident } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('neighborhoods')
  const [mapOverlay, setMapOverlay] = useState<MapOverlay>('response')
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // Deep-link: rehydrate detail panel from URL on mount
  useEffect(() => {
    const detailParam = searchParams.get('detail')
    if (detailParam) setSelectedIncident(detailParam)
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

  const { data: rawData, isLoading, error, hitLimit } = useDataset<FireEMSDispatch>(
    'fireEMSDispatch',
    {
      $where: whereClause,
      $limit: 5000,
      $select: 'call_number,call_type,call_type_group,received_dttm,on_scene_dttm,transport_dttm,hospital_dttm,available_dttm,neighborhoods_analysis_boundaries,supervisor_district,final_priority,case_location',
    },
    [whereClause]
  )

  // Total count query (lightweight, for truncation indicator)
  const { data: countRows } = useDataset<{ count: string }>(
    'fireEMSDispatch',
    { $select: 'count(*) as count', $where: whereClause },
    [whereClause]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

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

  // APOT data — only EMS transport calls with full hospital→available chain
  const apotData = useMemo(() => {
    return rawData
      .map((record) => {
        // Require the full transport chain: transport → hospital → available
        if (!record.transport_dttm || !record.hospital_dttm || !record.available_dttm) return null
        const apotMinutes = diffMinutes(record.hospital_dttm, record.available_dttm)
        if (!apotMinutes || apotMinutes < 0 || apotMinutes > 120) return null
        const coords = extractCoordinates(record.case_location)
        if (!coords) return null
        return {
          callNumber: record.call_number,
          hospitalAt: new Date(record.hospital_dttm),
          availableAt: new Date(record.available_dttm),
          apotMinutes,
          callType: record.call_type,
          neighborhood: record.neighborhoods_analysis_boundaries || 'Unknown',
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData])

  // Build GeoJSON for map layer (null when APOT overlay active)
  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapOverlay !== 'response' || responseData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: responseData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          callNumber: r.callNumber,
          responseTime: r.responseTimeMinutes,
          callType: r.callType,
          neighborhood: r.neighborhood,
          receivedAt: r.receivedAt.toISOString(),
        },
      })),
    }
  }, [responseData, mapOverlay])

  // APOT GeoJSON (null when response overlay active)
  const apotGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (mapOverlay !== 'apot' || apotData.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: apotData.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          callNumber: r.callNumber,
          apotMinutes: r.apotMinutes,
          callType: r.callType,
          neighborhood: r.neighborhood,
          hospitalAt: r.hospitalAt.toISOString(),
        },
      })),
    }
  }, [apotData, mapOverlay])

  // Fire severity overlay GeoJSON (casualties)
  const severityGeojson = useMemo(() => {
    if (!isFireMode || fireInsights.severityOverlay.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: fireInsights.severityOverlay
        .filter(r => r.point?.coordinates)
        .map(r => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: r.point.coordinates },
          properties: {
            callNumber: r.call_number,
            situation: r.primary_situation || '',
            injuries: (r.civilian_injuries || 0) + (r.fire_injuries || 0),
            fatalities: (r.civilian_fatalities || 0) + (r.fire_fatalities || 0),
            loss: r.estimated_property_loss || 0,
            address: r.address || '',
            date: r.alarm_dttm || '',
          },
        })),
    }
  }, [isFireMode, fireInsights.severityOverlay])

  // Battery fire overlay GeoJSON
  const batteryGeojson = useMemo(() => {
    if (!isFireMode || fireInsights.batteryOverlay.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: fireInsights.batteryOverlay
        .filter(r => r.point?.coordinates)
        .map(r => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: r.point.coordinates },
          properties: {
            callNumber: r.call_number,
            situation: r.primary_situation || '',
            factor: r.ignition_factor_primary || '',
            origin: r.area_of_fire_origin || '',
            property: r.property_use || '',
            address: r.address || '',
            date: r.alarm_dttm || '',
            injuries: (r.civilian_injuries || 0) + (r.fire_injuries || 0),
            loss: r.estimated_property_loss || 0,
          },
        })),
    }
  }, [isFireMode, fireInsights.batteryOverlay])

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

  // APOT heatmap + circle layers
  const apotLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'apot-heat',
      type: 'heatmap',
      source: 'apot-data',
      maxzoom: 15,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'apotMinutes'], 0, 0, 10, 0.3, 20, 0.7, 40, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(16, 185, 129, 0.25)',
          0.25, 'rgba(16, 185, 129, 0.4)',
          0.4, 'rgba(245, 158, 11, 0.55)',
          0.6, 'rgba(249, 115, 22, 0.65)',
          0.8, 'rgba(239, 68, 68, 0.75)',
          1, 'rgba(185, 28, 28, 0.85)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'apot-points',
      type: 'circle',
      source: 'apot-data',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'apotMinutes'],
          0, '#10b981', 10, '#f59e0b', 15, '#f97316', 20, '#ef4444',
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.15)',
      },
    } as mapboxgl.AnyLayer,
  ], [])

  const severityLayers = useMemo((): mapboxgl.AnyLayer[] => isFireMode ? [{
    id: 'fire-severity-points',
    type: 'circle',
    source: 'fire-severity',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 10],
      'circle-color': '#ef4444',
      'circle-stroke-color': '#ef4444',
      'circle-stroke-width': 2,
      'circle-opacity': 0.7,
      'circle-stroke-opacity': 0.9,
    },
  } as mapboxgl.AnyLayer] : [], [isFireMode])

  const batteryLayers = useMemo((): mapboxgl.AnyLayer[] => isFireMode ? [{
    id: 'fire-battery-points',
    type: 'circle',
    source: 'fire-battery',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8],
      'circle-color': '#f59e0b',
      'circle-stroke-color': '#f59e0b',
      'circle-stroke-width': 2,
      'circle-opacity': 0.6,
      'circle-stroke-opacity': 0.8,
    },
  } as mapboxgl.AnyLayer] : [], [isFireMode])

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
      <div class="font-semibold text-red-400 mb-1">Fire with Casualties</div>
      <div>${props.situation}</div>
      <div class="text-red-300">${casualties.join(', ')}</div>
      ${loss > 0 ? `<div>Loss: $${loss.toLocaleString()}</div>` : ''}
      <div class="text-slate-400 mt-1">${props.address}</div>
      <div class="text-slate-500">${props.date ? new Date(String(props.date)).toLocaleDateString() : ''}</div>
    </div>`
  })

  // Battery fire tooltip
  useMapTooltip(mapInstance, 'fire-battery-points', (props) => {
    return `<div class="font-mono text-[10px]">
      <div class="font-semibold text-amber-400 mb-1">Battery Fire</div>
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

  const stats = useMemo(() => {
    if (responseData.length === 0) return { avg: 0, median: 0, total: 0, p90: 0, apotAvg: 0, apotCount: 0 }
    const times = responseData.map((r) => r.responseTimeMinutes).sort((a, b) => a - b)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const median = times[Math.floor(times.length / 2)]
    const p90 = times[Math.floor(times.length * 0.9)]
    const apotTimes = apotData.map((r) => r.apotMinutes)
    const apotAvg = apotTimes.length > 0 ? apotTimes.reduce((a, b) => a + b, 0) / apotTimes.length : 0
    return { avg, median, total: times.length, p90, apotAvg, apotCount: apotTimes.length }
  }, [responseData, apotData])

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
        color: '#f59e0b',
        defaultExpanded: true,
        render: () => <ResponseHistogram data={histogramData} width={320} height={100} />,
      })
    }

    if (comparisonPeriod !== null && comparison.currentTrend.length > 0) {
      tiles.push({
        id: 'daily-trend',
        label: `Daily Trend ${comparison.isLoading ? '(loading…)' : ''}`,
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

    // Battery fire trend tile (fire mode only)
    if (isFireMode && fireInsights.batteryTrend.length > 0) {
      tiles.push({
        id: 'battery-trend',
        label: 'Battery Fire Trend',
        shortLabel: 'Battery',
        color: '#f59e0b',
        defaultExpanded: true,
        render: () => <BatteryTrendChart data={fireInsights.batteryTrend} width={320} height={140} />,
      })
    }

    return tiles
  }, [histogramData, comparisonPeriod, comparison.currentTrend, comparison.comparisonTrend, comparison.isLoading, isFireMode, fireInsights.batteryTrend])

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
                  <span className="text-[10px] font-mono text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded-full">
                    of {formatNumber(totalCount)} total
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ComparisonToggle />
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
                    {mode === 'response' ? 'Response' : 'APOT'}
                  </button>
                ))}
              </div>
            )}
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
      <div id="er-capture" className="flex-1 overflow-hidden flex">
        {/* Map — hero element */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {isLoading && <MapScanOverlay label="Scanning dispatches" color="#f59e0b" />}
            <MapProgressBar color="#f59e0b" />

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
                accentColor="#3b82f6"
              />
            )}

            {/* Stat cards — top left */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && responseData.length > 0 && (
              <div className="absolute top-5 left-5 z-10 flex gap-2.5">
                <StatCard
                  label="Avg Response" info="avg-response" value={formatDuration(stats.avg)} color={responseTimeColor(stats.avg)} delay={0}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.avg)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.avg > 0 ? 'up' : comparison.deltas.avg < 0 ? 'down' : 'neutral') : undefined}
                />
                <StatCard
                  label="Median" info="median" value={formatDuration(stats.median)} color={responseTimeColor(stats.median)} delay={80}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.median)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.median > 0 ? 'up' : comparison.deltas.median < 0 ? 'down' : 'neutral') : undefined}
                />
                <StatCard
                  label="90th Pctl" info="90th-pctl" value={formatDuration(stats.p90)} color={responseTimeColor(stats.p90)} delay={160}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.p90)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.p90 > 0 ? 'up' : comparison.deltas.p90 < 0 ? 'down' : 'neutral') : undefined}
                />
                <StatCard
                  label="Incidents" value={formatNumber(stats.total)} color="#60a5fa" delay={240}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined}
                  yoyDelta={!comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null}
                />
                {stats.apotCount > 0 && (
                  <StatCard
                    label="Avg APOT" info="avg-apot"
                    value={formatDuration(stats.apotAvg)}
                    color={stats.apotAvg > 20 ? '#ef4444' : stats.apotAvg > 10 ? '#f59e0b' : '#10b981'}
                    delay={320}
                  />
                )}
                {isFireMode && fireInsights.casualties && (
                  <>
                    <StatCard
                      label="Casualties"
                      info="fire-casualties"
                      value={String(fireInsights.casualties.injuries + fireInsights.casualties.fatalities)}
                      color="#ef4444"
                      delay={400}
                      subtitle={`${fireInsights.casualties.injuries} inj, ${fireInsights.casualties.fatalities} fatal`}
                      yoyDelta={
                        fireInsights.priorYearCasualties
                          ? (() => {
                              const prev = fireInsights.priorYearCasualties.injuries + fireInsights.priorYearCasualties.fatalities
                              const curr = fireInsights.casualties!.injuries + fireInsights.casualties!.fatalities
                              return prev > 0 ? ((curr - prev) / prev) * 100 : null
                            })()
                          : null
                      }
                    />
                    <StatCard
                      label="Est. Loss"
                      info="fire-property-loss"
                      value={fireInsights.casualties.totalLoss >= 1_000_000
                        ? `$${(fireInsights.casualties.totalLoss / 1_000_000).toFixed(1)}M`
                        : fireInsights.casualties.totalLoss >= 1_000
                        ? `$${(fireInsights.casualties.totalLoss / 1_000).toFixed(0)}K`
                        : `$${fireInsights.casualties.totalLoss.toLocaleString()}`}
                      color="#f59e0b"
                      delay={480}
                      yoyDelta={
                        fireInsights.priorYearCasualties && fireInsights.priorYearCasualties.totalLoss > 0
                          ? ((fireInsights.casualties.totalLoss - fireInsights.priorYearCasualties.totalLoss) / fireInsights.priorYearCasualties.totalLoss) * 100
                          : null
                      }
                    />
                  </>
                )}
              </div>
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
        <aside className="w-72 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
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

                {neighborhoodStats.length === 0 && !isLoading && (
                  <p className="text-xs text-slate-400 dark:text-slate-600 italic">
                    No data for selected filters.
                  </p>
                )}

                {isLoading && <SkeletonSidebarRows count={8} />}
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
                              {(() => {
                                const nhTrend = trend.neighborhoodMap.get(ns.neighborhood)
                                if (!nhTrend || !nhTrend.priorYearCount) return null
                                return (
                                  <>
                                    <span className={nhTrend.yoyPct > 0 ? 'text-red-400' : nhTrend.yoyPct < 0 ? 'text-emerald-400' : ''}>
                                      {nhTrend.yoyPct >= 0 ? '+' : ''}{nhTrend.yoyPct.toFixed(0)}%
                                    </span>
                                    {Math.abs(nhTrend.zScore) > 1 && (
                                      <span className={nhTrend.zScore > 1 ? 'text-red-400' : 'text-blue-400'}>
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
                                    <span className="text-red-400/80"> · {fireStat.count} fires</span>
                                    {fireStat.injuries > 0 && (
                                      <span className="text-red-400"> · {fireStat.injuries} inj</span>
                                    )}
                                    {fireStat.fatalities > 0 && (
                                      <span className="text-red-500 font-semibold"> · {fireStat.fatalities} fatal</span>
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
                      accentColor="#3b82f6"
                      width={232}
                      height={130}
                    />
                  </div>
                )}

                {/* Fire Insights — only when Fire filter active */}
                {isFireMode && !fireInsights.isLoading && (fireInsights.causes.length > 0 || fireInsights.propertyTypes.length > 0) && (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400/80">
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
                          data={fireInsights.causes.map(c => ({ label: c.label, value: c.count, color: '#ef4444' }))}
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
                          data={fireInsights.propertyTypes.map(p => ({ label: p.label, value: p.count, color: '#fb923c' }))}
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
                            <p className="font-mono text-emerald-400 text-sm font-bold">
                              {fireInsights.detectionStats.detectorsPresent}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Detectors
                            </p>
                          </div>
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-amber-400 text-sm font-bold">
                              {fireInsights.detectionStats.effectiveAlert}%
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 mt-0.5">
                              Effective
                            </p>
                          </div>
                          <div className="flex-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-2 text-center">
                            <p className="font-mono text-red-400 text-sm font-bold">
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
        </aside>
      </div>
    </div>
  )
}
