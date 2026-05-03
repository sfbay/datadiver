/** Merge 5 parallel useTrendBaseline calls into unified per-neighborhood profiles */

import { useMemo } from 'react'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import { SF_NEIGHBORHOODS, NON_RESIDENTIAL_NEIGHBORHOODS } from '@/utils/geo'
import type { NeighborhoodProfile, DatasetMetric } from './types'

// Uses shared NON_RESIDENTIAL_NEIGHBORHOODS from geo.ts

interface ProfileCacheEntry {
  profiles: NeighborhoodProfile[]
  profileMap: Map<string, NeighborhoodProfile>
  timestamp: number
  dateKey: string
}
const PROFILE_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
let profileCache: ProfileCacheEntry | null = null

/** Approximate neighborhood centers for map flyTo */
const CENTERS: Record<string, [number, number]> = {
  'Bayview Hunters Point': [37.7346, -122.3907],
  'Bernal Heights': [37.7389, -122.4154],
  'Castro/Upper Market': [37.7609, -122.4350],
  'Chinatown': [37.7941, -122.4078],
  'Excelsior': [37.7236, -122.4254],
  'Financial District/South Beach': [37.7897, -122.3934],
  'Glen Park': [37.7340, -122.4332],
  'Golden Gate Park': [37.7694, -122.4862],
  'Haight Ashbury': [37.7692, -122.4481],
  'Hayes Valley': [37.7759, -122.4245],
  'Inner Richmond': [37.7781, -122.4641],
  'Inner Sunset': [37.7592, -122.4658],
  'Japantown': [37.7854, -122.4294],
  'Lakeshore': [37.7268, -122.4838],
  'Lincoln Park': [37.7856, -122.5033],
  'Lone Mountain/USF': [37.7770, -122.4518],
  'Marina': [37.8012, -122.4364],
  'McLaren Park': [37.7183, -122.4204],
  'Mission': [37.7599, -122.4148],
  'Mission Bay': [37.7707, -122.3910],
  'Nob Hill': [37.7930, -122.4161],
  'Noe Valley': [37.7502, -122.4337],
  'North Beach': [37.8007, -122.4112],
  'Oceanview/Merced/Ingleside': [37.7232, -122.4560],
  'Outer Mission': [37.7230, -122.4430],
  'Outer Richmond': [37.7781, -122.4941],
  'Pacific Heights': [37.7925, -122.4382],
  'Portola': [37.7284, -122.4054],
  'Potrero Hill': [37.7604, -122.3926],
  'Presidio': [37.7989, -122.4662],
  'Presidio Heights': [37.7878, -122.4518],
  'Russian Hill': [37.8011, -122.4194],
  'Seacliff': [37.7870, -122.4891],
  'South of Market': [37.7785, -122.3990],
  'Sunset/Parkside': [37.7532, -122.4941],
  'Tenderloin': [37.7833, -122.4133],
  'Treasure Island': [37.8235, -122.3707],
  'Twin Peaks': [37.7544, -122.4477],
  'Visitacion Valley': [37.7133, -122.4036],
  'West of Twin Peaks': [37.7458, -122.4577],
  'Western Addition': [37.7810, -122.4358],
}

function extract(
  neighborhoodMap: Map<string, any> | undefined,
  name: string
): DatasetMetric | null {
  if (!neighborhoodMap) return null
  const s = neighborhoodMap.get(name)
  if (!s) return null
  return {
    count: s.currentCount ?? 0,
    priorYearCount: s.priorYearCount ?? 0,
    yoyPct: s.yoyPct ?? 0,
    zScore: s.zScore ?? 0,
  }
}

export interface NeighborhoodProfilesResult {
  profiles: NeighborhoodProfile[]
  profileMap: Map<string, NeighborhoodProfile>
  isLoading: boolean
}

export function useNeighborhoodProfiles(
  dateRange: { start: string; end: string }
): NeighborhoodProfilesResult {
  const trendER = useTrendBaseline(
    { datasetKey: 'fireEMSDispatch', dateField: 'received_dttm', neighborhoodField: 'neighborhoods_analysis_boundaries', baseWhere: 'on_scene_dttm IS NOT NULL' },
    dateRange
  )
  const trendCrime = useTrendBaseline(
    { datasetKey: 'policeIncidents', dateField: 'incident_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )
  const trend311 = useTrendBaseline(
    { datasetKey: 'cases311', dateField: 'requested_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )
  const trendCrashes = useTrendBaseline(
    { datasetKey: 'trafficCrashes', dateField: 'collision_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )
  const trendCitations = useTrendBaseline(
    { datasetKey: 'parkingCitations', dateField: 'citation_issued_datetime', neighborhoodField: 'analysis_neighborhood' },
    dateRange
  )

  const isLoading =
    trendER.isLoading || trendCrime.isLoading || trend311.isLoading ||
    trendCrashes.isLoading || trendCitations.isLoading

  const dateKey = `${dateRange.start}|${dateRange.end}`

  const { profiles, profileMap } = useMemo(() => {
    if (
      profileCache &&
      profileCache.dateKey === dateKey &&
      Date.now() - profileCache.timestamp < PROFILE_CACHE_TTL
    ) {
      return { profiles: profileCache.profiles, profileMap: profileCache.profileMap }
    }

    const map = new Map<string, NeighborhoodProfile>()

    for (const name of SF_NEIGHBORHOODS) {
      if (NON_RESIDENTIAL_NEIGHBORHOODS.has(name)) continue
      const emergency = extract(trendER.neighborhoodMap, name)
      const crime = extract(trendCrime.neighborhoodMap, name)
      const cases311 = extract(trend311.neighborhoodMap, name)
      const crashes = extract(trendCrashes.neighborhoodMap, name)
      const citations = extract(trendCitations.neighborhoodMap, name)

      const metrics = [emergency, crime, cases311, crashes, citations].filter(
        (m): m is DatasetMetric => m !== null
      )
      const zScores = metrics.map((m) => m.zScore)
      const compositeZScore =
        zScores.length > 0 ? zScores.reduce((a, b) => a + b, 0) / zScores.length : 0
      const anomalyCount = zScores.filter((z) => Math.abs(z) > 1).length
      const totalEvents = metrics.reduce((sum, m) => sum + m.count, 0)

      const center = CENTERS[name] || [37.76, -122.44]
      map.set(name, {
        name,
        centerLat: center[0],
        centerLng: center[1],
        emergency,
        crime,
        cases311,
        crashes,
        citations,
        compositeZScore,
        anomalyCount,
        totalEvents,
      })
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.totalEvents - a.totalEvents)
    profileCache = { profiles: sorted, profileMap: map, timestamp: Date.now(), dateKey }
    return { profiles: sorted, profileMap: map }
  }, [
    dateKey,
    trendER.neighborhoodMap, trendCrime.neighborhoodMap,
    trend311.neighborhoodMap, trendCrashes.neighborhoodMap,
    trendCitations.neighborhoodMap,
  ])

  return { profiles, profileMap, isLoading }
}
