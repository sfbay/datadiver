/** Curated neighborhood data portrait — 5 domain queries for map points */

import { useState, useEffect, useCallback } from 'react'
import { fetchDataset } from '@/api/client'
import type { MetricDomain } from './types'

export interface PortraitPoint {
  lat: number
  lng: number
  domain: MetricDomain
  label: string
  detail: string
  value?: string
}

interface PortraitState {
  points: PortraitPoint[]
  loading: boolean
  /** Which domains have loaded (for progress indicator) */
  loadedDomains: Set<MetricDomain>
  error: string | null
}

export interface UseNeighborhoodPortraitResult extends PortraitState {
  diveIn: () => void
  isActive: boolean
  reset: () => void
}

function extractLatLng(record: Record<string, unknown>): { lat: number; lng: number } | null {
  // Try explicit lat/lng fields first
  if (record.tb_latitude && record.tb_longitude) {
    return { lat: parseFloat(record.tb_latitude as string), lng: parseFloat(record.tb_longitude as string) }
  }
  if (record.lat && record.long) {
    return { lat: parseFloat(record.lat as string), lng: parseFloat(record.long as string) }
  }
  if (record.latitude && record.longitude) {
    return { lat: parseFloat(record.latitude as string), lng: parseFloat(record.longitude as string) }
  }
  // Try GeoJSON point fields
  for (const field of ['point', 'case_location', 'the_geom']) {
    const geo = record[field] as { coordinates?: [number, number] } | undefined
    if (geo?.coordinates) {
      return { lat: geo.coordinates[1], lng: geo.coordinates[0] }
    }
  }
  return null
}

export function useNeighborhoodPortrait(
  neighborhood: string | null,
  dateRange: { start: string; end: string }
): UseNeighborhoodPortraitResult {
  const [state, setState] = useState<PortraitState>({
    points: [],
    loading: false,
    loadedDomains: new Set(),
    error: null,
  })
  const [isActive, setIsActive] = useState(false)
  const [targetNeighborhood, setTargetNeighborhood] = useState<string | null>(null)

  // Reset when neighborhood changes
  useEffect(() => {
    if (neighborhood !== targetNeighborhood) {
      setIsActive(false)
      setTargetNeighborhood(null)
      setState({ points: [], loading: false, loadedDomains: new Set(), error: null })
    }
  }, [neighborhood, targetNeighborhood])

  const reset = useCallback(() => {
    setIsActive(false)
    setTargetNeighborhood(null)
    setState({ points: [], loading: false, loadedDomains: new Set(), error: null })
  }, [])

  const diveIn = useCallback(() => {
    if (!neighborhood) return
    setIsActive(true)
    setTargetNeighborhood(neighborhood)
    setState({ points: [], loading: true, loadedDomains: new Set(), error: null })

    const nh = neighborhood.replace(/'/g, "''")
    const dateStart = `${dateRange.start}T00:00:00`
    const dateEnd = `${dateRange.end}T23:59:59`
    const allPoints: PortraitPoint[] = []

    const addDomain = (domain: MetricDomain, pts: PortraitPoint[]) => {
      allPoints.push(...pts)
      setState((prev) => ({
        ...prev,
        points: [...allPoints],
        loadedDomains: new Set([...prev.loadedDomains, domain]),
      }))
    }

    const queries: Promise<void>[] = []

    // Query 1: Emergency Response — 10 slowest response incidents
    queries.push(
      fetchDataset<Record<string, unknown>>('fireEMSDispatch', {
        $select: 'call_number, call_type, received_dttm, on_scene_dttm, case_location, neighborhoods_analysis_boundaries',
        $where: `neighborhoods_analysis_boundaries = '${nh}' AND received_dttm >= '${dateStart}' AND received_dttm <= '${dateEnd}' AND on_scene_dttm IS NOT NULL`,
        $order: 'on_scene_dttm DESC',
        $limit: 15,
      }).then((rows) => {
        const withTime = rows.map((r) => {
          const received = new Date(r.received_dttm as string).getTime()
          const onScene = new Date(r.on_scene_dttm as string).getTime()
          const mins = (onScene - received) / 60000
          return { record: r, responseMinutes: mins }
        }).filter((r) => r.responseMinutes > 0 && r.responseMinutes < 120)
          .sort((a, b) => b.responseMinutes - a.responseMinutes)
          .slice(0, 10)

        const pts: PortraitPoint[] = []
        for (const r of withTime) {
          const geo = extractLatLng(r.record)
          if (!geo) continue
          pts.push({
            ...geo,
            domain: 'emergency',
            label: (r.record.call_type as string) || 'Emergency',
            detail: `${r.responseMinutes.toFixed(1)} min response`,
            value: `${r.responseMinutes.toFixed(0)}m`,
          })
        }
        addDomain('emergency', pts)
      }).catch(() => { addDomain('emergency', []) })
    )

    // Query 2: Crime — top incidents with locations
    queries.push(
      fetchDataset<Record<string, unknown>>('policeIncidents', {
        $select: 'incident_category, incident_description, intersection, latitude, longitude, point, incident_datetime',
        $where: `analysis_neighborhood = '${nh}' AND incident_datetime >= '${dateStart}' AND incident_datetime <= '${dateEnd}' AND latitude IS NOT NULL`,
        $order: 'incident_datetime DESC',
        $limit: 15,
      }).then((rows) => {
        const pts: PortraitPoint[] = []
        for (const r of rows.slice(0, 12)) {
          const geo = extractLatLng(r)
          if (!geo) continue
          pts.push({
            ...geo,
            domain: 'crime',
            label: (r.incident_category as string) || 'Crime',
            detail: (r.incident_description as string) || (r.intersection as string) || '',
          })
        }
        addDomain('crime', pts)
      }).catch(() => { addDomain('crime', []) })
    )

    // Query 3: 311 Cases — recent cases with locations
    queries.push(
      fetchDataset<Record<string, unknown>>('cases311', {
        $select: 'service_name, address, lat, long, point, requested_datetime, status_description',
        $where: `analysis_neighborhood = '${nh}' AND requested_datetime >= '${dateStart}' AND requested_datetime <= '${dateEnd}' AND lat IS NOT NULL`,
        $order: 'requested_datetime DESC',
        $limit: 20,
      }).then((rows) => {
        const pts: PortraitPoint[] = []
        for (const r of rows) {
          const geo = extractLatLng(r)
          if (!geo) continue
          pts.push({
            ...geo,
            domain: 'cases311',
            label: (r.service_name as string) || '311 Case',
            detail: (r.address as string) || '',
          })
        }
        addDomain('cases311', pts)
      }).catch(() => { addDomain('cases311', []) })
    )

    // Query 4: Traffic Crashes — DUI + fatal/severe only
    const DUI_CODES = "'23152(a-g)','23153(a-g)'"
    queries.push(
      fetchDataset<Record<string, unknown>>('trafficCrashes', {
        $select: 'collision_severity, type_of_collision, vz_pcf_group, number_killed, number_injured, primary_rd, secondary_rd, tb_latitude, tb_longitude, point, collision_datetime',
        $where: `analysis_neighborhood = '${nh}' AND collision_datetime >= '${dateStart}' AND collision_datetime <= '${dateEnd}' AND (vz_pcf_group IN (${DUI_CODES}) OR number_killed > 0 OR collision_severity = 'Fatal')`,
        $order: 'collision_datetime DESC',
        $limit: 20,
      }).then((rows) => {
        const pts: PortraitPoint[] = []
        for (const r of rows) {
          const geo = extractLatLng(r)
          if (!geo) continue
          const isDui = r.vz_pcf_group === '23152(a-g)' || r.vz_pcf_group === '23153(a-g)'
          const numKilled = Number(r.number_killed) || 0
          const numInjured = Number(r.number_injured) || 0
          pts.push({
            ...geo,
            domain: 'crashes',
            label: isDui ? 'DUI Crash' : numKilled > 0 ? 'Fatal Crash' : 'Severe Crash',
            detail: `${(r.primary_rd as string) || ''}${r.secondary_rd ? ' at ' + (r.secondary_rd as string) : ''}`,
            value: numKilled > 0 ? `${numKilled} killed` : numInjured > 0 ? `${numInjured} injured` : undefined,
          })
        }
        addDomain('crashes', pts)
      }).catch(() => { addDomain('crashes', []) })
    )

    // Query 5: Parking Citations — recent citations with geo
    queries.push(
      fetchDataset<Record<string, unknown>>('parkingCitations', {
        $select: 'violation_desc, citation_location, fine_amount, the_geom, citation_issued_datetime',
        $where: `analysis_neighborhood = '${nh}' AND citation_issued_datetime >= '${dateStart}' AND citation_issued_datetime <= '${dateEnd}' AND the_geom IS NOT NULL`,
        $order: 'citation_issued_datetime DESC',
        $limit: 15,
      }).then((rows) => {
        const pts: PortraitPoint[] = []
        for (const r of rows.slice(0, 12)) {
          const geo = extractLatLng(r)
          if (!geo) continue
          const fineAmount = r.fine_amount ? parseFloat(r.fine_amount as string) : 0
          pts.push({
            ...geo,
            domain: 'citations',
            label: (r.violation_desc as string) || 'Citation',
            detail: (r.citation_location as string) || '',
            value: fineAmount > 0 ? `$${fineAmount.toFixed(0)}` : undefined,
          })
        }
        addDomain('citations', pts)
      }).catch(() => { addDomain('citations', []) })
    )

    // Mark done when all resolve
    Promise.allSettled(queries).then(() => {
      setState((prev) => ({ ...prev, loading: false }))
    })

  }, [neighborhood, dateRange])

  return { ...state, diveIn, isActive, reset }
}
