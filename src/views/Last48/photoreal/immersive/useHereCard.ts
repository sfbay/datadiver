// src/views/Last48/photoreal/immersive/useHereCard.ts
//
// Assembles the "here" reading for a clicked point (Round B §3). Two of the
// four rows (counts, ACS) are synchronous from data already in memory; the
// neighborhood row waits on the ~1 MB boundary polygons, LAZILY fetched on
// the first non-null point (never at mount — see the boundaries hook call
// below); the corner is ONE Mapbox reverse-geocode per click, aborted if the
// point changes first, and simply omitted on any failure (no token, no
// network, a 4xx). Nothing here is cached beyond that shared boundary asset:
// a reader who clicks the same spot twice has asked twice, and one geocode
// request a click is the budget.
import { useEffect, useMemo, useState } from 'react'
import type { NormalizedEvent } from '@/types/last48'
import { useBoundariesAsset } from '@/hooks/useNeighborhoodBoundaries'
import { getCity } from '@/cities/registry'
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
  // The immersive page is SF-only (no Oakland /live route), and lazy on
  // purpose: the reader may never click, so the ~1 MB neighborhood polygon
  // file must not compete with Google tile streaming at mount. It loads on
  // the first non-null point and is cached thereafter (useBoundariesAsset's
  // module cache) — the neighborhood row is simply null until it lands.
  const { boundaries } = useBoundariesAsset(point ? getCity('sf').areas.geojsonPath : null)
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
