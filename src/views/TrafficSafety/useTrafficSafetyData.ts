import { useMemo } from 'react'
import type { TrafficCrashRecord, CrashModeAggRow, NeighborhoodAggRowCrashes, SpeedCameraRecord, RedLightCameraRecord, PavementConditionRecord } from '@/types/datasets'
import { formatDelta, formatNumber } from '@/utils/time'
import { coordsFromFields, extractCoordinates } from '@/utils/geo'
import type { CardDef } from '@/components/ui/CardTray'
import { SEVERITY_ORDER, isDuiCode, isPedBikeMode } from './crashFilters'

type MapMode = 'heatmap' | 'anomaly'
type Overlay = 'speed' | 'redlight' | 'pci' | 'hin'

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
  comparisonSuppressed: boolean
  comparisonActive: boolean
  /** Server totals over the FULL filtered window — never the map sample
   *  (Sept. 23 2026: the sample is capped at 5,000 rows and drops crashes
   *  with no coordinates; on 2024–2025 it read 55 deaths where the city's
   *  count is 68). Null until the query lands. */
  totals: CrashTotals | null
  /** Server GROUP BY collision_severity, scoped by every filter EXCEPT
   *  severity — the chart is the chooser, so it keeps every level visible. */
  severityRows: { collision_severity: string; count: string }[]
  /** Card filters: which is applied, and what a click does. */
  filters: {
    fatalOnly: boolean
    severeOnly: boolean
    duiOnly: boolean
    pedBikeOnly: boolean
    onFatal: () => void
    onSevere: () => void
    onDui: () => void
    onPedBike: () => void
  }
}

export interface CrashTotals {
  crashes: number
  killed: number
  injured: number
  fatalCrashes: number
  pedBikeCrashes: number
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`

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
    comparisonSuppressed,
    comparisonActive,
    totals,
    severityRows,
    filters,
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
          isDui: isDuiCode(record.vz_pcf_group),
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
    if (!totals) return null
    const pedBikePct = totals.crashes > 0 ? (totals.pedBikeCrashes / totals.crashes) * 100 : 0
    return { ...totals, pedBikePct, peakHour }
  }, [totals, peakHour])
  const dash = '—'
  // An applied card's subtitle is its own off switch: the card's click
  // handler toggles, so "Clear" clears THIS card's filter and nothing else.
  const clearAction = (off: () => void) => ({ subtitle: 'Filter on', subtitleAction: off, subtitleActionLabel: '· Clear ✕' })

  // Card tray definitions
  const cardDefs = useMemo((): CardDef[] => [
    {
      id: 'total',
      label: 'Total Crashes',
      shortLabel: 'Total',
      value: totalCount != null ? formatNumber(totalCount) : stats ? formatNumber(stats.crashes) : dash,
      color: '#963e30',
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
      value: stats ? formatNumber(stats.killed) : dash,
      color: '#6f2b20',
      delay: 80,
      info: 'fatalities',
      defaultExpanded: true,
      // The value counts PEOPLE; the filter selects CRASHES — name both.
      ...(filters.fatalOnly
        ? clearAction(filters.onFatal)
        : { subtitle: stats ? `in ${plural(stats.fatalCrashes, 'fatal crash', 'fatal crashes')}` : undefined }),
      onActivate: filters.onFatal,
      active: filters.fatalOnly,
      activateHint: filters.fatalOnly ? 'Show all crashes' : 'Show fatal crashes only',
    },
    {
      id: 'injuries',
      label: 'Injuries',
      shortLabel: 'Injuries',
      value: stats ? formatNumber(stats.injured) : dash,
      color: '#d4a435',
      delay: 160,
      info: 'injuries',
      defaultExpanded: true,
      ...(filters.severeOnly ? clearAction(filters.onSevere) : {
        subtitle: comparisonDeltas
          ? `${formatDelta(comparisonDeltas.injuries)} ${compLabel}`
          : (comparisonSuppressed && comparisonActive ? 'Compare needs a narrower date range' : undefined),
        trend: comparisonDeltas ? (comparisonDeltas.injuries > 0 ? 'up' : comparisonDeltas.injuries < 0 ? 'down' : 'neutral') : undefined,
      }),
      onActivate: filters.onSevere,
      active: filters.severeOnly,
      activateHint: filters.severeOnly ? 'Show all crashes' : 'Show severe-injury crashes only',
    },
    {
      id: 'dui',
      label: 'DUI Crashes',
      shortLabel: 'DUI',
      value: formatNumber(duiCount),
      color: '#8b6282',
      delay: 240,
      info: 'dui-crashes',
      defaultExpanded: true,
      ...(filters.duiOnly ? clearAction(filters.onDui) : {
        subtitle: duiKilled + duiInjured > 0
          ? `${duiKilled > 0 ? `${duiKilled} killed` : ''}${duiKilled > 0 && duiInjured > 0 ? ' · ' : ''}${duiInjured > 0 ? `${duiInjured} injured` : ''}`
          : undefined,
      }),
      yoyDelta: duiYoY,
      onActivate: filters.onDui,
      active: filters.duiOnly,
      activateHint: filters.duiOnly ? 'Show all crashes' : 'Show DUI crashes only',
    },
    {
      id: 'ped-bike',
      label: 'Ped/Bike %',
      shortLabel: 'Ped/Bike',
      value: stats ? `${stats.pedBikePct.toFixed(1)}%` : dash,
      color: '#3f7573',
      delay: 320,
      info: 'ped-bike-pct',
      defaultExpanded: false,
      ...(filters.pedBikeOnly ? clearAction(filters.onPedBike) : {}),
      onActivate: filters.onPedBike,
      active: filters.pedBikeOnly,
      activateHint: filters.pedBikeOnly ? 'Show all crashes' : 'Show pedestrian and bicycle crashes only',
    },
  ], [stats, totalCount, comparisonDeltas, compLabel, cityWideYoY, duiCount, duiKilled, duiInjured, duiYoY, comparisonSuppressed, comparisonActive, filters])

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
    for (const r of severityRows) map.set(r.collision_severity, parseInt(r.count, 10) || 0)
    return SEVERITY_ORDER
      .filter((s) => map.has(s))
      .map((s) => ({ severity: s as string, count: map.get(s)! }))
  }, [severityRows])

  const modeBars = useMemo(() => {
    return modeEntries.slice(0, 8).map((m) => ({
      label: m.mode,
      value: m.count,
      color: /Pedestrian/.test(m.mode) ? '#963e30' : isPedBikeMode(m.mode) ? '#d4a435' : '#64748b',
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
