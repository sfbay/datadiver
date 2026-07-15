/**
 * Election data hooks — lazy-load static JSON from /data/elections/
 *
 * Unlike other DataDiver views that use useDataset (Socrata SODA API),
 * election data comes from pre-built static JSON files. These hooks
 * use fetch + useMemo with a simple module-level cache.
 */

import { useState, useEffect, useMemo } from 'react'
import type {
  ElectionManifest,
  ElectionResults,
  RCVContest,
  TurnoutRecord,
  BallotProposition,
  PrecinctEra,
  PrecinctTurnoutFile,
  PrecinctRaceFile,
  NeighborhoodResultsFile,
} from '@/types/elections'

// ── Module-level cache ──────────────────────────────────────────────

const cache = new Map<string, unknown>()

async function fetchJSON<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const data = await res.json()
  cache.set(url, data)
  return data as T
}

// ── Generic fetch hook ──────────────────────────────────────────────

function useStaticJSON<T>(url: string | null): {
  data: T | null
  isLoading: boolean
  error: string | null
} {
  const [data, setData] = useState<T | null>(
    url && cache.has(url) ? (cache.get(url) as T) : null,
  )
  const [isLoading, setIsLoading] = useState(url !== null && !cache.has(url))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setData(null)
      setIsLoading(false)
      return
    }

    if (cache.has(url)) {
      setData(cache.get(url) as T)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchJSON<T>(url)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return { data, isLoading, error }
}

// ── Public hooks ────────────────────────────────────────────────────

/** Load the election manifest (list of all elections + their races) */
export function useElectionManifest() {
  return useStaticJSON<ElectionManifest>('/data/elections/index.json')
}

/** Load results for a specific election */
export function useElectionResults(dateCode: string | null) {
  const url = useMemo(
    () => (dateCode ? `/data/elections/results/${dateCode}/summary.json` : null),
    [dateCode],
  )
  return useStaticJSON<ElectionResults>(url)
}

/** Load RCV round data for a specific race in a specific election */
export function useRCVRounds(dateCode: string | null, raceSlug: string | null) {
  const url = useMemo(
    () =>
      dateCode && raceSlug
        ? `/data/elections/results/${dateCode}/rcv/${raceSlug}.json`
        : null,
    [dateCode, raceSlug],
  )
  return useStaticJSON<RCVContest>(url)
}

/** Load historical turnout data */
export function useTurnoutHistory() {
  return useStaticJSON<TurnoutRecord[]>('/data/elections/turnout/historical.json')
}

/** Load ballot propositions */
export function useBallotPropositions() {
  return useStaticJSON<BallotProposition[]>('/data/elections/propositions/index.json')
}

// ── Precinct + neighborhood result hooks (era-aware) ────────────────

const ERA_GEO_URL: Record<PrecinctEra, string> = {
  prec_2012: '/data/elections/geo/prec-2012.geojson',
  prec_2022: '/data/elections/geo/prec-2022.geojson',
}
const LEGACY_NHOOD_GEO_URL = '/data/elections/geo/legacy-neighborhoods.geojson'

/** Era-pinned precinct polygons. Pass null to fetch nothing. */
export function useElectionGeo(era: PrecinctEra | null) {
  return useStaticJSON<GeoJSON.FeatureCollection>(era ? ERA_GEO_URL[era] : null)
}

/** The 26-neighborhood legacy frame (pre-Nov-2022 vocabulary). */
export function useLegacyNeighborhoodGeo(enabled: boolean) {
  return useStaticJSON<GeoJSON.FeatureCollection>(enabled ? LEGACY_NHOOD_GEO_URL : null)
}

/** Per-precinct registered/ballots/turnout + the label→ids join table. */
export function usePrecinctTurnout(dateCode: string | null) {
  const url = useMemo(
    () => (dateCode ? `/data/elections/results/${dateCode}/precincts/_turnout.json` : null),
    [dateCode],
  )
  return useStaticJSON<PrecinctTurnoutFile>(url)
}

/** Per-precinct votes for one race — ~170 KB, lazy, cached per race. */
export function usePrecinctRace(dateCode: string | null, raceId: string | null) {
  const url = useMemo(
    () =>
      dateCode && raceId
        ? `/data/elections/results/${dateCode}/precincts/${raceId}.json`
        : null,
    [dateCode, raceId],
  )
  return useStaticJSON<PrecinctRaceFile>(url)
}

/** Certified dsov per-neighborhood results (era-correct vocabulary). */
export function useNeighborhoodResults(dateCode: string | null) {
  const url = useMemo(
    () => (dateCode ? `/data/elections/results/${dateCode}/neighborhoods.json` : null),
    [dateCode],
  )
  return useStaticJSON<NeighborhoodResultsFile>(url)
}

/** Warm the module cache so Time Machine scrubs with zero fetches:
 *  all six _turnout files (~270 KB total) + both era geometries + the
 *  legacy frame. Race files stay lazy (fetched as the scrub crosses). */
export function preloadTimeMachineData(dateCodes: string[]): void {
  for (const dc of dateCodes) {
    void fetchJSON(`/data/elections/results/${dc}/precincts/_turnout.json`).catch(() => {})
  }
  void fetchJSON(ERA_GEO_URL.prec_2012).catch(() => {})
  void fetchJSON(ERA_GEO_URL.prec_2022).catch(() => {})
  void fetchJSON(LEGACY_NHOOD_GEO_URL).catch(() => {})
}
