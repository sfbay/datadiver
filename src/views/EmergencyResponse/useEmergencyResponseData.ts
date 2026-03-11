import { useMemo } from 'react'
import type { FireEMSDispatch, ResponseTimeRecord } from '@/types/datasets'
import { diffMinutes } from '@/utils/time'
import { extractCoordinates } from '@/utils/geo'

interface FireInsightsSeverityOverlayItem {
  point: { coordinates: [number, number] }
  call_number: string
  primary_situation?: string
  civilian_injuries?: number
  fire_injuries?: number
  civilian_fatalities?: number
  fire_fatalities?: number
  estimated_property_loss?: number
  address?: string
  alarm_dttm?: string
}

interface FireInsightsBatteryOverlayItem {
  point: { coordinates: [number, number] }
  call_number: string
  primary_situation?: string
  ignition_factor_primary?: string
  area_of_fire_origin?: string
  property_use?: string
  address?: string
  alarm_dttm?: string
  civilian_injuries?: number
  fire_injuries?: number
  estimated_property_loss?: number
}

type MapOverlay = 'response' | 'apot'

interface UseEmergencyResponseDataParams {
  rawData: FireEMSDispatch[]
  mapOverlay: MapOverlay
  isFireMode: boolean
  fireInsightsSeverityOverlay: FireInsightsSeverityOverlayItem[]
  fireInsightsBatteryOverlay: FireInsightsBatteryOverlayItem[]
}

export function useEmergencyResponseData(params: UseEmergencyResponseDataParams) {
  const {
    rawData,
    mapOverlay,
    isFireMode,
    fireInsightsSeverityOverlay,
    fireInsightsBatteryOverlay,
  } = params

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

  // APOT data — only EMS transport calls with full hospital->available chain
  const apotData = useMemo(() => {
    return rawData
      .map((record) => {
        // Require the full transport chain: transport -> hospital -> available
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
    if (!isFireMode || fireInsightsSeverityOverlay.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: fireInsightsSeverityOverlay
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
  }, [isFireMode, fireInsightsSeverityOverlay])

  // Battery fire overlay GeoJSON
  const batteryGeojson = useMemo(() => {
    if (!isFireMode || fireInsightsBatteryOverlay.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: fireInsightsBatteryOverlay
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
  }, [isFireMode, fireInsightsBatteryOverlay])

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

  return {
    responseData,
    apotData,
    geojson,
    apotGeojson,
    severityGeojson,
    batteryGeojson,
    stats,
    neighborhoodStats,
    histogramData,
  }
}
