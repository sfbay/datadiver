// src/views/Last48/photoreal/immersive/useHereCard.ts
//
// Assembles the "here" reading for a clicked point (Round B §3). Three of
// the four rows are synchronous from data already in memory; the fourth —
// the nearest corner — is ONE Mapbox reverse-geocode per click, aborted if
// the point changes first, and simply omitted on any failure (no token, no
// network, a 4xx). Nothing here is cached: a reader who clicks the same
// spot twice has asked twice, and one request a click is the budget.
import { useEffect, useMemo, useState } from 'react'
import type { NormalizedEvent } from '@/types/last48'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useCensusData } from '@/hooks/useCensusData'
import { pointInNeighborhood } from './pointInNeighborhood'
import { nearbyCounts, formatNearby, acsLine, cornerFromGeocode } from './here'

export interface HerePoint { lng: number; lat: number }

export interface HereReading {
  neighborhood: string | null
  /** `near 445 Minna Street`, or null while loading / on failure. */
  corner: string | null
  /** `911 dispatch 4 · Fire/EMS 1 · 311 case 2` or `quiet here`. */
  nearby: string
  /** `Median rent $2,340 · 18% over 65`, or null when the row is missing. */
  acs: string | null
}

const GEOCODE = 'https://api.mapbox.com/search/geocode/v6/reverse'

export function useHereCard(point: HerePoint | null, events: readonly NormalizedEvent[]): HereReading | null {
  const { boundaries } = useNeighborhoodBoundaries()
  const { neighborhoods } = useCensusData()
  const [corner, setCorner] = useState<string | null>(null)

  useEffect(() => {
    setCorner(null)
    if (!point) return
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
    if (!token) return
    const ac = new AbortController()
    const url = new URL(GEOCODE)
    url.searchParams.set('longitude', point.lng.toFixed(5))
    url.searchParams.set('latitude', point.lat.toFixed(5))
    url.searchParams.set('types', 'address,street')
    url.searchParams.set('limit', '1')
    url.searchParams.set('access_token', token)
    fetch(url, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!ac.signal.aborted) setCorner(cornerFromGeocode(j)) })
      .catch(() => { /* omitted row — the reading never shows an error */ })
    return () => ac.abort()
  }, [point])

  return useMemo(() => {
    if (!point) return null
    const neighborhood = pointInNeighborhood(point.lng, point.lat, boundaries)
    const row = neighborhood ? neighborhoods.find((n) => n.name === neighborhood) : undefined
    return {
      neighborhood,
      corner,
      nearby: formatNearby(nearbyCounts(events, point.lng, point.lat)),
      acs: acsLine(row),
    }
  }, [point, boundaries, neighborhoods, events, corner])
}
