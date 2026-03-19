/**
 * Election data hooks — lazy-load static JSON from /elections/
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
  return useStaticJSON<ElectionManifest>('/elections/index.json')
}

/** Load results for a specific election */
export function useElectionResults(dateCode: string | null) {
  const url = useMemo(
    () => (dateCode ? `/elections/results/${dateCode}/summary.json` : null),
    [dateCode],
  )
  return useStaticJSON<ElectionResults>(url)
}

/** Load RCV round data for a specific race in a specific election */
export function useRCVRounds(dateCode: string | null, raceSlug: string | null) {
  const url = useMemo(
    () =>
      dateCode && raceSlug
        ? `/elections/results/${dateCode}/rcv/${raceSlug}.json`
        : null,
    [dateCode, raceSlug],
  )
  return useStaticJSON<RCVContest>(url)
}

/** Load historical turnout data */
export function useTurnoutHistory() {
  return useStaticJSON<TurnoutRecord[]>('/elections/turnout/historical.json')
}

/** Load ballot propositions */
export function useBallotPropositions() {
  return useStaticJSON<BallotProposition[]>('/elections/propositions/index.json')
}
