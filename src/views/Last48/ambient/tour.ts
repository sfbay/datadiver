// src/views/Last48/ambient/tour.ts
//
// Pure pass/cursor logic for the ambient tour. A "pass" is a snapshot of
// the newest PASS_SIZE geo-located visible events, toured newest-first by
// id. Id-cursor (never index): the live rail re-sorts as polls land, so an
// index cursor would skip or repeat rows; ids are immune. Mid-pass
// arrivals are picked up by the NEXT pass's snapshot (calm register — no
// preemption, per spec).

import type { NormalizedEvent } from '@/types/last48'

export const PASS_SIZE = 24

/** Snapshot the newest geo-located events as an ordered id list. */
export function buildPass(events: NormalizedEvent[], limit: number = PASS_SIZE): string[] {
  return events
    .filter((e) => e.longitude != null && e.latitude != null)
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .slice(0, limit)
    .map((e) => e.id)
}

/**
 * Wall-clock gate for the tour's self-scheduling timer. Given the intended
 * fire time `dueAt` and the current time `now`, returns how many ms to wait
 * before actually firing — `0` means "fire now".
 *
 * Why this exists: a background tab's `setTimeout`s are throttled and can be
 * released as a coalesced *burst* when the tab regains focus (switching apps,
 * or starting a screen recording, which backgrounds the window without firing
 * `visibilitychange`). A naive chain would then advance several events in one
 * frame — the detail card's "X minutes ago" number flickering through a dozen
 * values. By re-checking the wall clock on every wake, an early/extra timer is
 * told to wait the remainder instead of advancing, so transitions can never
 * land closer than one interval apart. `slop` absorbs sub-threshold jitter so
 * we don't re-arm for a few stray milliseconds.
 */
export function dueWaitMs(dueAt: number, now: number, slop = 200): number {
  const remaining = dueAt - now
  return remaining > slop ? remaining : 0
}

/**
 * Advance the cursor: the first id after `currentId` that still exists in
 * the window. null currentId starts the pass; null return = exhausted.
 * Unknown currentId (shouldn't happen, but defensive) = exhausted.
 */
export function nextTourId(
  pass: string[],
  currentId: string | null,
  liveIds: ReadonlySet<string>,
): string | null {
  const start = currentId === null ? 0 : pass.indexOf(currentId) + 1
  if (currentId !== null && start === 0) return null // unknown current id
  for (let i = start; i < pass.length; i++) {
    if (liveIds.has(pass[i])) return pass[i]
  }
  return null
}
