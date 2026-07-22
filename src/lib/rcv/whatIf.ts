// WHAT-IF lens math — strike candidates and re-run the same ballots.
//
// A thin orchestrator over the certified-proven tabulate() kernel: the
// kernel is NEVER modified here (the standing reconciliation test keeps
// proving the exact code this file calls). Counterfactual ties — which the
// certified election never had — are resolved by the deterministic
// disclosed ladder via a catch-retry loop: run, catch RCVTieError, record
// it, append the ladder's pick to tieOrder, rerun. Each caught tie appends
// exactly one name (the loop terminates in ≤ candidateCount iterations);
// reruns are deterministic, so earlier resolved ties replay identically —
// their picks precede later ones in tieOrder, matching tabulate's
// earliest-in-order-wins rule. A tie fully covered by earlier appends
// cannot under-record: an appended name is eliminated at its own tie
// round, so it can never appear in a later tie.
import type { RCVContest } from '../../types/elections'
import type { DecodedBallots } from './ballots'
import { RCVTieError, tabulate, type RoundAssignment, type TabulationOutput } from './tabulate'
import { roundPrecinctStates, type PrecinctRoundState } from './replay'

export interface WhatIfMeta {
  raceId: string
  title: string
  candidates: string[]
  /** Artifact precinct labels, parallel to DecodedBallots precinct indices —
   *  changedPrecincts speaks labels, and DecodedBallots is label-free by
   *  design (spec §3.5 signature amendment, plan adjudication 1). */
  precincts: string[]
}

export interface WhatIfResult {
  contest: RCVContest
  assignments: RoundAssignment[]
  finalByPrecinct: PrecinctRoundState[]
  /** Labels whose FINAL-round leader differs from the certified final round.
   *  UNFILTERED (all 514 incl. sovSuppressed) — the view intersects with its
   *  painted set before drawing outlines (6 of mayor−Lurie's 356 changed
   *  precincts are SOV-withheld and must stay unmarked on the map). */
  changedPrecincts: string[]
  winnerChanged: boolean
  /** Non-empty → the banner's tie-disclosure line renders. */
  tiesBroken: { round: number; tied: string[] }[]
}

/** Deterministic disclosed tie ladder (spec §3.5): the candidate eliminated
 *  earlier in the REAL election goes first — baseline finalists never appear
 *  in eliminationOrder, so they rank Infinity, which also encodes "a
 *  real-election finalist survives a non-finalist"; then fewer certified
 *  round-1 votes; then artifact order. Exported for direct unit testing
 *  (the real Nov 2024 data reaches only rung 1 — probe-verified). */
export function ladderPick(
  tiedIdx: readonly number[],
  meta: Pick<WhatIfMeta, 'candidates'>,
  baseline: TabulationOutput,
): number {
  const elimRank = new Map(baseline.eliminationOrder.map((name, i) => [name, i]))
  const r1Votes = new Map(baseline.contest.rounds[0].candidates.map((c) => [c.name, c.votes]))
  return [...tiedIdx].sort((a, b) => {
    const ea = elimRank.get(meta.candidates[a]) ?? Infinity
    const eb = elimRank.get(meta.candidates[b]) ?? Infinity
    if (ea !== eb) return ea - eb
    const va = r1Votes.get(meta.candidates[a]) ?? 0
    const vb = r1Votes.get(meta.candidates[b]) ?? 0
    if (va !== vb) return va - vb
    return a - b
  })[0]
}

export function tabulateWhatIf(
  ballots: DecodedBallots,
  meta: WhatIfMeta,
  struck: readonly number[],
  baseline: TabulationOutput,
): WhatIfResult {
  const tiesBroken: { round: number; tied: string[] }[] = []
  const tieOrder: string[] = []
  let out: TabulationOutput
  for (;;) {
    try {
      out = tabulate(
        ballots,
        { raceId: meta.raceId, title: meta.title, candidates: meta.candidates },
        { struck, tieOrder },
      )
      break
    } catch (err) {
      if (!(err instanceof RCVTieError)) throw err
      tiesBroken.push({ round: err.round, tied: err.tied })
      const tiedIdx = err.tied.map((name) => meta.candidates.indexOf(name))
      tieOrder.push(meta.candidates[ladderPick(tiedIdx, meta, baseline)])
    }
  }

  const baseFinal = roundPrecinctStates(ballots, baseline.assignments[baseline.assignments.length - 1])
  const finalByPrecinct = roundPrecinctStates(ballots, out.assignments[out.assignments.length - 1])
  const changedPrecincts: string[] = []
  for (let p = 0; p < ballots.precinctCount; p++) {
    if (baseFinal[p].leader !== finalByPrecinct[p].leader) changedPrecincts.push(meta.precincts[p])
  }
  return {
    contest: out.contest,
    assignments: out.assignments,
    finalByPrecinct,
    changedPrecincts,
    winnerChanged: out.contest.winner !== baseline.contest.winner,
    tiesBroken,
  }
}
