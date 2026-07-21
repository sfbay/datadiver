// src/hooks/rcvTransportCore.ts
//
// Pure transport-clock core for RCV round playback — no React, no timers,
// just the math a view-level clock needs: clamping an index into the
// rounds array, deciding how long to dwell on a round, and figuring out
// whose votes just landed. Lifted out of RCVRoundChart (which owned this
// logic before a precinct map needed to subscribe to the same round state)
// so both the chart and useRcvTransport share one tested source of truth.
import type { RCVRound } from '@/types/elections'

// Autoplay dwell per displayed round. Rounds that just received transfers
// hold ~2× longer so the redistribute→land→adopt sequence fully plays out
// and the callout can be read; no-transfer rounds advance briskly. The
// transfer dwell must exceed TRANSFER_WINDOW_MS (which must itself exceed
// the adopt animation's 0.55s delay + 2.2s run) — shrinking it below that
// advances the round mid-animation.
export const BASE_DWELL_MS = 1500
export const TRANSFER_DWELL_MS = 3400
// How long the ribbons/glow/segment stay mounted after a forward step.
export const TRANSFER_WINDOW_MS = 3000

/** Clamp a (possibly out-of-range) round index into [0, totalRounds - 1].
 *  Returns 0 when totalRounds is 0 — there's nothing to clamp into, and
 *  callers treat a totalRounds-0 transport as wholly inert. */
export function clampRound(r: number, totalRounds: number): number {
  if (totalRounds <= 0) return 0
  return Math.min(Math.max(r, 0), totalRounds - 1)
}

/** True iff `round` (0-based) received transfers from the previous round's
 *  elimination — i.e. rounds[round - 1] has any isEliminated candidate. A
 *  round's own isEliminated flag describes who's eliminated STARTING NEXT
 *  round, not who was just redistributed into the round being viewed (see
 *  rcvFlow.ts). Always false for round 0 — there is no previous round. */
export function roundReceivedTransfers(rounds: RCVRound[], round: number): boolean {
  if (round <= 0) return false
  const prev = rounds[round - 1]
  if (!prev) return false
  return prev.candidates.some((c) => c.isEliminated)
}

/** Autoplay dwell for the round currently being displayed. Transfer rounds
 *  linger so the redistribute→land→adopt sequence plays out and the
 *  callout can be read; under reduced motion the ribbons never render, so
 *  every round advances at the base pace. */
export function dwellFor(rounds: RCVRound[], round: number, reducedMotion: boolean): number {
  return roundReceivedTransfers(rounds, round) && !reducedMotion ? TRANSFER_DWELL_MS : BASE_DWELL_MS
}

/** Candidate names eliminated INTO `round` — i.e. flagged isEliminated on
 *  the previous round's entry. [] for round 0 (no previous round) and []
 *  when the previous round eliminated nobody. */
export function eliminatedIntoRound(rounds: RCVRound[], round: number): string[] {
  if (round <= 0) return []
  const prev = rounds[round - 1]
  if (!prev) return []
  return prev.candidates.filter((c) => c.isEliminated).map((c) => c.name)
}
