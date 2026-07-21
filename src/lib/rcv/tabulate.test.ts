import { describe, expect, it } from 'vitest'
import { OVERVOTE_TERMINATOR, type CVRBallotArtifact } from '@/types/elections'
import { decodeBallots } from './ballots'
import { ASSIGN_BLANK, ASSIGN_EXHAUSTED, ASSIGN_OVERVOTED, RCVTieError, tabulate } from './tabulate'

// A=idx0, B=1, C=2, D=3. One precinct is enough for tabulation tests.
function makeArtifact(patterns: number[][], counts: number[]): CVRBallotArtifact {
  return {
    formatVersion: 1, dateCode: '20241105', raceId: 'synth', title: 'SYNTH',
    candidates: ['A', 'B', 'C', 'D'], precincts: ['1101'], sovSuppressed: [],
    patterns, groups: patterns.flatMap((_, i) => [0, i, counts[i]]),
  }
}
const META = { raceId: 'synth', title: 'SYNTH', candidates: ['A', 'B', 'C', 'D'] }

// R1: A=40 B=30 C=20 D=10, blanks=5, overvote-at-1=3. Total 108.
// D eliminated R1 (D's 10 ballots: 6 → B, 4 exhaust).
// R2: A=40 B=36 C=20. C eliminated (C's 20: 12 → A, 5 → B, 3 overvote at next rank).
// R3: A=52 B=41. Stop (2 remain).
const ART = makeArtifact(
  [
    [0],                        // A only                    40
    [1],                        // B only                    30
    [2, 0],                     // C > A                     12
    [2, 1],                     // C > B                      5
    [2, OVERVOTE_TERMINATOR],   // C > overvote               3
    [3, 1],                     // D > B                      6
    [3],                        // D only                     4
    [],                         // blank                      5
    [OVERVOTE_TERMINATOR],      // overvote at rank 1         3
  ],
  [40, 30, 12, 5, 3, 6, 4, 5, 3],
)

describe('tabulate', () => {
  const out = tabulate(decodeBallots(ART), META)
  const r = out.contest.rounds

  it('runs to two finalists with the right round count and winner', () => {
    expect(out.contest.totalRounds).toBe(3)
    expect(out.contest.winner).toBe('A')
    expect(out.eliminationOrder).toEqual(['D', 'C'])
  })
  it('reproduces the bucket semantics', () => {
    expect(r[0]).toMatchObject({ continuingTotal: 100, exhausted: 0, overvotes: 3, blanks: 5 })
    expect(r[1]).toMatchObject({ continuingTotal: 96, exhausted: 4, overvotes: 3, blanks: 5 })
    expect(r[2]).toMatchObject({ continuingTotal: 93, exhausted: 4, overvotes: 6, blanks: 5 })
    // conservation ∀r
    for (const round of r) {
      expect(round.continuingTotal + round.exhausted + round.overvotes + round.blanks).toBe(108)
    }
  })
  it('emits every candidate in meta order in every round, with certified flag shape', () => {
    for (const round of r) expect(round.candidates.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D'])
    // D flagged on its LAST live round (R1), zeroed after with clean flags
    expect(r[0].candidates[3]).toMatchObject({ votes: 10, isEliminated: true })
    expect(r[1].candidates[3]).toMatchObject({ votes: 0, percentage: 0, transfer: 0, isEliminated: false, isLeader: false })
    expect(r.map((x) => x.candidates.filter((c) => c.isEliminated).length)).toEqual([1, 1, 0])
    expect(r.map((x) => x.candidates.filter((c) => c.isLeader).length)).toEqual([1, 1, 1])
  })
  it('computes transfer as the next-round delta and percentage with certified rounding', () => {
    expect(r[0].candidates.map((c) => c.transfer)).toEqual([0, 6, 0, -10])
    expect(r[1].candidates.map((c) => c.transfer)).toEqual([12, 5, -20, 0])
    expect(r[2].candidates.map((c) => c.transfer)).toEqual([0, 0, 0, 0])
    expect(r[0].candidates[0].percentage).toBe(0.4)
    expect(r[2].candidates[0].percentage).toBe(Math.round((52 / 93) * 10000) / 10000)
  })
  it('exposes per-round assignments for the lens layer', () => {
    expect(out.assignments).toHaveLength(3)
    const a1 = out.assignments[0].groups
    expect(a1[0]).toBe(0)               // [A] group sits with A
    expect(a1[7]).toBe(ASSIGN_BLANK)
    expect(a1[8]).toBe(ASSIGN_OVERVOTED)
    const a2 = out.assignments[1].groups
    expect(a2[5]).toBe(1)               // D>B advanced to B
    expect(a2[6]).toBe(ASSIGN_EXHAUSTED)
    const a3 = out.assignments[2].groups
    expect(a3[4]).toBe(ASSIGN_OVERVOTED) // C>overvote hit the terminator
  })
  it('throws RCVTieError on an unpinned minimum tie; tieOrder resolves it', () => {
    const tieArt = makeArtifact([[0], [1], [2], [3]], [10, 10, 5, 5])
    expect(() => tabulate(decodeBallots(tieArt), META)).toThrow(RCVTieError)
    const resolved = tabulate(decodeBallots(tieArt), META, { tieOrder: ['D'] })
    expect(resolved.eliminationOrder[0]).toBe('D')
  })
  it('struck candidates are removed before round 1; all-struck patterns exhaust at R1', () => {
    const s = tabulate(decodeBallots(ART), META, { struck: [0, 1] })   // strike A and B → C vs D
    expect(s.contest.totalRounds).toBe(1)
    expect(s.contest.winner).toBe('C')
    const r1 = s.contest.rounds[0]
    // [A]-only ×40 and [B]-only ×30 exhaust at R1 (valid marks — never blanks)
    expect(r1.exhausted).toBe(70)
    expect(r1.blanks).toBe(5)
    expect(r1.candidates.map((c) => c.name)).toEqual(['C', 'D'])   // struck rows absent
    expect(r1.continuingTotal + r1.exhausted + r1.overvotes + r1.blanks).toBe(108)
  })
  it('empty-input degeneracy', () => {
    const empty = makeArtifact([[]], [0])
    const e = tabulate(decodeBallots(empty), META)
    expect(e.contest.rounds).toHaveLength(1)
  })
})
