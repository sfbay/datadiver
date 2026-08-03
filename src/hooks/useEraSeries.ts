// src/hooks/useEraSeries.ts
// One annual GROUP BY per view, feeding the header Era Track.
//
// Deliberately independent of dateRange: the strip shows the whole record and
// only the SELECTION moves as the user brushes, so brushing costs no requests.
// ~24 rows, cached 24h — annual counts change at most once a day, and only in
// the current year's bar.

import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { eraSourceForPath, buildEraQuery, buildHistoricalEraQuery, eraDomain, type EraSeam } from '@/api/eraSources'
import { parseYearCounts, type YearCount } from '@/utils/eraStrip'

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

export function useEraSeries(pathname: string): UseEraSeriesResult {
  const source = useMemo(() => eraSourceForPath(pathname), [pathname])
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
    { enabled: source != null },
  )

  // The second extract, for the one source that has one (SFPD 2003-2017).
  const { data: histData, isLoading: histLoading } = useDataset<{ yr?: string; n: string }>(
    source?.historical?.datasetKey ?? 'policeIncidents',
    histParams,
    [JSON.stringify(histParams)],
    { enabled: source?.historical != null },
  )

  const years = useMemo(
    () => (source ? parseYearCounts([...histData, ...data]) : []),
    [data, histData, source],
  )
  const domain = useMemo(
    () => (source ? eraDomain(source, new Date().toISOString().slice(0, 10))
                  : { start: '', end: '' }),
    [source],
  )

  return {
    years,
    domain,
    seams: source?.seams ?? [],
    clampNote: source?.clampNote,
    isLoading: source != null && (isLoading || (source.historical != null && histLoading)),
    // A source with zero returned years is a failed or empty query — fall back
    // rather than render an empty strip, which reads as "this city had no crime".
    available: source != null && (isLoading || years.length > 0),
  }
}
