// src/hooks/useEraSeries.ts
// One annual GROUP BY per view, feeding the header Era Track.
//
// Deliberately independent of dateRange: the strip shows the whole record and
// only the SELECTION moves as the user brushes, so brushing costs no requests.
// ~24 rows. NOT cached 24h — these queries inherit the same per-dataset cache
// TTL as everything else fetched through fetchDataset (10-30 minutes, see
// src/api/datasets.ts's `cacheTTL`), so a fresh mount well inside that window
// serves from cache; past it, a real request goes out again.

import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { eraSourceFor, buildEraQuery, buildHistoricalEraQuery, eraDomain, type EraSeam } from '@/api/eraSources'
import { parseYearCounts, todayIso, type YearCount } from '@/utils/eraStrip'
import type { CityId } from '@/cities/routing'
import { isViewLive } from '@/cities/registry'

export interface UseEraSeriesResult {
  years: YearCount[]
  domain: { start: string; end: string }
  seams: EraSeam[]
  /** Present only when the domain clamp hides published rows. */
  clampNote?: string
  isLoading: boolean
  /** false → the caller renders the legacy 730-day track instead. */
  available: boolean
}

export function useEraSeries(cityId: CityId, viewId: string): UseEraSeriesResult {
  const source = useMemo(() => eraSourceFor(cityId, viewId), [cityId, viewId])
  // Era queries activate only for LIVE (cityId, viewId) entries. Two reasons:
  // (a) a dormant slug's one pre-redirect AppShell frame must not fire a
  // 20s-timeout annual query for a view that immediately redirects; (b) this
  // replaced the stage-2 'sf' stand-down when Oakland's first views went live
  // (stage-3 spec §2 — liveness, not city, is the fact that matters).
  const active = source != null && isViewLive(cityId, viewId)
  const params = useMemo(() => (source ? buildEraQuery(source) : {}), [source])
  const histParams = useMemo(
    () => (source ? buildHistoricalEraQuery(source) ?? {} : {}), [source],
  )

  const { data, isLoading } = useDataset<{ yr?: string; n: string }>(
    // The key is unused when disabled; policeIncidents is a safe placeholder
    // because `enabled: false` short-circuits before any fetch.
    source?.datasetKey ?? 'policeIncidents',
    params,
    [JSON.stringify(params)],
    // These are the app's heaviest queries (parking-citations measured at
    // 34.9s cold) — timeoutMs/retries keep one from holding a per-host
    // connection slot for a whole view's cold load. See useDataset.ts.
    { enabled: active, timeoutMs: 20_000, retries: 1, cityId },
  )

  // The second extract, for the one source that has one (SFPD 2003-2017).
  const { data: histData, isLoading: histLoading } = useDataset<{ yr?: string; n: string }>(
    source?.historical?.datasetKey ?? 'policeIncidents',
    histParams,
    [JSON.stringify(histParams)],
    { enabled: active && source?.historical != null, timeoutMs: 20_000, retries: 1, cityId },
  )

  const years = useMemo(
    () => (source ? parseYearCounts([...histData, ...data]) : []),
    [data, histData, source],
  )
  const domain = useMemo(
    () => (source ? eraDomain(source, todayIso())
                  : { start: '', end: '' }),
    [source],
  )

  const anyLoading = active && (isLoading || (source?.historical != null && histLoading))

  return {
    years,
    domain,
    seams: source?.seams ?? [],
    clampNote: source?.clampNote,
    isLoading: anyLoading,
    // A source with zero returned years is a failed or empty query — fall back
    // rather than render an empty strip, which reads as "this city had no crime".
    available: active && (anyLoading || years.length > 0),
  }
}
