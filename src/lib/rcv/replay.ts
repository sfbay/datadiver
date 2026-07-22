import type { CVRBallotArtifact } from '@/types/elections'
import type { DecodedBallots } from './ballots'
import { ASSIGN_BLANK, ASSIGN_EXHAUSTED, ASSIGN_OVERVOTED, type RoundAssignment, type TabulationOutput } from './tabulate'

export interface PrecinctRoundState {
  tallies: Int32Array
  exhausted: number
  overvoted: number
  blank: number
  /** candidateIdx of the round-state leader, or -1 when nothing continues. */
  leader: number
  leaderShare: number
}

/** Per-precinct tallies/leader for ONE round's assignment snapshot. */
export function roundPrecinctStates(
  ballots: DecodedBallots,
  ra: RoundAssignment,
): PrecinctRoundState[] {
  const states: PrecinctRoundState[] = Array.from({ length: ballots.precinctCount }, () => ({
    tallies: new Int32Array(ballots.candidateCount),
    exhausted: 0, overvoted: 0, blank: 0, leader: -1, leaderShare: 0,
  }))
  for (let g = 0; g < ballots.groupCount.length; g++) {
    const st = states[ballots.groupPrecinct[g]]
    const a = ra.groups[g]
    const c = ballots.groupCount[g]
    if (a >= 0) st.tallies[a] += c
    else if (a === ASSIGN_EXHAUSTED) st.exhausted += c
    else if (a === ASSIGN_OVERVOTED) st.overvoted += c
    else if (a === ASSIGN_BLANK) st.blank += c
  }
  for (const st of states) {
    let max = 0, lead = -1, continuing = 0
    for (let i = 0; i < st.tallies.length; i++) {
      const v = st.tallies[i]
      continuing += v
      if (v > max) { max = v; lead = i }
    }
    st.leader = lead
    st.leaderShare = continuing > 0 && lead >= 0 ? st.tallies[lead] / continuing : 0
  }
  return states
}

/** [roundIdx][precinctIdx]. One pass over groups per round (~5–10ms for
 *  mayor's 14×152k), computed once per race and memoized at the hook layer.
 *  Accepts anything carrying assignments — WhatIfResult qualifies. */
export function computeReplayRounds(
  ballots: DecodedBallots,
  tab: Pick<TabulationOutput, 'assignments'>,
): PrecinctRoundState[][] {
  return tab.assignments.map((ra) => roundPrecinctStates(ballots, ra))
}

export interface ReplayPaintRow {
  votes: Record<string, number>
  /** CONTINUING ballots in this precinct this round — leader share reads
   *  "of ballots still counting", the certified percentage denominator. */
  total: number
  /** Ballots that stopped counting SINCE round 1 ÷ round-1 continuing —
   *  ≡ 0 at round 1 by construction; blanks excluded (they never started). */
  drainShare: number
  /** Leader changed vs the previous round (false at round 1). */
  flipped: boolean
}

export function replayPaintRows(
  states: PrecinctRoundState[][],
  roundIdx: number,
  artifact: CVRBallotArtifact,
): Record<string, ReplayPaintRow> {
  const base = states[0]
  const cur = states[roundIdx]
  const prev = roundIdx > 0 ? states[roundIdx - 1] : null
  const rows: Record<string, ReplayPaintRow> = {}
  for (let p = 0; p < artifact.precincts.length; p++) {
    const st = cur[p]
    const b = base[p]
    const votes: Record<string, number> = {}
    let total = 0
    for (let i = 0; i < st.tallies.length; i++) {
      const v = st.tallies[i]
      total += v
      if (v > 0) votes[artifact.candidates[i]] = v
    }
    let baseContinuing = 0
    for (let i = 0; i < b.tallies.length; i++) baseContinuing += b.tallies[i]
    const drained = st.exhausted - b.exhausted + st.overvoted - b.overvoted
    rows[artifact.precincts[p]] = {
      votes,
      total,
      drainShare: baseContinuing > 0 ? Math.min(1, drained / baseContinuing) : 0,
      flipped: prev ? prev[p].leader !== st.leader : false,
    }
  }
  return rows
}
