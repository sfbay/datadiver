import { describe, expect, it } from 'vitest'
import { OVERVOTE_TERMINATOR, type CVRBallotArtifact } from '@/types/elections'
import { decodeBallots } from './ballots'
import { tabulate } from './tabulate'
import { computeReplayRounds, replayPaintRows, type PrecinctRoundState } from './replay'

// Same 4-candidate synthetic contest as tabulate.test.ts's ART fixture
// (R1: A=40 B=30 C=20 D=10, blanks=5, overvotes=3, total=108; D eliminated
// R1, C eliminated R2, A wins R3 52-41) — but every pattern's ballots are
// now split across TWO precincts ('1101', '1102') so per-precinct
// invariants are meaningful. Citywide per-pattern totals are IDENTICAL to
// tabulate.test.ts's ART ([40,30,12,5,3,6,4,5,3]); only the precinct
// attribution differs. '1102' is engineered to carry a genuine round-2
// leader FLIP (C→B) so invariant 4 has a true case, not just false cases.
//
// Pattern → (precinct 1101 count, precinct 1102 count):
//   0 [A]                  : (40, 0)
//   1 [B]                  : (25, 5)
//   2 [C,A]                : (4, 8)
//   3 [C,B]                : (5, 0)
//   4 [C,overvote]         : (3, 0)
//   5 [D,B]                : (0, 6)
//   6 [D]                  : (4, 0)
//   7 [] (blank)           : (5, 0)
//   8 [overvote]           : (3, 0)
// Column sums: A 40+0=40, B 25+5=30, C (4+5+3)+8=20, D 4+6=10 — matches.

const ART: CVRBallotArtifact = {
  formatVersion: 1,
  dateCode: '20241105',
  raceId: 'synth',
  title: 'SYNTH',
  candidates: ['A', 'B', 'C', 'D'],
  precincts: ['1101', '1102'],
  sovSuppressed: [],
  patterns: [
    [0], // A only
    [1], // B only
    [2, 0], // C > A
    [2, 1], // C > B
    [2, OVERVOTE_TERMINATOR], // C > overvote
    [3, 1], // D > B
    [3], // D only
    [], // blank
    [OVERVOTE_TERMINATOR], // overvote at rank 1
  ],
  groups: [
    0, 0, 40,
    0, 1, 25,
    0, 2, 4,
    0, 3, 5,
    0, 4, 3,
    0, 6, 4,
    0, 7, 5,
    0, 8, 3,
    1, 1, 5,
    1, 2, 8,
    1, 5, 6,
  ],
}
const META = { raceId: 'synth', title: 'SYNTH', candidates: ['A', 'B', 'C', 'D'] }

const ballots = decodeBallots(ART)
const out = tabulate(ballots, META)
const states = computeReplayRounds(ballots, out)

// idx0 = precinct '1101' ("p0"), idx1 = precinct '1102' ("P").
//
// Hand-derived per-precinct tallies (verified against the citywide contract
// each round: p0 + P columns sum to tabulate.test.ts's certified totals):
//
// Round 1 (index 0), before any elimination:
//   p0: pattern0 A=40, pattern1 B=25, pattern2 C=4, pattern3 C=5,
//       pattern4 C=3, pattern6 D=4, pattern7 blank=5, pattern8 overvote=3
//       → A=40 B=25 C=12 D=4, exhausted=0 overvoted=3 blank=5 (grand=89)
//   P:  pattern1 B=5, pattern2 C=8, pattern5 D=6
//       → A=0 B=5 C=8 D=6, exhausted=0 overvoted=0 blank=0 (grand=19)
//   leaders: p0=A(40), P=C(8)
//
// Round 2 (index 1), D eliminated (pattern5 D>B advances to B; pattern6 D
// advances to EXHAUSTED):
//   p0: pattern6's 4 → exhausted. A=40 B=25 C=12 D=0, exhausted=4
//       overvoted=3 blank=5 (grand=89)
//   P:  pattern5's 6 → B. A=0 B=11 C=8 D=0, exhausted=0 overvoted=0
//       blank=0 (grand=19)
//   leaders: p0=A(40) [unchanged], P=B(11) [was C → FLIPPED]
//
// Round 3 (index 2), C eliminated (pattern2 C>A advances to A; pattern3
// C>B advances to B; pattern4 C>overvote advances to OVERVOTED):
//   p0: pattern2's 4 → A, pattern3's 5 → B, pattern4's 3 → overvoted.
//       A=44 B=30 C=0 D=0, exhausted=4 overvoted=6 blank=5 (grand=89)
//   P:  pattern2's 8 → A. A=8 B=11 C=0 D=0, exhausted=0 overvoted=0
//       blank=0 (grand=19)
//   leaders: p0=A(44) [unchanged], P=B(11) [unchanged from round 2]

describe('computeReplayRounds', () => {
  it('tensor column-sum: Σ_precincts tallies[r][p][c] === citywide certified round total, ∀ round, ∀ candidate', () => {
    expect(states).toHaveLength(out.contest.rounds.length)
    for (let r = 0; r < out.contest.rounds.length; r++) {
      const round = out.contest.rounds[r]
      for (let c = 0; c < ART.candidates.length; c++) {
        const name = ART.candidates[c]
        const citywideVotes = round.candidates.find((x) => x.name === name)!.votes
        const precinctSum = states[r].reduce((s, st) => s + st.tallies[c], 0)
        expect(precinctSum).toBe(citywideVotes)
      }
    }
  })

  it('per-precinct grand total (Σtallies + exhausted + overvoted + blank) is constant across rounds', () => {
    const grandTotal = (st: PrecinctRoundState) =>
      Array.from(st.tallies).reduce((s, v) => s + v, 0) + st.exhausted + st.overvoted + st.blank
    for (let r = 0; r < states.length; r++) {
      expect(grandTotal(states[r][0])).toBe(89) // precinct '1101'
      expect(grandTotal(states[r][1])).toBe(19) // precinct '1102'
    }
  })

  it('reproduces the hand-derived per-precinct tallies and leaders each round', () => {
    expect(Array.from(states[0][0].tallies)).toEqual([40, 25, 12, 4])
    expect(states[0][0]).toMatchObject({ exhausted: 0, overvoted: 3, blank: 5, leader: 0 })
    expect(Array.from(states[0][1].tallies)).toEqual([0, 5, 8, 6])
    expect(states[0][1]).toMatchObject({ exhausted: 0, overvoted: 0, blank: 0, leader: 2 })

    expect(Array.from(states[1][0].tallies)).toEqual([40, 25, 12, 0])
    expect(states[1][0]).toMatchObject({ exhausted: 4, overvoted: 3, blank: 5, leader: 0 })
    expect(Array.from(states[1][1].tallies)).toEqual([0, 11, 8, 0])
    expect(states[1][1]).toMatchObject({ exhausted: 0, overvoted: 0, blank: 0, leader: 1 })

    expect(Array.from(states[2][0].tallies)).toEqual([44, 30, 0, 0])
    expect(states[2][0]).toMatchObject({ exhausted: 4, overvoted: 6, blank: 5, leader: 0 })
    expect(Array.from(states[2][1].tallies)).toEqual([8, 11, 0, 0])
    expect(states[2][1]).toMatchObject({ exhausted: 0, overvoted: 0, blank: 0, leader: 1 })

    // leaderShare = tallies[leader] / Σtallies (continuing), NOT the grand total
    expect(states[0][0].leaderShare).toBe(40 / 81)
    expect(states[0][1].leaderShare).toBe(8 / 19)
    expect(states[1][0].leaderShare).toBe(40 / 77)
    expect(states[1][1].leaderShare).toBe(11 / 19)
    expect(states[2][0].leaderShare).toBe(44 / 74)
    expect(states[2][1].leaderShare).toBe(11 / 19)
  })
})

describe('replayPaintRows', () => {
  it('round 1 (roundIdx 0): drainShare ≡ 0, flipped ≡ false, votes keyed by name with zero-vote candidates omitted', () => {
    const rows = replayPaintRows(states, 0, ART)
    expect(rows['1101']).toEqual({ votes: { A: 40, B: 25, C: 12, D: 4 }, total: 81, drainShare: 0, flipped: false })
    expect(rows['1102']).toEqual({ votes: { B: 5, C: 8, D: 6 }, total: 19, drainShare: 0, flipped: false })
  })

  it('round 2 (roundIdx 1): drainShare = (exh[r]-exh[0] + ov[r]-ov[0]) / continuing[0]; flipped true only for the leader-change precinct', () => {
    const rows = replayPaintRows(states, 1, ART)
    // 1101: exhausted 0→4, overvoted 3→3 (unchanged) ⇒ drained = (4-0)+(3-3) = 4;
    // round-1 continuing (baseContinuing) = 81 ⇒ drainShare = 4/81.
    expect(rows['1101']).toEqual({ votes: { A: 40, B: 25, C: 12 }, total: 77, drainShare: 4 / 81, flipped: false })
    // 1102: exhausted 0→0, overvoted 0→0 ⇒ drained = 0 ⇒ drainShare = 0,
    // but the leader flips C(round1)→B(round2).
    expect(rows['1102']).toEqual({ votes: { B: 11, C: 8 }, total: 19, drainShare: 0, flipped: true })
  })

  it('round 3 (roundIdx 2): drainShare compounds correctly; leader unchanged from round 2 in both precincts', () => {
    const rows = replayPaintRows(states, 2, ART)
    // 1101: exhausted 0→4, overvoted 3→6 ⇒ drained = (4-0)+(6-3) = 7 ⇒ drainShare = 7/81.
    expect(rows['1101']).toEqual({ votes: { A: 44, B: 30 }, total: 74, drainShare: 7 / 81, flipped: false })
    expect(rows['1102']).toEqual({ votes: { A: 8, B: 11 }, total: 19, drainShare: 0, flipped: false })
  })
})
