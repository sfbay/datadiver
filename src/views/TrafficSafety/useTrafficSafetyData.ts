import { useMemo } from 'react'
import type { TrafficCrashRecord, CrashModeAggRow, NeighborhoodAggRowCrashes, SpeedCameraRecord, RedLightCameraRecord, PavementConditionRecord } from '@/types/datasets'
import { formatDelta, formatNumber } from '@/utils/time'
import { coordsFromFields, extractCoordinates } from '@/utils/geo'
import type { CardDef } from '@/components/ui/CardTray'

type MapMode = 'heatmap' | 'anomaly'
type Overlay = 'speed' | 'redlight' | 'pci'

interface UseTrafficSafetyDataParams {
  rawData: TrafficCrashRecord[]
  mapMode: MapMode
  modeRows: CrashModeAggRow[]
  neighborhoodRows: NeighborhoodAggRowCrashes[]
  neighborhoodBoundaries: GeoJSON.FeatureCollection | null
  speedCameraData: SpeedCameraRecord[]
  redLightData: RedLightCameraRecord[]
  pavementData: PavementConditionRecord[]
  activeOverlays: Set<Overlay>
  totalCount: number | null
  duiCount: number
  duiKilled: number
  duiInjured: number
  duiYoY: number | null
  peakHour: number
  comparisonDeltas: { total: number; injuries: number } | null
  compLabel: string
  cityWideYoY: { pct: number } | null
}

export function useTrafficSafetyData(params: UseTrafficSafetyDataParams) {
  const {
    rawData,
    mapMode,
    modeRows,
    neighborhoodRows,
    neighborhoodBoundaries,
    speedCameraData,
    redLightData,
    pavementData,
    activeOverlays,
    totalCount,
    duiCount,
    duiKilled,
    duiInjured,
    duiYoY,
    peakHour,
    comparisonDeltas,
    compLabel,
    cityWideYoY,
  } = params

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
    return { totalCrashes: crashData.length, fatalities, injuries, pedBikePct, peakHour }
  }, [crashData, peakHour])

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
      subtitle: comparisonDeltas ? `${formatDelta(comparisonDeltas.total)} ${compLabel}` : undefined,
      trend: comparisonDeltas ? (comparisonDeltas.total > 0 ? 'up' : comparisonDeltas.total < 0 ? 'down' : 'neutral') : undefined,
      yoyDelta: !comparisonDeltas && cityWideYoY ? cityWideYoY.pct : null,
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
      subtitle: comparisonDeltas ? `${formatDelta(comparisonDeltas.injuries)} ${compLabel}` : undefined,
      trend: comparisonDeltas ? (comparisonDeltas.injuries > 0 ? 'up' : comparisonDeltas.injuries < 0 ? 'down' : 'neutral') : undefined,
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
  ], [stats, totalCount, comparisonDeltas, compLabel, cityWideYoY, duiCount, duiKilled, duiInjured, duiYoY])

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

  // --- Overlay GeoJSONs ---
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

  return {
    crashData,
    stats,
    cardDefs,
    modeEntries,
    severityData,
    modeBars,
    neighborhoodEntries,
    neighborhoodAnomalies,
    heatmapGeojson,
    anomalyGeojson,
    speedCamGeojson,
    redLightGeojson,
    pciGeojson,
  }
}
