// src/components/charts/rcvFlow.ts
//
// Shared vote-transfer derivation + ribbon-path math for the RCV rounds
// chart (RCVRoundChart) and the all-rounds Sankey (RCVSankey). SF publishes
// no source→destination transfer data — every transfer here is DERIVED from
// round-over-round deltas, which is the ceiling of what SF's published
// round-summary report supports (docs/superpowers/specs/
// 2026-07-18-rcv-flow-animation-design.md). Ballot-level (CVR) transfer
// paths are permanently out of scope.
//
// Pairing note (found + fixed during extraction — see the implementation
// plan's "Resolved ambiguities" §3 for the conservation-of-votes proof):
// the candidate(s) whose votes explain `round`'s deltas from `prevRound`
// are the ones PREVROUND flagged `isEliminated` — a round's own flag
// describes who's eliminated STARTING NEXT round, not who was just
// redistributed into the round being viewed.
import type { RCVRound } from '@/types/elections'

/** Sink id for the "votes left the count entirely" bucket, matching
 *  RCVSankey's existing `__exhausted__` node convention. */
export const EXHAUSTED_SINK = '__exhausted__'

export interface VoteTransfer {
  /** Candidate name, or EXHAUSTED_SINK. */
  to: string
  amount: number
}

export interface RoundTransferResult {
  /** Candidate(s) whose votes explain this round's deltas (prevRound's
   *  isEliminated flag). Empty if prevRound eliminated nobody, or there's
   *  no prevRound. */
  eliminatedNames: string[]
  /** True when more than one candidate was eliminated entering this round —
   *  a data shape SF's rules allow (a legitimate batch-elimination
   *  optimization) but that never occurs in the shipped Nov 2024 data.
   *  Callers must render a MERGED bundle + label when true, never claim
   *  per-source precision. */
  isBatch: boolean
  /** Per-recipient transfers derived from round-over-round deltas, sorted
   *  descending by amount. Includes an EXHAUSTED_SINK entry when the
   *  round's exhausted-ballot count increased. A candidate flagged
   *  eliminated in THIS round (i.e. next round's source) is NOT skipped —
   *  they haven't zeroed out yet and can still show a legitimate gain. */
  transfers: VoteTransfer[]
}

/**
 * Derive this round's vote transfers from round-over-round deltas.
 *
 * Single-elimination rounds (100% of Nov 2024 SF RCV data) attribute
 * exactly: each candidate's gain, plus the exhausted-ballot increase, plus
 * untracked overvotes drift, accounts for the eliminated candidate's prior
 * votes. Batch-elimination rounds (never seen in shipped data, but
 * structurally possible — RCVCandidateRound.isEliminated is per-candidate,
 * not a round-level flag) still compute the same per-recipient deltas, but
 * `isBatch: true` tells callers not to claim any single eliminated
 * candidate as the source of a given transfer.
 */
export function computeRoundTransfers(
  round: RCVRound,
  prevRound: RCVRound | null,
): RoundTransferResult {
  if (!prevRound) {
    return { eliminatedNames: [], isBatch: false, transfers: [] }
  }

  const eliminatedEnteringThisRound = prevRound.candidates.filter((c) => c.isEliminated)
  if (eliminatedEnteringThisRound.length === 0) {
    return { eliminatedNames: [], isBatch: false, transfers: [] }
  }
  const isBatch = eliminatedEnteringThisRound.length > 1

  const transfers: VoteTransfer[] = []
  for (const curr of round.candidates) {
    const prev = prevRound.candidates.find((p) => p.name === curr.name)
    if (prev && curr.votes > prev.votes) {
      transfers.push({ to: curr.name, amount: curr.votes - prev.votes })
    }
  }

  const exhaustedDelta = round.exhausted - prevRound.exhausted
  if (exhaustedDelta > 0) {
    transfers.push({ to: EXHAUSTED_SINK, amount: exhaustedDelta })
  }

  transfers.sort((a, b) => b.amount - a.amount)

  return {
    eliminatedNames: eliminatedEnteringThisRound.map((c) => c.name),
    isBatch,
    transfers,
  }
}

export interface RibbonPoint {
  x: number
  y: number
}

/**
 * Cubic-bezier SVG path between two points, horizontally symmetric around
 * their midpoint x. Lifted verbatim from RCVSankey's original `linkPath`
 * (M(x0,y0) C(mx,y0) (mx,y1) (x1,y1), mx=(x0+x1)/2) so the all-rounds
 * Sankey and the per-round flow ribbons share one path implementation.
 */
export function ribbonPath(source: RibbonPoint, target: RibbonPoint): string {
  const mx = (source.x + target.x) / 2
  return `M${source.x},${source.y} C${mx},${source.y} ${mx},${target.y} ${target.x},${target.y}`
}
