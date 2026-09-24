// src/views/Restaurants/useStorefronts.ts
//
// The committed storefront snapshot (`public/data/restaurants/storefronts.json`,
// written by `pnpm build:storefronts`), fetched LAZILY — it is ~7.7 MB raw /
// ~0.9 MB gzipped, so it must never ride the entry bundle (a static import
// would). One module-level promise: every consumer on the page shares one
// request, and a remount after navigating away re-reads the cache instantly.
// A failed request clears the promise, so a remount — or the hook's retry(),
// wired to the page's Retry button — fetches anew.
//
// Everything that joins eras or the business registry lives in this file
// (spec D4); the view's live queries never re-derive it.

import { useCallback, useEffect, useState } from 'react'
import type { Storefront, StorefrontSnapshot } from '@/lib/storefronts/types'

export const STOREFRONTS_URL = '/data/restaurants/storefronts.json'

let cached: StorefrontSnapshot | null = null
let inflight: Promise<StorefrontSnapshot> | null = null

/** Fetch (once) and cache the snapshot. */
export function loadStorefronts(): Promise<StorefrontSnapshot> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetch(STOREFRONTS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Storefront histories failed to load (${res.status})`)
        return res.json() as Promise<StorefrontSnapshot>
      })
      .then((snap) => {
        cached = snap
        return snap
      })
      .catch((err) => {
        inflight = null
        throw err
      })
  }
  return inflight
}

export function useStorefronts(): {
  data: StorefrontSnapshot | null
  error: Error | null
  loading: boolean
  /** Clear the error and request the snapshot again (the page's Retry). */
  retry: () => void
} {
  const [data, setData] = useState<StorefrontSnapshot | null>(cached)
  const [error, setError] = useState<Error | null>(null)
  // Bumped by retry() — re-runs the effect, which re-calls loadStorefronts
  // (a failed request already cleared `inflight`, so this fetches anew).
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (cached) {
      setData(cached)
      return
    }
    let alive = true
    loadStorefronts().then(
      (snap) => { if (alive) setData(snap) },
      (err: unknown) => { if (alive) setError(err instanceof Error ? err : new Error(String(err))) },
    )
    return () => { alive = false }
  }, [attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { data, error, loading: data === null && error === null, retry }
}

export interface StorefrontIndex {
  byKey: Map<string, Storefront>
  /** 2024+ permit number → storefront key (how a live map row finds its door). */
  keyByPermit: Map<string, string>
}

const indexCache = new WeakMap<StorefrontSnapshot, StorefrontIndex>()

/** Lookup tables over a snapshot, built once per snapshot object. */
export function indexStorefronts(snap: StorefrontSnapshot): StorefrontIndex {
  const hit = indexCache.get(snap)
  if (hit) return hit
  const byKey = new Map<string, Storefront>()
  const keyByPermit = new Map<string, string>()
  for (const sf of snap.storefronts) {
    byKey.set(sf.key, sf)
    for (const p of sf.permits) if (!keyByPermit.has(p)) keyByPermit.set(p, sf.key)
  }
  const idx = { byKey, keyByPermit }
  indexCache.set(snap, idx)
  return idx
}
