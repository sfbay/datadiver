// src/stores/summaryStore.ts
//
// Cross-view "seeded summary" store. Treats unavoidable cold-load latency as
// editorial time, not dead time: a view contributes derived stats when its
// data lands, and loading screens consume them — so the wait teaches.
//
// THE KEY SUBTLETY: a loading screen shows *during* the load, so it can never
// use *this* load's numbers (the numbers are exactly what we're waiting for).
// The store is therefore a TIME-SHIFTED cache — written on load-complete,
// persisted to localStorage, read back on the NEXT cold-load. The tips you see
// while The Last 48 boots are your previous visit's real counts; first-time
// visitors get hardcoded editorial fallbacks (see Last48LoadingTips).
//
// This is step 🅑 of the seeded-summary plan (memory: seeded-summary-
// architecture). Step 🅐 was the hardcoded-only tip deck. The store is built
// generically (per-view slots) so other views — EmergencyResponse median
// response time, Crime top types, etc. — can contribute later without
// reshaping it. Only The Last 48 contributes today.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { LAST48_DATASETS, type DatasetId } from '@/types/last48'

/** Per-dataset 48h volumes as last observed on a completed Last 48 load. */
export type Last48Counts = Partial<Record<DatasetId, number>>

export interface Last48Summary {
  /** 48h event counts per dataset. Partial: only datasets that reached FULL
   *  load contributed (head-only / disabled streams are absent → fallback). */
  counts: Last48Counts
  /** When these counts were last written (ms epoch); null if never. */
  updatedAt: number | null
}

interface SummaryState {
  last48: Last48Summary
  /**
   * Merge fresh per-dataset counts from a completed load. No-ops when nothing
   * changed, which matters: this is called on every poll cycle, and without
   * the guard every poll would rewrite localStorage and re-render consumers.
   * Merges (never replaces) so toggling one stream off for a session doesn't
   * wipe the others' stored counts.
   */
  contributeLast48: (counts: Last48Counts) => void
}

const EMPTY_LAST48: Last48Summary = { counts: {}, updatedAt: null }

export const useSummaryStore = create<SummaryState>()(
  persist(
    (set, get) => ({
      last48: EMPTY_LAST48,
      contributeLast48: (counts) => {
        const prev = get().last48.counts
        const next: Last48Counts = { ...prev }
        let changed = false
        for (const id of LAST48_DATASETS) {
          const v = counts[id]
          if (typeof v === 'number' && v !== prev[id]) {
            next[id] = v
            changed = true
          }
        }
        if (!changed) return
        set({ last48: { counts: next, updatedAt: Date.now() } })
      },
    }),
    {
      name: 'datadiver:summary',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Persist only the data slots, not the action functions.
      partialize: (s) => ({ last48: s.last48 }),
    },
  ),
)
