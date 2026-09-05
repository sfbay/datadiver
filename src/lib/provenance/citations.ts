// The citable-query recorder (spec §5.2). An external store in the
// useLoadingProgress.ts mould — NOT appStore (browser-only at module eval).
// A write replaces ONLY its own slot (purpose|datasetKey|facet) inside its
// (city/view) scope; untagged fetches never write. That is what makes
// "last-write-wins" impossible rather than merely discouraged.
import { useEffect, useSyncExternalStore } from 'react'
import type { SoQLParams } from '@/api/client'
import type { CityId } from '@/cities/routing'
import type { ViewId } from '@/cities/manifest'
import type { QueryPurpose } from './purposes'
import { useRouteView } from '@/cities/useActiveCity'

export interface CitableQuery {
  cityId: CityId
  viewId: ViewId
  purpose: QueryPurpose
  /** Reader label when one purpose fires more than once on one dataset. Part of the slot key. */
  facet?: string
  datasetKey: string
  datasetId: string
  host: string
  /** RESOLVED params — the injected $order/$limit included. */
  params: SoQLParams
  /** Exactly resolveQuery().url — token-free by construction. */
  url: string
  fetchedAt: number
  fromCache: boolean
  rowCount: number
  hitLimit: boolean
  /** rows.slice(0, 5): aggregates travel whole; samples show their newest rows. */
  head: Record<string, unknown>[]
}

type Scope = Map<string, CitableQuery>
const scopes = new Map<string, Scope>()
const snapshots = new Map<string, CitableQuery[]>()
const listeners = new Set<() => void>()
const EMPTY: CitableQuery[] = []

const scopeKey = (cityId: CityId, viewId: ViewId) => `${cityId}/${viewId}`

export function slotKey(purpose: QueryPurpose, datasetKey: string, facet?: string): string {
  return `${purpose}|${datasetKey}|${facet ?? ''}`
}

function notify(key: string) {
  snapshots.set(key, [...(scopes.get(key)?.values() ?? [])])
  listeners.forEach((l) => l())
}

export function recordCitation(rec: CitableQuery): void {
  const key = scopeKey(rec.cityId, rec.viewId)
  const scope = scopes.get(key) ?? new Map<string, CitableQuery>()
  const slot = slotKey(rec.purpose, rec.datasetKey, rec.facet)
  if (import.meta.env.DEV) {
    const prev = scope.get(slot)
    if (prev && prev.datasetId !== rec.datasetId) {
      console.error(`[datadiver] citation slot '${slot}' rewritten for a different dataset (${prev.datasetId} → ${rec.datasetId}) — two call sites share a purpose`)
    }
  }
  scope.set(slot, rec)
  scopes.set(key, scope)
  notify(key)
}

export function clearCitationScope(cityId: CityId, viewId: ViewId): void {
  const key = scopeKey(cityId, viewId)
  if (!scopes.has(key) && !snapshots.has(key)) return
  scopes.delete(key)
  snapshots.delete(key)
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) }

export function useCitableQueries(cityId: CityId, viewId: ViewId): CitableQuery[] {
  const key = scopeKey(cityId, viewId)
  return useSyncExternalStore(subscribe, () => snapshots.get(key) ?? EMPTY)
}

/** Mount ONCE (AppShell). Clears a scope when the route leaves it. A param
 *  change inside a view does not clear — the new query replaces its slot. */
export function useCitationScope(): void {
  const { cityId, viewId } = useRouteView()
  // RouteIdentity.viewId is an unvalidated router slug (string), not the
  // ViewId union — safe to widen here: an unknown slug just clears a scope
  // key that nothing else ever wrote to.
  useEffect(() => () => clearCitationScope(cityId, viewId as ViewId), [cityId, viewId])
}

/** Tests only. */
export function _resetCitations(): void { scopes.clear(); snapshots.clear() }
export function _snapshot(cityId: CityId, viewId: ViewId): CitableQuery[] { return snapshots.get(scopeKey(cityId, viewId)) ?? EMPTY }
