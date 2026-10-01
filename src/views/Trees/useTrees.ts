// src/views/Trees/useTrees.ts
//
// The committed Trees snapshot files, fetched LAZILY (the Restaurants
// useStorefronts pattern): `public/data/trees/trees.json` is ~5 MB columnar
// (~144,500 sites) and must never ride the entry bundle, so it is fetched,
// not imported. All three files are written by scripts/build-trees.ts.
//
// One module-level promise per file: every consumer on the page shares one
// request, and a remount after navigating away re-reads the cache instantly.
// A failed request clears its promise, so a remount — or the hook's retry(),
// wired to the page's Retry button — fetches anew.
//
// The aggregates file is small and loads on its own; the rail never waits
// for the 144k-row file.

import { useCallback, useEffect, useState } from 'react'
import type { DisappearedLog, TreesAggregates, TreesSnapshot } from '@/lib/trees/types'

export const TREES_URL = '/data/trees/trees.json'
export const AGGREGATES_URL = '/data/trees/aggregates.json'
/** The generator's log of sites that left the inventory; read only by the
 *  Safety tab, so it is requested only when that tab mounts. */
export const DISAPPEARED_URL = '/data/trees/disappeared.json'

interface Loader<T> {
  cached: T | null
  load: () => Promise<T>
}

function makeLoader<T>(url: string, what: string, onStart?: () => void): Loader<T> {
  let inflight: Promise<T> | null = null
  const loader: Loader<T> = {
    cached: null,
    load() {
      if (loader.cached) return Promise.resolve(loader.cached)
      if (!inflight) {
        onStart?.()
        inflight = fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`${what} failed to load (${res.status})`)
            return res.json() as Promise<T>
          })
          .then((data) => {
            loader.cached = data
            return data
          })
          .catch((err) => {
            inflight = null
            throw err
          })
      }
      return inflight
    },
  }
  return loader
}

/** performance.now() when the snapshot request last started. */
let snapshotStartedAt: number | null = null
/** Milliseconds since the snapshot request started — the `?tune=1`
 *  fetch→features measurement. null before the first request. */
export function msSinceSnapshotFetch(): number | null {
  if (snapshotStartedAt === null) return null
  try { return performance.now() - snapshotStartedAt } catch { return null }
}

const snapshotLoader = makeLoader<TreesSnapshot>(TREES_URL, 'The street-tree inventory', () => {
  try { snapshotStartedAt = performance.now() } catch { /* no performance clock */ }
})
const aggregatesLoader = makeLoader<TreesAggregates>(AGGREGATES_URL, 'The street-tree summaries')
const disappearedLoader = makeLoader<DisappearedLog>(DISAPPEARED_URL, 'The former-sites log')

export interface LoadState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  /** Clear the error and request the file again (the page's Retry). */
  retry: () => void
}

function useLoader<T>(loader: Loader<T>): LoadState<T> {
  const [data, setData] = useState<T | null>(loader.cached)
  const [error, setError] = useState<Error | null>(null)
  // Bumped by retry() — re-runs the effect, which re-calls load() (a failed
  // request already cleared its promise, so this fetches anew).
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // A cached file resolves on the next microtask — no synchronous setState.
    let alive = true
    loader.load().then(
      (d) => { if (alive) setData(d) },
      (err: unknown) => { if (alive) setError(err instanceof Error ? err : new Error(String(err))) },
    )
    return () => { alive = false }
  }, [loader, attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { data, error, loading: data === null && error === null, retry }
}

export function useTreesSnapshot(): LoadState<TreesSnapshot> {
  return useLoader(snapshotLoader)
}

export function useTreesAggregates(): LoadState<TreesAggregates> {
  return useLoader(aggregatesLoader)
}

export function useTreesDisappeared(): LoadState<DisappearedLog> {
  return useLoader(disappearedLoader)
}
