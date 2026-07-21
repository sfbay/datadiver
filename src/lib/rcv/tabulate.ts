// Relative import (not `@/`): scripts/build-cvr-ballots.ts imports this module
// under `npx tsx`, which resolves no tsconfig path aliases (alerts-lib precedent).
import type { RCVCandidateRound, RCVContest, RCVRound } from '../../types/elections'
import { OVERVOTE_TERMINATOR } from '../../types/elections'
import type { DecodedBallots } from './ballots'

export const ASSIGN_EXHAUSTED = -1
export const ASSIGN_OVERVOTED = -2
export const ASSIGN_BLANK = -3

export class RCVTieError extends Error {
  round: number
  tied: string[]
  constructor(round: number, tied: string[]) {
    super(`Elimination tie in round ${round}: ${tied.join(', ')} — pin the certified order in TIE_ORDER_PINS`)
    this.name = 'RCVTieError'
    this.round = round
    this.tied = tied
  }
}

export interface TabulateOptions {
  /** Eliminate-first order for exact minimum-vote ties. Absent + tie → throw. */
  tieOrder?: readonly string[]
  /** Candidate indices removed before round 1 (WHAT-IF). Default []. */
  struck?: readonly number[]
}

export interface RoundAssignment {
  round: number
  /** groupIdx → candidateIdx, or ASSIGN_* sentinel. Snapshot per round. */
  groups: Int16Array
}

export interface TabulationOutput {
  contest: RCVContest
  assignments: RoundAssignment[]
  eliminationOrder: string[]
}

export function tabulate(
  ballots: DecodedBallots,
  meta: { raceId: string; title: string; candidates: string[] },
  options: TabulateOptions = {},
): TabulationOutput {
  const n = ballots.candidateCount
  const struck = new Set(options.struck ?? [])
  const alive: boolean[] = Array.from({ length: n }, (_, i) => !struck.has(i))
  const nGroups = ballots.groupCount.length
  const cursor = new Int32Array(nGroups)
  const assign = new Int16Array(nGroups)

  // Advance a group's cursor to its highest-ranked continuing candidate.
  // Overvote terminators exhaust permanently regardless of roster (Charter:
  // a property of the ballot as cast). Blank = empty pattern; a pattern
  // whose every candidate is dead exhausts (it HAD valid marks — not blank).
  const advance = (g: number): number => {
    const pat = ballots.groupPattern[g]
    const start = ballots.patternStart[pat]
    const end = ballots.patternStart[pat + 1]
    if (end === start) return ASSIGN_BLANK
    let i = start + cursor[g]
    while (i < end) {
      const v = ballots.patternFlat[i]
      if (v === OVERVOTE_TERMINATOR) { cursor[g] = i - start; return ASSIGN_OVERVOTED }
      if (alive[v]) { cursor[g] = i - start; return v }
      i++
    }
    cursor[g] = end - start
    return ASSIGN_EXHAUSTED
  }
  for (let g = 0; g < nGroups; g++) assign[g] = advance(g)

  const rounds: RCVRound[] = []
  const assignments: RoundAssignment[] = []
  const eliminationOrder: string[] = []
  const rosterIdx = Array.from({ length: n }, (_, i) => i).filter((i) => !struck.has(i))

  for (;;) {
    const roundNum = rounds.length + 1
    const votes = new Array<number>(n).fill(0)
    let exhausted = 0
    let overvoted = 0
    let blank = 0
    for (let g = 0; g < nGroups; g++) {
      const a = assign[g]
      const c = ballots.groupCount[g]
      if (a >= 0) votes[a] += c
      else if (a === ASSIGN_EXHAUSTED) exhausted += c
      else if (a === ASSIGN_OVERVOTED) overvoted += c
      else blank += c
    }
    const continuingTotal = votes.reduce((s, v) => s + v, 0)
    const aliveIdx = rosterIdx.filter((i) => alive[i])

    // isLeader is stamped AFTER the loop: in the certified round reports it
    // marks the EVENTUAL WINNER's row in every round, not the round's vote
    // leader (SF's pages flag the winner's column throughout — D11 2024:
    // Chen trails Lai R1–R5 yet carries the flag; D5 2024 same shape.
    // Gate A pins this against all 10 committed races).
    const rows: RCVCandidateRound[] = rosterIdx.map((i) => ({
      name: meta.candidates[i],
      votes: votes[i],
      percentage: continuingTotal > 0 ? Math.round((votes[i] / continuingTotal) * 10000) / 10000 : 0,
      transfer: 0,
      isEliminated: false,
      isLeader: false,
    }))
    rounds.push({ round: roundNum, candidates: rows, continuingTotal, exhausted, overvotes: overvoted, blanks: blank })
    assignments.push({ round: roundNum, groups: Int16Array.from(assign) })

    // Two terminal states: two finalists remain, or NO ballot still counts —
    // with zero continuing votes no elimination is derivable (an all-zero
    // "tie" is degeneracy, not a tie; RCVTieError is reserved for real
    // minimum-vote ties with ballots behind them).
    if (aliveIdx.length <= 2 || continuingTotal === 0) break

    let min = Infinity
    for (const i of aliveIdx) if (votes[i] < min) min = votes[i]
    const tied = aliveIdx.filter((i) => votes[i] === min)
    let elim: number
    if (tied.length === 1) {
      elim = tied[0]
    } else {
      const tiedNames = tied.map((i) => meta.candidates[i])
      const order = options.tieOrder ?? []
      const pick = tied
        .filter((i) => order.includes(meta.candidates[i]))
        .sort((a, b) => order.indexOf(meta.candidates[a]) - order.indexOf(meta.candidates[b]))[0]
      if (pick === undefined) throw new RCVTieError(roundNum, tiedNames)
      elim = pick
    }
    const row = rows[rosterIdx.indexOf(elim)]
    row.isEliminated = true
    eliminationOrder.push(meta.candidates[elim])
    alive[elim] = false
    for (let g = 0; g < nGroups; g++) {
      if (assign[g] === elim) assign[g] = advance(g)
    }
  }

  // transfer[r] = votes[r+1] − votes[r]; final round stays 0.
  for (let r = 0; r < rounds.length - 1; r++) {
    const cur = rounds[r].candidates
    const next = rounds[r + 1].candidates
    for (let i = 0; i < cur.length; i++) cur[i].transfer = next[i].votes - cur[i].votes
  }

  const last = rounds[rounds.length - 1]
  const winnerRow = [...last.candidates].sort((a, b) => b.votes - a.votes)[0]
  if (winnerRow && winnerRow.votes > 0) {
    for (const round of rounds) {
      for (const row of round.candidates) row.isLeader = row.name === winnerRow.name
    }
  }
  const contest: RCVContest = {
    raceId: meta.raceId,
    title: meta.title,
    totalRounds: rounds.length,
    rounds,
    winner: winnerRow?.name ?? '',
  }
  return { contest, assignments, eliminationOrder }
}
