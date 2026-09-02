// src/stores/last48SummaryMigrate.ts
//
// The persisted-state migration for summaryStore's `last48` slot, kept as a
// pure leaf so it can be tested under the node-only Vitest (the store itself
// binds localStorage at module eval).
//
// v1 (before Sept. 2 2026) stored each stream's DRAWN-SAMPLE length. That
// length is the window's true size whenever the draw was not capped — an
// uncapped draw is the whole window by construction — so those seeds are
// still true and are kept. At or above the cap (LAST48_ROW_CAP) it was the
// cap itself, or a hold accumulated across polls that may have stopped short
// of the true total, so those are dropped; the next full load re-seeds them.
// Dropping EVERY v1 seed would serve the hardcoded fallback tips to every
// returning visitor on the first cold load after deploy for no gain.

import { LAST48_ROW_CAP } from '@/hooks/last48Truncation'
import { LAST48_DATASETS, type DatasetId } from '@/types/last48'
import type { Last48Summary } from './summaryStore'

export const LAST48_SUMMARY_VERSION = 2

export interface PersistedSummary {
  last48: Last48Summary
}

const EMPTY: Last48Summary = { counts: {}, updatedAt: null }

/** zustand `persist.migrate` for the summary store. Returns a fresh object;
 *  never throws on garbage (a corrupt entry becomes an empty seed). */
export function migrateLast48Summary(persisted: unknown, version: number): PersistedSummary {
  if (version >= LAST48_SUMMARY_VERSION) {
    const p = persisted as Partial<PersistedSummary> | null | undefined
    return { last48: p?.last48 ?? EMPTY }
  }
  const p = persisted as { last48?: { counts?: unknown; updatedAt?: unknown } } | null | undefined
  const rawCounts = p?.last48?.counts
  const counts: Partial<Record<DatasetId, number>> = {}
  if (rawCounts && typeof rawCounts === 'object') {
    for (const id of LAST48_DATASETS) {
      const n = (rawCounts as Record<string, unknown>)[id]
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < LAST48_ROW_CAP) {
        counts[id] = n
      }
    }
  }
  const kept = Object.keys(counts).length > 0
  const updatedAt = p?.last48?.updatedAt
  return {
    last48: {
      counts,
      updatedAt: kept && typeof updatedAt === 'number' ? updatedAt : null,
    },
  }
}
